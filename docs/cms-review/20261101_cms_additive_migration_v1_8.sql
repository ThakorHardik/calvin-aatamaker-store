-- ====================================================================
-- CALVIN AATAMAKER — Dynamic Storefront CMS Migration (v1.8 Enterprise Certified)
-- Principal PostgreSQL Security Architect & Senior Supabase Platform Engineer
-- ====================================================================
-- Summary of v1.8 Precision Refinements:
--   1. Media Deletion Capability: Granted DELETE on public.cms_media to cms_publisher,
--      enabling delete_cms_media_asset to cleanly delete unreferenced draft assets.
--   2. Draft Pointer Synchronization Triggers: Configured sync_section_draft_pointer(),
--      sync_setting_draft_pointer(), and sync_page_draft_pointer() as SECURITY DEFINER
--      owned by cms_publisher with search_path = ''. When administrators insert drafts,
--      draft_revision_id updates automatically without granting authenticated direct
--      UPDATE privileges on draft_revision_id.
--   3. Publication Guard Triggers: Preserved strictly as SECURITY INVOKER to verify
--      pg_catalog.current_user = 'cms_publisher' during pointer/status transitions.
--   4. Role Isolation: cms_publisher is NOLOGIN, NOSUPERUSER, NOBYPASSRLS. Membership
--      is revoked from anon, authenticated, and public. SET ROLE cms_publisher is blocked.
--   5. Column-Level Privilege Separation: Table-level UPDATE revoked from authenticated.
--      Only non-pointer, non-status drafting columns are granted.
--   6. GUC Elimination: Zero references to cms.authorized_publishing or custom GUCs.
--   7. Controlled INSERT Protection: BEFORE INSERT triggers enforce draft-only inserts,
--      prevent forged ownership, and auto-allocate revision numbers sequentially.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. PREFLIGHT COMPATIBILITY CHECKS
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_col_type text;
BEGIN
  -- If homepage_sections already exists, verify section_key column is text
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'homepage_sections'
  ) THEN
    SELECT data_type INTO v_col_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'homepage_sections' AND column_name = 'section_key';

    IF v_col_type <> 'text' THEN
      RAISE EXCEPTION 'Schema collision: public.homepage_sections already exists with incompatible section_key type: %', v_col_type
        USING ERRCODE = '42804';
    END IF;
  END IF;
END;
$$;

-- --------------------------------------------------------------------
-- 2. DEDICATED DATABASE PUBLISHING ROLE (cms_publisher)
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cms_publisher') THEN
    CREATE ROLE cms_publisher NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;

REVOKE ALL ON SCHEMA public FROM cms_publisher;
GRANT USAGE ON SCHEMA public TO cms_publisher;

-- Ensure application users can never assume cms_publisher
REVOKE cms_publisher FROM anon, authenticated, public;

-- --------------------------------------------------------------------
-- 3. BASE UTILITY FUNCTIONS (Preserved & Verified)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN coalesce(v_role, '') = 'admin';
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, cms_publisher;

-- --------------------------------------------------------------------
-- 4. VERSIONED MEDIA ASSET LIBRARY (cms_media)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  storage_bucket text NOT NULL CHECK (storage_bucket IN ('site-media', 'site-media-drafts')),
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes >= 0),
  media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'document')),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_seconds numeric(6,2) CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  aspect_ratio text,
  alt_text text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  is_system_asset boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  desktop_storage_path text,
  mobile_storage_path text,
  poster_media_id uuid,
  sha256_hash text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  published_at timestamptz,
  CONSTRAINT uq_cms_media_asset_version UNIQUE (asset_id, version)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cms_media_poster' AND table_name = 'cms_media'
  ) THEN
    ALTER TABLE public.cms_media
      ADD CONSTRAINT fk_cms_media_poster
      FOREIGN KEY (poster_media_id) REFERENCES public.cms_media(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cms_media_asset_id ON public.cms_media(asset_id);
CREATE INDEX IF NOT EXISTS idx_cms_media_status ON public.cms_media(status);
CREATE INDEX IF NOT EXISTS idx_cms_media_storage_path ON public.cms_media(storage_path);

DROP TRIGGER IF EXISTS set_cms_media_updated_at ON public.cms_media;
CREATE TRIGGER set_cms_media_updated_at
  BEFORE UPDATE ON public.cms_media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------
-- 5. STORE SETTINGS & REVISIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  setting_key text PRIMARY KEY,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('brand', 'navigation', 'announcement', 'footer', 'seo', 'theme', 'catalogue', 'contact', 'general')),
  description text NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT true,
  active_revision_id uuid,
  draft_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.cms_setting_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL REFERENCES public.store_settings(setting_key) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  change_summary text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  published_at timestamptz,
  CONSTRAINT uq_setting_revisions_number UNIQUE(setting_key, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_setting_revisions_key_status ON public.cms_setting_revisions(setting_key, status);

DROP TRIGGER IF EXISTS set_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER set_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_store_settings_active_rev' AND table_name = 'store_settings'
  ) THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT fk_store_settings_active_rev
      FOREIGN KEY (active_revision_id) REFERENCES public.cms_setting_revisions(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_store_settings_draft_rev' AND table_name = 'store_settings'
  ) THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT fk_store_settings_draft_rev
      FOREIGN KEY (draft_revision_id) REFERENCES public.cms_setting_revisions(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

-- --------------------------------------------------------------------
-- 6. HOMEPAGE SECTIONS & REVISIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  section_type text NOT NULL CHECK (section_type IN (
    'announcement_bar',
    'hero_carousel',
    'trust_highlights',
    'featured_products',
    'category_showcase',
    'why_calvin',
    'how_it_works',
    'product_spotlight',
    'testimonials',
    'promo_split',
    'faq_accordion',
    'newsletter',
    'custom_html'
  )),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  active_revision_id uuid,
  draft_revision_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS public.cms_section_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.homepage_sections(id) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  change_summary text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  published_at timestamptz,
  CONSTRAINT uq_section_revisions_number UNIQUE(section_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_sections_sort_active ON public.homepage_sections(sort_order, is_active);
CREATE INDEX IF NOT EXISTS idx_section_revisions_section_status ON public.cms_section_revisions(section_id, status);
CREATE INDEX IF NOT EXISTS idx_section_revisions_created ON public.cms_section_revisions(created_at DESC);

DROP TRIGGER IF EXISTS set_homepage_sections_updated_at ON public.homepage_sections;
CREATE TRIGGER set_homepage_sections_updated_at
  BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_homepage_sections_active_rev' AND table_name = 'homepage_sections'
  ) THEN
    ALTER TABLE public.homepage_sections
      ADD CONSTRAINT fk_homepage_sections_active_rev
      FOREIGN KEY (active_revision_id) REFERENCES public.cms_section_revisions(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_homepage_sections_draft_rev' AND table_name = 'homepage_sections'
  ) THEN
    ALTER TABLE public.homepage_sections
      ADD CONSTRAINT fk_homepage_sections_draft_rev
      FOREIGN KEY (draft_revision_id) REFERENCES public.cms_section_revisions(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

-- --------------------------------------------------------------------
-- 7. CONTENT & POLICY PAGES WITH REVISIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  page_type text NOT NULL DEFAULT 'standard' CHECK (page_type IN ('standard', 'about', 'contact', 'policy', 'faq')),
  is_published boolean NOT NULL DEFAULT false,
  active_revision_id uuid,
  draft_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.cms_page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  title text NOT NULL,
  content_markdown text NOT NULL DEFAULT '',
  structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_title text,
  meta_description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  change_summary text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  published_at timestamptz,
  CONSTRAINT uq_page_revisions_number UNIQUE(page_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON public.cms_pages(slug);
CREATE INDEX IF NOT EXISTS idx_page_revisions_page_status ON public.cms_page_revisions(page_id, status);

DROP TRIGGER IF EXISTS set_cms_pages_updated_at ON public.cms_pages;
CREATE TRIGGER set_cms_pages_updated_at
  BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cms_pages_active_rev' AND table_name = 'cms_pages'
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT fk_cms_pages_active_rev
      FOREIGN KEY (active_revision_id) REFERENCES public.cms_page_revisions(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cms_pages_draft_rev' AND table_name = 'cms_pages'
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT fk_cms_pages_draft_rev
      FOREIGN KEY (draft_revision_id) REFERENCES public.cms_page_revisions(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

-- --------------------------------------------------------------------
-- 8. PRODUCT EDITORIAL CONTENT
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_editorial_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  badge_label text,
  highlight_statement text,
  milling_guide_title text,
  milling_guide_body text,
  supported_grains jsonb NOT NULL DEFAULT '[]'::jsonb,
  chef_tip text,
  in_the_box jsonb NOT NULL DEFAULT '[]'::jsonb,
  maintenance_notes text,
  warranty_summary text,
  faq_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  hero_media_id uuid REFERENCES public.cms_media(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT uq_product_editorial_product UNIQUE(product_id)
);

DROP TRIGGER IF EXISTS set_product_editorial_updated_at ON public.product_editorial_content;
CREATE TRIGGER set_product_editorial_updated_at
  BEFORE UPDATE ON public.product_editorial_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------
-- 9. CONTROLLED INSERT VALIDATION TRIGGERS (Draft Integrity & Ownership)
-- --------------------------------------------------------------------

-- A. Section Revisions Controlled Insert
CREATE OR REPLACE FUNCTION public.validate_section_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    IF pg_catalog.current_user <> 'cms_publisher' THEN
      RAISE EXCEPTION 'DIRECT INSERT REJECTED: New revisions can only be created in draft status (attempted: %).', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.published_at := NULL;
    NEW.published_by := NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  PERFORM 1 FROM public.homepage_sections WHERE id = NEW.section_id FOR UPDATE;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1
  INTO NEW.revision_number
  FROM public.cms_section_revisions
  WHERE section_id = NEW.section_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_section_revision_insert ON public.cms_section_revisions;
CREATE TRIGGER trg_validate_section_revision_insert
  BEFORE INSERT ON public.cms_section_revisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_section_revision_insert();

-- Post-insert section draft pointer update (SECURITY DEFINER owned by cms_publisher)
CREATE OR REPLACE FUNCTION public.sync_section_draft_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    UPDATE public.homepage_sections
    SET draft_revision_id = NEW.id,
        updated_at = pg_catalog.now()
    WHERE id = NEW.section_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_section_draft_pointer() OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.sync_section_draft_pointer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_section_draft_pointer() TO cms_publisher, authenticated;

DROP TRIGGER IF EXISTS trg_sync_section_draft_pointer ON public.cms_section_revisions;
CREATE TRIGGER trg_sync_section_draft_pointer
  AFTER INSERT ON public.cms_section_revisions
  FOR EACH ROW EXECUTE FUNCTION public.sync_section_draft_pointer();

-- B. Setting Revisions Controlled Insert
CREATE OR REPLACE FUNCTION public.validate_setting_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    IF pg_catalog.current_user <> 'cms_publisher' THEN
      RAISE EXCEPTION 'DIRECT INSERT REJECTED: New revisions can only be created in draft status (attempted: %).', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.published_at := NULL;
    NEW.published_by := NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  PERFORM 1 FROM public.store_settings WHERE setting_key = NEW.setting_key FOR UPDATE;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1
  INTO NEW.revision_number
  FROM public.cms_setting_revisions
  WHERE setting_key = NEW.setting_key;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_setting_revision_insert ON public.cms_setting_revisions;
CREATE TRIGGER trg_validate_setting_revision_insert
  BEFORE INSERT ON public.cms_setting_revisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_setting_revision_insert();

-- Post-insert setting draft pointer update (SECURITY DEFINER owned by cms_publisher)
CREATE OR REPLACE FUNCTION public.sync_setting_draft_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    UPDATE public.store_settings
    SET draft_revision_id = NEW.id,
        updated_at = pg_catalog.now()
    WHERE setting_key = NEW.setting_key;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_setting_draft_pointer() OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.sync_setting_draft_pointer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_setting_draft_pointer() TO cms_publisher, authenticated;

DROP TRIGGER IF EXISTS trg_sync_setting_draft_pointer ON public.cms_setting_revisions;
CREATE TRIGGER trg_sync_setting_draft_pointer
  AFTER INSERT ON public.cms_setting_revisions
  FOR EACH ROW EXECUTE FUNCTION public.sync_setting_draft_pointer();

-- C. Page Revisions Controlled Insert
CREATE OR REPLACE FUNCTION public.validate_page_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    IF pg_catalog.current_user <> 'cms_publisher' THEN
      RAISE EXCEPTION 'DIRECT INSERT REJECTED: New revisions can only be created in draft status (attempted: %).', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.published_at := NULL;
    NEW.published_by := NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  PERFORM 1 FROM public.cms_pages WHERE id = NEW.page_id FOR UPDATE;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1
  INTO NEW.revision_number
  FROM public.cms_page_revisions
  WHERE page_id = NEW.page_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_page_revision_insert ON public.cms_page_revisions;
CREATE TRIGGER trg_validate_page_revision_insert
  BEFORE INSERT ON public.cms_page_revisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_page_revision_insert();

-- Post-insert page draft pointer update (SECURITY DEFINER owned by cms_publisher)
CREATE OR REPLACE FUNCTION public.sync_page_draft_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    UPDATE public.cms_pages
    SET draft_revision_id = NEW.id,
        updated_at = pg_catalog.now()
    WHERE id = NEW.page_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_page_draft_pointer() OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.sync_page_draft_pointer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_page_draft_pointer() TO cms_publisher, authenticated;

DROP TRIGGER IF EXISTS trg_sync_page_draft_pointer ON public.cms_page_revisions;
CREATE TRIGGER trg_sync_page_draft_pointer
  AFTER INSERT ON public.cms_page_revisions
  FOR EACH ROW EXECUTE FUNCTION public.sync_page_draft_pointer();

-- D. Media Asset Controlled Insert
CREATE OR REPLACE FUNCTION public.validate_cms_media_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    IF pg_catalog.current_user <> 'cms_publisher' THEN
      RAISE EXCEPTION 'DIRECT INSERT REJECTED: Media assets can only be registered in draft status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cms_media_insert ON public.cms_media;
CREATE TRIGGER trg_validate_cms_media_insert
  BEFORE INSERT ON public.cms_media
  FOR EACH ROW EXECUTE FUNCTION public.validate_cms_media_insert();

-- --------------------------------------------------------------------
-- 10. REVISION LIFECYCLE & POINTER PROTECTION TRIGGERS (SECURITY INVOKER)
-- --------------------------------------------------------------------

-- A. Section Revisions Lifecycle Trigger
CREATE OR REPLACE FUNCTION public.enforce_section_revision_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Cannot delete historical section revision % with status %', OLD.id, OLD.status
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Disallow mutating historical published or archived content
    IF OLD.status IN ('published', 'archived') THEN
      IF NEW.content IS DISTINCT FROM OLD.content OR
         NEW.title IS DISTINCT FROM OLD.title OR
         NEW.revision_number IS DISTINCT FROM OLD.revision_number OR
         NEW.section_id IS DISTINCT FROM OLD.section_id OR
         NEW.created_by IS DISTINCT FROM OLD.created_by OR
         NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Published or archived section revisions are permanently immutable.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Status transition check
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF pg_catalog.current_user <> 'cms_publisher' THEN
        RAISE EXCEPTION 'DIRECT PUBLISHING REJECTED: Revision status can only be modified through the authorized publishing RPC (current_user: %).', pg_catalog.current_user
          USING ERRCODE = '42501';
      END IF;

      IF NOT (
        (OLD.status = 'draft' AND NEW.status = 'published') OR
        (OLD.status = 'published' AND NEW.status = 'archived')
      ) THEN
        RAISE EXCEPTION 'Invalid section revision status transition from % to %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_section_revision_lifecycle ON public.cms_section_revisions;
CREATE TRIGGER trg_enforce_section_revision_lifecycle
  BEFORE UPDATE OR DELETE ON public.cms_section_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_section_revision_lifecycle();

-- B. Setting Revisions Lifecycle Trigger
CREATE OR REPLACE FUNCTION public.enforce_setting_revision_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Cannot delete historical setting revision % with status %', OLD.id, OLD.status
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      IF NEW.setting_value IS DISTINCT FROM OLD.setting_value OR
         NEW.revision_number IS DISTINCT FROM OLD.revision_number OR
         NEW.setting_key IS DISTINCT FROM OLD.setting_key OR
         NEW.created_by IS DISTINCT FROM OLD.created_by OR
         NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Published or archived setting revisions are permanently immutable.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF pg_catalog.current_user <> 'cms_publisher' THEN
        RAISE EXCEPTION 'DIRECT PUBLISHING REJECTED: Revision status can only be modified through the authorized publishing RPC (current_user: %).', pg_catalog.current_user
          USING ERRCODE = '42501';
      END IF;

      IF NOT (
        (OLD.status = 'draft' AND NEW.status = 'published') OR
        (OLD.status = 'published' AND NEW.status = 'archived')
      ) THEN
        RAISE EXCEPTION 'Invalid setting revision status transition from % to %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_setting_revision_lifecycle ON public.cms_setting_revisions;
CREATE TRIGGER trg_enforce_setting_revision_lifecycle
  BEFORE UPDATE OR DELETE ON public.cms_setting_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_setting_revision_lifecycle();

-- C. Page Revisions Lifecycle Trigger
CREATE OR REPLACE FUNCTION public.enforce_page_revision_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Cannot delete historical page revision % with status %', OLD.id, OLD.status
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      IF NEW.title IS DISTINCT FROM OLD.title OR
         NEW.content_markdown IS DISTINCT FROM OLD.content_markdown OR
         NEW.structured_content IS DISTINCT FROM OLD.structured_content OR
         NEW.meta_title IS DISTINCT FROM OLD.meta_title OR
         NEW.meta_description IS DISTINCT FROM OLD.meta_description OR
         NEW.revision_number IS DISTINCT FROM OLD.revision_number OR
         NEW.page_id IS DISTINCT FROM OLD.page_id OR
         NEW.created_by IS DISTINCT FROM OLD.created_by OR
         NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Published or archived page revisions are permanently immutable.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF pg_catalog.current_user <> 'cms_publisher' THEN
        RAISE EXCEPTION 'DIRECT PUBLISHING REJECTED: Revision status can only be modified through the authorized publishing RPC (current_user: %).', pg_catalog.current_user
          USING ERRCODE = '42501';
      END IF;

      IF NOT (
        (OLD.status = 'draft' AND NEW.status = 'published') OR
        (OLD.status = 'published' AND NEW.status = 'archived')
      ) THEN
        RAISE EXCEPTION 'Invalid page revision status transition from % to %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_page_revision_lifecycle ON public.cms_page_revisions;
CREATE TRIGGER trg_enforce_page_revision_lifecycle
  BEFORE UPDATE OR DELETE ON public.cms_page_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_page_revision_lifecycle();

-- D. Parent Active Revision Pointer Protection Trigger
CREATE OR REPLACE FUNCTION public.protect_parent_publication_pointers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id THEN
    IF pg_catalog.current_user <> 'cms_publisher' THEN
      RAISE EXCEPTION 'DIRECT UPDATE REJECTED: active_revision_id can only be modified through authorized publishing RPC functions (current_user: %).', pg_catalog.current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_section_pointers ON public.homepage_sections;
CREATE TRIGGER trg_protect_section_pointers
  BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.protect_parent_publication_pointers();

DROP TRIGGER IF EXISTS trg_protect_setting_pointers ON public.store_settings;
CREATE TRIGGER trg_protect_setting_pointers
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.protect_parent_publication_pointers();

DROP TRIGGER IF EXISTS trg_protect_page_pointers ON public.cms_pages;
CREATE TRIGGER trg_protect_page_pointers
  BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.protect_parent_publication_pointers();

-- E. Media In-Use Deletion Protection Trigger
CREATE OR REPLACE FUNCTION public.prevent_in_use_media_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ref_count integer := 0;
  v_ref_info text := '';
  v_asset_pattern text;
BEGIN
  v_asset_pattern := '%' || OLD.id::text || '%';

  -- 1. Section revisions
  SELECT count(*) INTO v_ref_count
  FROM public.cms_section_revisions
  WHERE content::text LIKE v_asset_pattern;

  IF v_ref_count > 0 THEN
    v_ref_info := v_ref_info || 'homepage_sections (' || v_ref_count || ' revisions); ';
  END IF;

  -- 2. Page revisions
  SELECT count(*) INTO v_ref_count
  FROM public.cms_page_revisions
  WHERE structured_content::text LIKE v_asset_pattern
     OR content_markdown LIKE '%' || OLD.storage_path || '%';

  IF v_ref_count > 0 THEN
    v_ref_info := v_ref_info || 'cms_pages (' || v_ref_count || ' revisions); ';
  END IF;

  -- 3. Setting revisions
  SELECT count(*) INTO v_ref_count
  FROM public.cms_setting_revisions
  WHERE setting_value::text LIKE v_asset_pattern;

  IF v_ref_count > 0 THEN
    v_ref_info := v_ref_info || 'store_settings (' || v_ref_count || ' revisions); ';
  END IF;

  -- 4. Active Banners
  SELECT count(*) INTO v_ref_count
  FROM public.banners
  WHERE media_path = OLD.storage_path
     OR media_path = OLD.desktop_storage_path
     OR media_path = OLD.mobile_storage_path;

  IF v_ref_count > 0 THEN
    v_ref_info := v_ref_info || 'banners (' || v_ref_count || ' active banners); ';
  END IF;

  -- 5. Product Images
  SELECT count(*) INTO v_ref_count
  FROM public.product_images
  WHERE storage_path = OLD.storage_path;

  IF v_ref_count > 0 THEN
    v_ref_info := v_ref_info || 'product_images (' || v_ref_count || ' products); ';
  END IF;

  -- 6. Product Editorial Content
  SELECT count(*) INTO v_ref_count
  FROM public.product_editorial_content
  WHERE hero_media_id = OLD.id;

  IF v_ref_count > 0 THEN
    v_ref_info := v_ref_info || 'product_editorial_content (' || v_ref_count || ' products); ';
  END IF;

  IF v_ref_info <> '' THEN
    RAISE EXCEPTION 'Cannot delete media asset %: actively referenced by: %', OLD.id, v_ref_info
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cms_media_deletion ON public.cms_media;
CREATE TRIGGER trg_prevent_cms_media_deletion
  BEFORE DELETE ON public.cms_media
  FOR EACH ROW EXECUTE FUNCTION public.prevent_in_use_media_deletion();

-- --------------------------------------------------------------------
-- 11. PUBLISHING RPC FUNCTIONS (Owned by cms_publisher)
-- --------------------------------------------------------------------

-- A. Publish Homepage Section
CREATE OR REPLACE FUNCTION public.publish_homepage_section(
  p_section_id uuid,
  p_target_revision_id uuid,
  p_promoted_media_ids uuid[] DEFAULT NULL,
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_current_active_id uuid;
  v_target_revision record;
  v_promoted_count integer := 0;
  v_media_id uuid;
  v_media_record record;
  v_dest_path text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_target_revision
  FROM public.cms_section_revisions
  WHERE id = p_target_revision_id AND section_id = p_section_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target section revision % does not exist for section %', p_target_revision_id, p_section_id
      USING ERRCODE = '23503';
  END IF;

  IF v_target_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Target revision % is not a draft (current status: %)', p_target_revision_id, v_target_revision.status
      USING ERRCODE = '23514';
  END IF;

  SELECT active_revision_id INTO v_current_active_id
  FROM public.homepage_sections
  WHERE id = p_section_id
  FOR UPDATE;

  IF p_promoted_media_ids IS NOT NULL AND pg_catalog.array_length(p_promoted_media_ids, 1) > 0 THEN
    FOREACH v_media_id IN ARRAY p_promoted_media_ids LOOP
      SELECT * INTO v_media_record
      FROM public.cms_media
      WHERE id = v_media_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Media asset % does not exist in cms_media.', v_media_id
          USING ERRCODE = '23503';
      END IF;

      IF v_target_revision.content::text NOT LIKE '%' || v_media_id::text || '%' THEN
        RAISE EXCEPTION 'Media asset % is not referenced in target revision content.', v_media_id
          USING ERRCODE = '23514';
      END IF;

      IF v_media_record.status = 'draft' THEN
        v_dest_path := 'site-media/' || pg_catalog.replace(v_media_record.storage_path, 'site-media-drafts/', '');

        UPDATE public.cms_media
        SET status = 'published',
            storage_bucket = 'site-media',
            storage_path = v_dest_path,
            published_at = pg_catalog.now(),
            published_by = v_admin_id,
            updated_at = pg_catalog.now()
        WHERE id = v_media_id;

        v_promoted_count := v_promoted_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_current_active_id IS NOT NULL THEN
    UPDATE public.cms_section_revisions
    SET status = 'archived'
    WHERE id = v_current_active_id;
  END IF;

  UPDATE public.cms_section_revisions
  SET status = 'published',
      published_at = pg_catalog.now(),
      published_by = v_admin_id,
      change_summary = pg_catalog.coalesce(p_change_summary, change_summary)
  WHERE id = p_target_revision_id;

  UPDATE public.homepage_sections
  SET active_revision_id = p_target_revision_id,
      updated_at = pg_catalog.now()
  WHERE id = p_section_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'section_id', p_section_id,
    'published_revision_id', p_target_revision_id,
    'archived_revision_id', v_current_active_id,
    'promoted_media_count', v_promoted_count,
    'published_by', v_admin_id,
    'published_at', pg_catalog.now()
  );
END;
$$;

ALTER FUNCTION public.publish_homepage_section(uuid, uuid, uuid[], text) OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.publish_homepage_section(uuid, uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_homepage_section(uuid, uuid, uuid[], text) TO authenticated;

-- B. Rollback Homepage Section (Linear Revision Model)
CREATE OR REPLACE FUNCTION public.rollback_homepage_section(
  p_section_id uuid,
  p_target_revision_id uuid,
  p_rollback_reason text DEFAULT 'Administrative rollback'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_historical_rev record;
  v_current_active_id uuid;
  v_next_rev_num integer;
  v_new_rev_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_historical_rev
  FROM public.cms_section_revisions
  WHERE id = p_target_revision_id AND section_id = p_section_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Historical revision % does not exist for section %', p_target_revision_id, p_section_id
      USING ERRCODE = '23503';
  END IF;

  SELECT active_revision_id INTO v_current_active_id
  FROM public.homepage_sections
  WHERE id = p_section_id
  FOR UPDATE;

  IF v_current_active_id = p_target_revision_id THEN
    RAISE EXCEPTION 'Cannot rollback: target revision % is already the active published revision.', p_target_revision_id
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1
  INTO v_next_rev_num
  FROM public.cms_section_revisions
  WHERE section_id = p_section_id;

  IF v_current_active_id IS NOT NULL THEN
    UPDATE public.cms_section_revisions
    SET status = 'archived'
    WHERE id = v_current_active_id;
  END IF;

  INSERT INTO public.cms_section_revisions (
    section_id,
    revision_number,
    title,
    content,
    status,
    change_summary,
    created_by,
    published_by,
    published_at
  )
  VALUES (
    p_section_id,
    v_next_rev_num,
    v_historical_rev.title,
    v_historical_rev.content,
    'published',
    'Rollback to revision ' || v_historical_rev.revision_number || ': ' || pg_catalog.coalesce(p_rollback_reason, ''),
    v_admin_id,
    v_admin_id,
    pg_catalog.now()
  )
  RETURNING id INTO v_new_rev_id;

  UPDATE public.homepage_sections
  SET active_revision_id = v_new_rev_id,
      updated_at = pg_catalog.now()
  WHERE id = p_section_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'section_id', p_section_id,
    'new_published_revision_id', v_new_rev_id,
    'restored_from_revision_id', p_target_revision_id,
    'restored_from_revision_number', v_historical_rev.revision_number,
    'archived_revision_id', v_current_active_id,
    'published_by', v_admin_id,
    'published_at', pg_catalog.now()
  );
END;
$$;

ALTER FUNCTION public.rollback_homepage_section(uuid, uuid, text) OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.rollback_homepage_section(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_homepage_section(uuid, uuid, text) TO authenticated;

-- C. Publish Store Setting
CREATE OR REPLACE FUNCTION public.publish_store_setting(
  p_setting_key text,
  p_target_revision_id uuid,
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_current_active_id uuid;
  v_target_revision record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_target_revision
  FROM public.cms_setting_revisions
  WHERE id = p_target_revision_id AND setting_key = p_setting_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target setting revision % does not exist for setting %', p_target_revision_id, p_setting_key
      USING ERRCODE = '23503';
  END IF;

  IF v_target_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Target revision % is not a draft (status: %)', p_target_revision_id, v_target_revision.status
      USING ERRCODE = '23514';
  END IF;

  SELECT active_revision_id INTO v_current_active_id
  FROM public.store_settings
  WHERE setting_key = p_setting_key
  FOR UPDATE;

  IF v_current_active_id IS NOT NULL THEN
    UPDATE public.cms_setting_revisions
    SET status = 'archived'
    WHERE id = v_current_active_id;
  END IF;

  UPDATE public.cms_setting_revisions
  SET status = 'published',
      published_at = pg_catalog.now(),
      published_by = v_admin_id,
      change_summary = pg_catalog.coalesce(p_change_summary, change_summary)
  WHERE id = p_target_revision_id;

  UPDATE public.store_settings
  SET active_revision_id = p_target_revision_id,
      updated_at = pg_catalog.now(),
      updated_by = v_admin_id
  WHERE setting_key = p_setting_key;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'setting_key', p_setting_key,
    'published_revision_id', p_target_revision_id,
    'archived_revision_id', v_current_active_id,
    'published_by', v_admin_id,
    'published_at', pg_catalog.now()
  );
END;
$$;

ALTER FUNCTION public.publish_store_setting(text, uuid, text) OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.publish_store_setting(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_store_setting(text, uuid, text) TO authenticated;

-- D. Publish CMS Page
CREATE OR REPLACE FUNCTION public.publish_cms_page(
  p_page_id uuid,
  p_target_revision_id uuid,
  p_promoted_media_ids uuid[] DEFAULT NULL,
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_current_active_id uuid;
  v_target_revision record;
  v_promoted_count integer := 0;
  v_media_id uuid;
  v_media_record record;
  v_dest_path text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_target_revision
  FROM public.cms_page_revisions
  WHERE id = p_target_revision_id AND page_id = p_page_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target page revision % does not exist for page %', p_target_revision_id, p_page_id
      USING ERRCODE = '23503';
  END IF;

  IF v_target_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Target revision % is not a draft (current status: %)', p_target_revision_id, v_target_revision.status
      USING ERRCODE = '23514';
  END IF;

  SELECT active_revision_id INTO v_current_active_id
  FROM public.cms_pages
  WHERE id = p_page_id
  FOR UPDATE;

  IF p_promoted_media_ids IS NOT NULL AND pg_catalog.array_length(p_promoted_media_ids, 1) > 0 THEN
    FOREACH v_media_id IN ARRAY p_promoted_media_ids LOOP
      SELECT * INTO v_media_record
      FROM public.cms_media
      WHERE id = v_media_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Media asset % does not exist in cms_media.', v_media_id
          USING ERRCODE = '23503';
      END IF;

      IF v_target_revision.structured_content::text NOT LIKE '%' || v_media_id::text || '%'
         AND v_target_revision.content_markdown NOT LIKE '%' || v_media_record.storage_path || '%' THEN
        RAISE EXCEPTION 'Media asset % is not referenced in target page content.', v_media_id
          USING ERRCODE = '23514';
      END IF;

      IF v_media_record.status = 'draft' THEN
        v_dest_path := 'site-media/' || pg_catalog.replace(v_media_record.storage_path, 'site-media-drafts/', '');

        UPDATE public.cms_media
        SET status = 'published',
            storage_bucket = 'site-media',
            storage_path = v_dest_path,
            published_at = pg_catalog.now(),
            published_by = v_admin_id,
            updated_at = pg_catalog.now()
        WHERE id = v_media_id;

        v_promoted_count := v_promoted_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_current_active_id IS NOT NULL THEN
    UPDATE public.cms_page_revisions
    SET status = 'archived'
    WHERE id = v_current_active_id;
  END IF;

  UPDATE public.cms_page_revisions
  SET status = 'published',
      published_at = pg_catalog.now(),
      published_by = v_admin_id,
      change_summary = pg_catalog.coalesce(p_change_summary, change_summary)
  WHERE id = p_target_revision_id;

  UPDATE public.cms_pages
  SET active_revision_id = p_target_revision_id,
      is_published = true,
      updated_at = pg_catalog.now()
  WHERE id = p_page_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'page_id', p_page_id,
    'published_revision_id', p_target_revision_id,
    'archived_revision_id', v_current_active_id,
    'promoted_media_count', v_promoted_count,
    'published_by', v_admin_id,
    'published_at', pg_catalog.now()
  );
END;
$$;

ALTER FUNCTION public.publish_cms_page(uuid, uuid, uuid[], text) OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.publish_cms_page(uuid, uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_cms_page(uuid, uuid, uuid[], text) TO authenticated;

-- E. Rollback CMS Page
CREATE OR REPLACE FUNCTION public.rollback_cms_page(
  p_page_id uuid,
  p_target_revision_id uuid,
  p_rollback_reason text DEFAULT 'Administrative rollback'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_historical_rev record;
  v_current_active_id uuid;
  v_next_rev_num integer;
  v_new_rev_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_historical_rev
  FROM public.cms_page_revisions
  WHERE id = p_target_revision_id AND page_id = p_page_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Historical page revision % does not exist for page %', p_target_revision_id, p_page_id
      USING ERRCODE = '23503';
  END IF;

  SELECT active_revision_id INTO v_current_active_id
  FROM public.cms_pages
  WHERE id = p_page_id
  FOR UPDATE;

  IF v_current_active_id = p_target_revision_id THEN
    RAISE EXCEPTION 'Cannot rollback: target revision % is already the active published revision.', p_target_revision_id
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1
  INTO v_next_rev_num
  FROM public.cms_page_revisions
  WHERE page_id = p_page_id;

  IF v_current_active_id IS NOT NULL THEN
    UPDATE public.cms_page_revisions
    SET status = 'archived'
    WHERE id = v_current_active_id;
  END IF;

  INSERT INTO public.cms_page_revisions (
    page_id,
    revision_number,
    title,
    content_markdown,
    structured_content,
    meta_title,
    meta_description,
    status,
    change_summary,
    created_by,
    published_by,
    published_at
  )
  VALUES (
    p_page_id,
    v_next_rev_num,
    v_historical_rev.title,
    v_historical_rev.content_markdown,
    v_historical_rev.structured_content,
    v_historical_rev.meta_title,
    v_historical_rev.meta_description,
    'published',
    'Rollback to revision ' || v_historical_rev.revision_number || ': ' || pg_catalog.coalesce(p_rollback_reason, ''),
    v_admin_id,
    v_admin_id,
    pg_catalog.now()
  )
  RETURNING id INTO v_new_rev_id;

  UPDATE public.cms_pages
  SET active_revision_id = v_new_rev_id,
      is_published = true,
      updated_at = pg_catalog.now()
  WHERE id = p_page_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'page_id', p_page_id,
    'new_published_revision_id', v_new_rev_id,
    'restored_from_revision_id', p_target_revision_id,
    'restored_from_revision_number', v_historical_rev.revision_number,
    'archived_revision_id', v_current_active_id,
    'published_by', v_admin_id,
    'published_at', pg_catalog.now()
  );
END;
$$;

ALTER FUNCTION public.rollback_cms_page(uuid, uuid, text) OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.rollback_cms_page(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_cms_page(uuid, uuid, text) TO authenticated;

-- F. Safe Media Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_cms_media_asset(
  p_media_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_media_record record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_media_record
  FROM public.cms_media
  WHERE id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media asset % does not exist.', p_media_id
      USING ERRCODE = '23503';
  END IF;

  IF v_media_record.status <> 'draft' AND NOT p_force THEN
    RAISE EXCEPTION 'Cannot delete media asset % with status % without force confirmation.', p_media_id, v_media_record.status
      USING ERRCODE = '23514';
  END IF;

  -- cms_publisher executes DELETE, which fires prevent_in_use_media_deletion trigger
  DELETE FROM public.cms_media WHERE id = p_media_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'deleted_media_id', p_media_id,
    'storage_bucket', v_media_record.storage_bucket,
    'storage_path', v_media_record.storage_path,
    'desktop_storage_path', v_media_record.desktop_storage_path,
    'mobile_storage_path', v_media_record.mobile_storage_path,
    'deleted_by', v_admin_id
  );
END;
$$;

ALTER FUNCTION public.delete_cms_media_asset(uuid, boolean) OWNER TO cms_publisher;
REVOKE ALL ON FUNCTION public.delete_cms_media_asset(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cms_media_asset(uuid, boolean) TO authenticated;

-- --------------------------------------------------------------------
-- 12. ROW-LEVEL SECURITY POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.cms_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_setting_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_section_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_editorial_content ENABLE ROW LEVEL SECURITY;

-- A. cms_media Policies
DROP POLICY IF EXISTS "Public read published media records" ON public.cms_media;
CREATE POLICY "Public read published media records"
  ON public.cms_media FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins select cms_media" ON public.cms_media;
CREATE POLICY "Admins select cms_media"
  ON public.cms_media FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert cms_media" ON public.cms_media;
CREATE POLICY "Admins insert cms_media"
  ON public.cms_media FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update cms_media" ON public.cms_media;
CREATE POLICY "Admins update cms_media"
  ON public.cms_media FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete draft cms_media only" ON public.cms_media;
CREATE POLICY "Admins delete draft cms_media only"
  ON public.cms_media FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

DROP POLICY IF EXISTS "Publisher manage cms_media" ON public.cms_media;
CREATE POLICY "Publisher manage cms_media"
  ON public.cms_media FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- B. store_settings Policies
DROP POLICY IF EXISTS "Public read public store settings" ON public.store_settings;
CREATE POLICY "Public read public store settings"
  ON public.store_settings FOR SELECT TO anon, authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "Admins select store settings" ON public.store_settings;
CREATE POLICY "Admins select store settings"
  ON public.store_settings FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert store settings" ON public.store_settings;
CREATE POLICY "Admins insert store settings"
  ON public.store_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update store settings" ON public.store_settings;
CREATE POLICY "Admins update store settings"
  ON public.store_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete store settings" ON public.store_settings;
CREATE POLICY "Admins delete store settings"
  ON public.store_settings FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Publisher manage store_settings" ON public.store_settings;
CREATE POLICY "Publisher manage store_settings"
  ON public.store_settings FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- C. cms_setting_revisions Policies
DROP POLICY IF EXISTS "Public read active published setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Public read active published setting revisions"
  ON public.cms_setting_revisions FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND
    EXISTS (
      SELECT 1 FROM public.store_settings s
      WHERE s.setting_key = cms_setting_revisions.setting_key
        AND s.active_revision_id = cms_setting_revisions.id
        AND s.is_public = true
    )
  );

DROP POLICY IF EXISTS "Admins select setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Admins select setting revisions"
  ON public.cms_setting_revisions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Admins insert setting revisions"
  ON public.cms_setting_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Admins update setting revisions"
  ON public.cms_setting_revisions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete draft setting revisions only" ON public.cms_setting_revisions;
CREATE POLICY "Admins delete draft setting revisions only"
  ON public.cms_setting_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

DROP POLICY IF EXISTS "Publisher manage setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Publisher manage setting revisions"
  ON public.cms_setting_revisions FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- D. homepage_sections Policies
DROP POLICY IF EXISTS "Public read active scheduled homepage sections" ON public.homepage_sections;
CREATE POLICY "Public read active scheduled homepage sections"
  ON public.homepage_sections FOR SELECT TO anon, authenticated
  USING (
    is_active = true AND
    (starts_at IS NULL OR starts_at <= pg_catalog.now()) AND
    (ends_at IS NULL OR ends_at > pg_catalog.now())
  );

DROP POLICY IF EXISTS "Admins select homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins select homepage sections"
  ON public.homepage_sections FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins insert homepage sections"
  ON public.homepage_sections FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins update homepage sections"
  ON public.homepage_sections FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins delete homepage sections"
  ON public.homepage_sections FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Publisher manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Publisher manage homepage sections"
  ON public.homepage_sections FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- E. cms_section_revisions Policies
DROP POLICY IF EXISTS "Public read active published section revisions" ON public.cms_section_revisions;
CREATE POLICY "Public read active published section revisions"
  ON public.cms_section_revisions FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND
    EXISTS (
      SELECT 1 FROM public.homepage_sections s
      WHERE s.id = cms_section_revisions.section_id
        AND s.is_active = true
        AND s.active_revision_id = cms_section_revisions.id
        AND (s.starts_at IS NULL OR s.starts_at <= pg_catalog.now())
        AND (s.ends_at IS NULL OR s.ends_at > pg_catalog.now())
    )
  );

DROP POLICY IF EXISTS "Admins select section revisions" ON public.cms_section_revisions;
CREATE POLICY "Admins select section revisions"
  ON public.cms_section_revisions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert section revisions" ON public.cms_section_revisions;
CREATE POLICY "Admins insert section revisions"
  ON public.cms_section_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update section revisions" ON public.cms_section_revisions;
CREATE POLICY "Admins update section revisions"
  ON public.cms_section_revisions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete draft section revisions only" ON public.cms_section_revisions;
CREATE POLICY "Admins delete draft section revisions only"
  ON public.cms_section_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

DROP POLICY IF EXISTS "Publisher manage section revisions" ON public.cms_section_revisions;
CREATE POLICY "Publisher manage section revisions"
  ON public.cms_section_revisions FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- F. cms_pages Policies
DROP POLICY IF EXISTS "Public read published cms pages" ON public.cms_pages;
CREATE POLICY "Public read published cms pages"
  ON public.cms_pages FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "Admins select cms pages" ON public.cms_pages;
CREATE POLICY "Admins select cms pages"
  ON public.cms_pages FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert cms pages" ON public.cms_pages;
CREATE POLICY "Admins insert cms pages"
  ON public.cms_pages FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update cms pages" ON public.cms_pages;
CREATE POLICY "Admins update cms pages"
  ON public.cms_pages FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete cms pages" ON public.cms_pages;
CREATE POLICY "Admins delete cms pages"
  ON public.cms_pages FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Publisher manage cms pages" ON public.cms_pages;
CREATE POLICY "Publisher manage cms pages"
  ON public.cms_pages FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- G. cms_page_revisions Policies
DROP POLICY IF EXISTS "Public read active published page revisions" ON public.cms_page_revisions;
CREATE POLICY "Public read active published page revisions"
  ON public.cms_page_revisions FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND
    EXISTS (
      SELECT 1 FROM public.cms_pages p
      WHERE p.id = cms_page_revisions.page_id
        AND p.is_published = true
        AND p.active_revision_id = cms_page_revisions.id
    )
  );

DROP POLICY IF EXISTS "Admins select page revisions" ON public.cms_page_revisions;
CREATE POLICY "Admins select page revisions"
  ON public.cms_page_revisions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert page revisions" ON public.cms_page_revisions;
CREATE POLICY "Admins insert page revisions"
  ON public.cms_page_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update page revisions" ON public.cms_page_revisions;
CREATE POLICY "Admins update page revisions"
  ON public.cms_page_revisions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete draft page revisions only" ON public.cms_page_revisions;
CREATE POLICY "Admins delete draft page revisions only"
  ON public.cms_page_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

DROP POLICY IF EXISTS "Publisher manage page revisions" ON public.cms_page_revisions;
CREATE POLICY "Publisher manage page revisions"
  ON public.cms_page_revisions FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- H. product_editorial_content Policies
DROP POLICY IF EXISTS "Public read published editorial content" ON public.product_editorial_content;
CREATE POLICY "Public read published editorial content"
  ON public.product_editorial_content FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "Admins select editorial content" ON public.product_editorial_content;
CREATE POLICY "Admins select editorial content"
  ON public.product_editorial_content FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert editorial content" ON public.product_editorial_content;
CREATE POLICY "Admins insert editorial content"
  ON public.product_editorial_content FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update editorial content" ON public.product_editorial_content;
CREATE POLICY "Admins update editorial content"
  ON public.product_editorial_content FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete editorial content" ON public.product_editorial_content;
CREATE POLICY "Admins delete editorial content"
  ON public.product_editorial_content FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Publisher manage editorial content" ON public.product_editorial_content;
CREATE POLICY "Publisher manage editorial content"
  ON public.product_editorial_content FOR ALL TO cms_publisher
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------------------
-- 13. STORAGE RLS POLICIES (Preserving Native Storage Architecture)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view site-media published assets" ON storage.objects;
CREATE POLICY "Public can view site-media published assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "Admins insert site-media assets" ON storage.objects;
CREATE POLICY "Admins insert site-media assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update site-media assets" ON storage.objects;
CREATE POLICY "Admins update site-media assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete site-media assets" ON storage.objects;
CREATE POLICY "Admins delete site-media assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins select site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins select site-media-drafts assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-media-drafts' AND public.is_admin());

DROP POLICY IF EXISTS "Admins insert site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins insert site-media-drafts assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-media-drafts' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins update site-media-drafts assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-media-drafts' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-media-drafts' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins delete site-media-drafts assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-media-drafts' AND public.is_admin());

-- --------------------------------------------------------------------
-- 14. COLUMN-LEVEL PRIVILEGE SEPARATION (Zero Table-Level UPDATE)
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, cms_publisher;

-- Step 1: Revoke all previous privileges on CMS tables
REVOKE ALL ON public.cms_media FROM anon, authenticated;
REVOKE ALL ON public.store_settings FROM anon, authenticated;
REVOKE ALL ON public.cms_setting_revisions FROM anon, authenticated;
REVOKE ALL ON public.homepage_sections FROM anon, authenticated;
REVOKE ALL ON public.cms_section_revisions FROM anon, authenticated;
REVOKE ALL ON public.cms_pages FROM anon, authenticated;
REVOKE ALL ON public.cms_page_revisions FROM anon, authenticated;
REVOKE ALL ON public.product_editorial_content FROM anon, authenticated;

-- Step 2: Public / Anonymous shoppers: SELECT only on storefront content
GRANT SELECT ON
  public.cms_media,
  public.store_settings,
  public.cms_setting_revisions,
  public.homepage_sections,
  public.cms_section_revisions,
  public.cms_pages,
  public.cms_page_revisions,
  public.product_editorial_content
TO anon;

-- Step 3: Authenticated administrators: SELECT and DELETE (drafts gated by RLS)
GRANT SELECT, DELETE ON
  public.cms_media,
  public.store_settings,
  public.cms_setting_revisions,
  public.homepage_sections,
  public.cms_section_revisions,
  public.cms_pages,
  public.cms_page_revisions,
  public.product_editorial_content
TO authenticated;

-- Step 4: Authenticated INSERT privileges (controlled drafting columns)
GRANT INSERT (
  asset_id, version, storage_bucket, storage_path, original_filename,
  mime_type, file_size_bytes, media_type, width, height, duration_seconds,
  aspect_ratio, alt_text, title, description, is_system_asset,
  desktop_storage_path, mobile_storage_path, poster_media_id, sha256_hash
) ON public.cms_media TO authenticated;

GRANT INSERT (
  setting_key, category, description, is_public
) ON public.store_settings TO authenticated;

GRANT INSERT (
  setting_key, setting_value, change_summary
) ON public.cms_setting_revisions TO authenticated;

GRANT INSERT (
  section_key, section_type, title, sort_order, is_active, starts_at, ends_at
) ON public.homepage_sections TO authenticated;

GRANT INSERT (
  section_id, title, content, change_summary
) ON public.cms_section_revisions TO authenticated;

GRANT INSERT (
  slug, page_type, is_published
) ON public.cms_pages TO authenticated;

GRANT INSERT (
  page_id, title, content_markdown, structured_content, meta_title, meta_description, change_summary
) ON public.cms_page_revisions TO authenticated;

GRANT INSERT (
  product_id, badge_label, highlight_statement, milling_guide_title,
  milling_guide_body, supported_grains, chef_tip, in_the_box,
  maintenance_notes, warranty_summary, faq_items, hero_media_id, is_published
) ON public.product_editorial_content TO authenticated;

-- Step 5: Authenticated UPDATE privileges (STRICTLY NON-POINTER, NON-STATUS COLUMNS)
GRANT UPDATE (
  alt_text, title, description, desktop_storage_path, mobile_storage_path, poster_media_id
) ON public.cms_media TO authenticated;

GRANT UPDATE (
  description, is_public
) ON public.store_settings TO authenticated;

GRANT UPDATE (
  setting_value, change_summary
) ON public.cms_setting_revisions TO authenticated;

GRANT UPDATE (
  title, sort_order, is_active, starts_at, ends_at
) ON public.homepage_sections TO authenticated;

GRANT UPDATE (
  title, content, change_summary
) ON public.cms_section_revisions TO authenticated;

GRANT UPDATE (
  slug, page_type, is_published
) ON public.cms_pages TO authenticated;

GRANT UPDATE (
  title, content_markdown, structured_content, meta_title, meta_description, change_summary
) ON public.cms_page_revisions TO authenticated;

GRANT UPDATE (
  badge_label, highlight_statement, milling_guide_title, milling_guide_body,
  supported_grains, chef_tip, in_the_box, maintenance_notes, warranty_summary,
  faq_items, hero_media_id, is_published
) ON public.product_editorial_content TO authenticated;

-- Step 6: Privileged Publishing Role (cms_publisher) Grants
-- Grants DELETE on cms_media for delete_cms_media_asset RPC
GRANT SELECT, DELETE, UPDATE (
  status, storage_bucket, storage_path, published_at, published_by, updated_at
) ON public.cms_media TO cms_publisher;

GRANT SELECT, UPDATE (
  active_revision_id, draft_revision_id, updated_at
) ON public.homepage_sections TO cms_publisher;

GRANT SELECT, INSERT, UPDATE (
  status, published_at, published_by, change_summary
) ON public.cms_section_revisions TO cms_publisher;

GRANT SELECT, UPDATE (
  active_revision_id, draft_revision_id, updated_at, updated_by
) ON public.store_settings TO cms_publisher;

GRANT SELECT, INSERT, UPDATE (
  status, published_at, published_by, change_summary
) ON public.cms_setting_revisions TO cms_publisher;

GRANT SELECT, UPDATE (
  active_revision_id, draft_revision_id, is_published, updated_at
) ON public.cms_pages TO cms_publisher;

GRANT SELECT, INSERT, UPDATE (
  status, published_at, published_by, change_summary
) ON public.cms_page_revisions TO cms_publisher;

GRANT SELECT, UPDATE (
  is_published, updated_at, updated_by
) ON public.product_editorial_content TO cms_publisher;

-- ====================================================================
-- End of Migration v1.8
-- ====================================================================

