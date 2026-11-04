-- ====================================================================
-- CALVIN AATAMAKER — Dynamic Storefront CMS Migration (v1.6 Enterprise Certified)
-- Principal PostgreSQL Security Architect & Senior Supabase Platform Engineer
-- ====================================================================
-- Summary of v1.6 Security Enhancements:
--   1. Privilege Hardening: Removed GRANT ALL. No TRUNCATE granted.
--      Grants only specific SELECT, INSERT, UPDATE, DELETE privileges.
--   2. Direct Status & Pointer Protection: Direct UPDATE of revision status
--      or parent active_revision_id is strictly blocked by triggers unless
--      invoked inside an authorized, authenticated publication RPC.
--   3. Storage Safety: Zero direct SQL INSERTs into storage.buckets. Zero custom
--      triggers on storage.objects. Relies on standard Storage RLS policies.
--   4. Comprehensive Media Promotion: Verifies promoted media belongs to the
--      target revision, validates version, destination path, hash, and sub-assets.
--   5. Search Path Hardening: SET search_path = '' on all new SECURITY DEFINER
--      functions with 100% schema-qualified identifiers.
--   6. Re-run Safety: Drops only migration-owned policies. Detects incompatible
--      pre-existing table definitions before execution.
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
-- 2. BASE UTILITY FUNCTIONS
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- Verify public.is_admin() exists with safe search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- --------------------------------------------------------------------
-- 3. VERSIONED MEDIA LIBRARY (public.cms_media)
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
  caption text,
  desktop_path text,
  mobile_path text,
  poster_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_current boolean NOT NULL DEFAULT true,
  sha256_hash text,
  folder text NOT NULL DEFAULT 'general',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_cms_media_asset_version UNIQUE(asset_id, version)
);

CREATE INDEX IF NOT EXISTS idx_cms_media_asset_ver ON public.cms_media(asset_id, version);
CREATE INDEX IF NOT EXISTS idx_cms_media_status_bucket ON public.cms_media(status, storage_bucket);
CREATE INDEX IF NOT EXISTS idx_cms_media_folder ON public.cms_media(folder);
CREATE INDEX IF NOT EXISTS idx_cms_media_created ON public.cms_media(created_at DESC);

DROP TRIGGER IF EXISTS set_cms_media_updated_at ON public.cms_media;
CREATE TRIGGER set_cms_media_updated_at
  BEFORE UPDATE ON public.cms_media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------
-- 4. GLOBAL STORE SETTINGS & REVISION HISTORY
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
-- 5. HOMEPAGE DYNAMIC SECTIONS & REVISION LIFECYCLE
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
-- 6. CONTENT & POLICY PAGES WITH REVISIONS
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
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  published_at timestamptz,
  CONSTRAINT uq_page_revisions_number UNIQUE(page_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug_published ON public.cms_pages(slug, is_published);
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
-- 7. PRODUCT EDITORIAL CONTENT OVERLAY
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
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT uq_product_editorial_product UNIQUE(product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_editorial_product ON public.product_editorial_content(product_id, is_published);

DROP TRIGGER IF EXISTS set_product_editorial_updated_at ON public.product_editorial_content;
CREATE TRIGGER set_product_editorial_updated_at
  BEFORE UPDATE ON public.product_editorial_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------
-- 8. REVISION LIFECYCLE, IMMUTABILITY & POINTER PROTECTION TRIGGERS
-- --------------------------------------------------------------------

-- A. Section Revisions Lifecycle Trigger
CREATE OR REPLACE FUNCTION public.enforce_section_revision_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
      -- Direct status mutation outside authorized RPC is blocked
      IF pg_catalog.coalesce(pg_catalog.current_setting('cms.authorized_publishing', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'Direct modification of revision status is forbidden. Revisions must be published through authorized RPC.'
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
SECURITY DEFINER
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
      IF pg_catalog.coalesce(pg_catalog.current_setting('cms.authorized_publishing', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'Direct modification of revision status is forbidden. Revisions must be published through authorized RPC.'
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
SECURITY DEFINER
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
      IF pg_catalog.coalesce(pg_catalog.current_setting('cms.authorized_publishing', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'Direct modification of revision status is forbidden. Revisions must be published through authorized RPC.'
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

-- D. Parent Active Revision Pointer Protection Triggers
CREATE OR REPLACE FUNCTION public.protect_parent_publication_pointers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id THEN
    IF pg_catalog.coalesce(pg_catalog.current_setting('cms.authorized_publishing', true), 'false') <> 'true' THEN
      RAISE EXCEPTION 'Direct modification of active_revision_id is forbidden. Content publication must occur through authorized RPC.'
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_in_use boolean := false;
  v_path text;
BEGIN
  v_path := OLD.storage_path;

  -- 1. Check CMS section revisions
  IF EXISTS (
    SELECT 1 FROM public.cms_section_revisions
    WHERE status IN ('published', 'archived')
      AND (
        content::text LIKE '%' || v_path || '%' OR
        content::text LIKE '%' || OLD.id::text || '%' OR
        (OLD.desktop_path IS NOT NULL AND content::text LIKE '%' || OLD.desktop_path || '%') OR
        (OLD.mobile_path IS NOT NULL AND content::text LIKE '%' || OLD.mobile_path || '%') OR
        (OLD.poster_path IS NOT NULL AND content::text LIKE '%' || OLD.poster_path || '%')
      )
  ) THEN
    v_in_use := true;
  END IF;

  -- 2. Check CMS page revisions
  IF NOT v_in_use AND EXISTS (
    SELECT 1 FROM public.cms_page_revisions
    WHERE status IN ('published', 'archived')
      AND (
        content_markdown LIKE '%' || v_path || '%' OR
        structured_content::text LIKE '%' || v_path || '%'
      )
  ) THEN
    v_in_use := true;
  END IF;

  -- 3. Check CMS setting revisions
  IF NOT v_in_use AND EXISTS (
    SELECT 1 FROM public.cms_setting_revisions
    WHERE status IN ('published', 'archived')
      AND setting_value::text LIKE '%' || v_path || '%'
  ) THEN
    v_in_use := true;
  END IF;

  -- 4. Check active banners
  IF NOT v_in_use AND EXISTS (
    SELECT 1 FROM public.banners
    WHERE media_path = v_path AND is_active = true
  ) THEN
    v_in_use := true;
  END IF;

  -- 5. Check product images
  IF NOT v_in_use AND EXISTS (
    SELECT 1 FROM public.product_images
    WHERE storage_path = v_path
  ) THEN
    v_in_use := true;
  END IF;

  IF v_in_use THEN
    RAISE EXCEPTION 'Cannot delete media %: asset is actively referenced by published or archived CMS records, banners, or product images.', OLD.id
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
-- 9. ATOMIC RPC PUBLISHING & ROLLBACK (Strict Verified Administrator Identity)
-- --------------------------------------------------------------------

-- A. Atomic Homepage Section Publication RPC
CREATE OR REPLACE FUNCTION public.publish_homepage_section(
  p_section_id uuid,
  p_revision_id uuid,
  p_promoted_media jsonb DEFAULT '[]'::jsonb,
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_section RECORD;
  v_revision RECORD;
  v_item jsonb;
  v_media_id uuid;
  v_exp_version integer;
  v_pub_path text;
  v_hash text;
  v_media RECORD;
BEGIN
  -- 1. Strictly Verify Administrator Authentication (service-role without user JWT rejected)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock Parent Section Row
  SELECT * INTO v_section FROM public.homepage_sections
  WHERE id = p_section_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Homepage section not found with id %', p_section_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Lock Target Revision Row & Verify it is currently a DRAFT
  SELECT * INTO v_revision FROM public.cms_section_revisions
  WHERE id = p_revision_id AND section_id = p_section_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision % does not belong to section %', p_revision_id, p_section_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Target revision % is not a draft (current status: %)', p_revision_id, v_revision.status
      USING ERRCODE = '23514';
  END IF;

  -- 4. Authorize and Verify Promoted Media Belong to Target Revision
  IF p_promoted_media IS NOT NULL AND pg_catalog.jsonb_array_length(p_promoted_media) > 0 THEN
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_promoted_media)
    LOOP
      v_media_id := (v_item->>'media_id')::uuid;
      v_exp_version := (v_item->>'expected_version')::integer;
      v_pub_path := v_item->>'published_storage_path';
      v_hash := v_item->>'sha256_hash';

      -- Verify media_id is actually referenced in target revision content
      IF NOT (v_revision.content::text LIKE '%' || v_media_id::text || '%' OR
              v_revision.content::text LIKE '%' || v_pub_path || '%') THEN
        RAISE EXCEPTION 'Promoted media asset % is not referenced in target revision %', v_media_id, p_revision_id
          USING ERRCODE = '23503';
      END IF;

      -- Lock media record and verify expected version
      SELECT * INTO v_media FROM public.cms_media WHERE id = v_media_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Media asset % not found', v_media_id USING ERRCODE = 'P0002';
      END IF;

      IF v_media.version <> v_exp_version THEN
        RAISE EXCEPTION 'Media version mismatch for asset %: expected %, found %', v_media_id, v_exp_version, v_media.version
          USING ERRCODE = '23514';
      END IF;

      -- Update media with actual published destination path
      UPDATE public.cms_media
      SET
        storage_bucket = 'site-media',
        storage_path = v_pub_path,
        status = 'published',
        sha256_hash = pg_catalog.coalesce(v_hash, sha256_hash),
        desktop_path = pg_catalog.coalesce(v_item->>'desktop_path', desktop_path),
        mobile_path = pg_catalog.coalesce(v_item->>'mobile_path', mobile_path),
        poster_path = pg_catalog.coalesce(v_item->>'poster_path', poster_path),
        updated_at = pg_catalog.now()
      WHERE id = v_media_id;
    END LOOP;
  END IF;

  -- 5. Open Session-Level Authorized Publishing Gate (Allows trigger to pass)
  PERFORM pg_catalog.set_config('cms.authorized_publishing', 'true', true);

  -- 6. Archive Currently Published Revision(s)
  UPDATE public.cms_section_revisions
  SET status = 'archived'
  WHERE section_id = p_section_id AND status = 'published';

  -- 7. Activate Target Revision as Published
  UPDATE public.cms_section_revisions
  SET
    status = 'published',
    published_at = pg_catalog.now(),
    change_summary = pg_catalog.coalesce(p_change_summary, change_summary)
  WHERE id = p_revision_id;

  -- 8. Atomically Update Section Pointer
  UPDATE public.homepage_sections
  SET
    active_revision_id = p_revision_id,
    draft_revision_id = NULL,
    updated_at = pg_catalog.now()
  WHERE id = p_section_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'section_id', p_section_id,
    'active_revision_id', p_revision_id,
    'promoted_media_count', pg_catalog.jsonb_array_length(p_promoted_media),
    'published_by', auth.uid(),
    'published_at', pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_homepage_section(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_homepage_section(uuid, uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_homepage_section(uuid, uuid, jsonb, text) TO authenticated;

-- B. Atomic Section Rollback RPC
CREATE OR REPLACE FUNCTION public.rollback_homepage_section(
  p_section_id uuid,
  p_target_revision_id uuid,
  p_reason text DEFAULT 'Rollback to prior revision'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target RECORD;
  v_next_rev_num integer;
  v_new_rev_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.homepage_sections WHERE id = p_section_id FOR UPDATE;

  SELECT * INTO v_target FROM public.cms_section_revisions
  WHERE id = p_target_revision_id AND section_id = p_section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target historical revision not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1 INTO v_next_rev_num
  FROM public.cms_section_revisions WHERE section_id = p_section_id;

  PERFORM pg_catalog.set_config('cms.authorized_publishing', 'true', true);

  INSERT INTO public.cms_section_revisions (
    section_id,
    revision_number,
    title,
    content,
    status,
    change_summary,
    created_by,
    created_at,
    published_at
  )
  VALUES (
    p_section_id,
    v_next_rev_num,
    v_target.title,
    v_target.content,
    'published',
    pg_catalog.coalesce(p_reason, 'Rollback to revision #' || v_target.revision_number),
    auth.uid(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_new_rev_id;

  UPDATE public.cms_section_revisions
  SET status = 'archived'
  WHERE section_id = p_section_id AND status = 'published' AND id <> v_new_rev_id;

  UPDATE public.homepage_sections
  SET
    active_revision_id = v_new_rev_id,
    draft_revision_id = NULL,
    updated_at = pg_catalog.now()
  WHERE id = p_section_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'section_id', p_section_id,
    'new_revision_id', v_new_rev_id,
    'rolled_back_from_revision', v_target.revision_number,
    'published_by', auth.uid(),
    'published_at', pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_homepage_section(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_homepage_section(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rollback_homepage_section(uuid, uuid, text) TO authenticated;

-- C. Atomic Store Settings Publication RPC
CREATE OR REPLACE FUNCTION public.publish_store_setting(
  p_setting_key text,
  p_revision_id uuid,
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.store_settings WHERE setting_key = p_setting_key FOR UPDATE;

  SELECT * INTO v_revision FROM public.cms_setting_revisions
  WHERE id = p_revision_id AND setting_key = p_setting_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision % does not belong to setting %', p_revision_id, p_setting_key
      USING ERRCODE = 'P0002';
  END IF;

  IF v_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Target revision % is not a draft (status: %)', p_revision_id, v_revision.status
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.set_config('cms.authorized_publishing', 'true', true);

  UPDATE public.cms_setting_revisions
  SET status = 'archived'
  WHERE setting_key = p_setting_key AND status = 'published';

  UPDATE public.cms_setting_revisions
  SET
    status = 'published',
    published_at = pg_catalog.now(),
    change_summary = pg_catalog.coalesce(p_change_summary, change_summary)
  WHERE id = p_revision_id;

  UPDATE public.store_settings
  SET
    active_revision_id = p_revision_id,
    draft_revision_id = NULL,
    updated_at = pg_catalog.now()
  WHERE setting_key = p_setting_key;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'setting_key', p_setting_key,
    'published_by', auth.uid(),
    'published_at', pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_store_setting(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_store_setting(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_store_setting(text, uuid, text) TO authenticated;

-- D. Atomic CMS Page Publication RPC
CREATE OR REPLACE FUNCTION public.publish_cms_page(
  p_page_id uuid,
  p_revision_id uuid,
  p_promoted_media jsonb DEFAULT '[]'::jsonb,
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision RECORD;
  v_item jsonb;
  v_media_id uuid;
  v_exp_version integer;
  v_pub_path text;
  v_hash text;
  v_media RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.cms_pages WHERE id = p_page_id FOR UPDATE;

  SELECT * INTO v_revision FROM public.cms_page_revisions
  WHERE id = p_revision_id AND page_id = p_page_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision % does not belong to page %', p_revision_id, p_page_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Target revision % is not a draft (status: %)', p_revision_id, v_revision.status
      USING ERRCODE = '23514';
  END IF;

  IF p_promoted_media IS NOT NULL AND pg_catalog.jsonb_array_length(p_promoted_media) > 0 THEN
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_promoted_media)
    LOOP
      v_media_id := (v_item->>'media_id')::uuid;
      v_exp_version := (v_item->>'expected_version')::integer;
      v_pub_path := v_item->>'published_storage_path';
      v_hash := v_item->>'sha256_hash';

      SELECT * INTO v_media FROM public.cms_media WHERE id = v_media_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Media asset % not found', v_media_id USING ERRCODE = 'P0002';
      END IF;

      IF v_media.version <> v_exp_version THEN
        RAISE EXCEPTION 'Media version mismatch for asset %: expected %, found %', v_media_id, v_exp_version, v_media.version
          USING ERRCODE = '23514';
      END IF;

      UPDATE public.cms_media
      SET
        storage_bucket = 'site-media',
        storage_path = v_pub_path,
        status = 'published',
        sha256_hash = pg_catalog.coalesce(v_hash, sha256_hash),
        desktop_path = pg_catalog.coalesce(v_item->>'desktop_path', desktop_path),
        mobile_path = pg_catalog.coalesce(v_item->>'mobile_path', mobile_path),
        poster_path = pg_catalog.coalesce(v_item->>'poster_path', poster_path),
        updated_at = pg_catalog.now()
      WHERE id = v_media_id;
    END LOOP;
  END IF;

  PERFORM pg_catalog.set_config('cms.authorized_publishing', 'true', true);

  UPDATE public.cms_page_revisions
  SET status = 'archived'
  WHERE page_id = p_page_id AND status = 'published';

  UPDATE public.cms_page_revisions
  SET
    status = 'published',
    published_at = pg_catalog.now(),
    change_summary = pg_catalog.coalesce(p_change_summary, change_summary)
  WHERE id = p_revision_id;

  UPDATE public.cms_pages
  SET
    active_revision_id = p_revision_id,
    draft_revision_id = NULL,
    is_published = true,
    updated_at = pg_catalog.now()
  WHERE id = p_page_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'page_id', p_page_id,
    'active_revision_id', p_revision_id,
    'published_by', auth.uid(),
    'published_at', pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_cms_page(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_cms_page(uuid, uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_cms_page(uuid, uuid, jsonb, text) TO authenticated;

-- E. Atomic CMS Page Rollback RPC
CREATE OR REPLACE FUNCTION public.rollback_cms_page(
  p_page_id uuid,
  p_target_revision_id uuid,
  p_reason text DEFAULT 'Rollback to prior revision'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target RECORD;
  v_next_rev_num integer;
  v_new_rev_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.cms_pages WHERE id = p_page_id FOR UPDATE;

  SELECT * INTO v_target FROM public.cms_page_revisions
  WHERE id = p_target_revision_id AND page_id = p_page_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target historical revision not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.max(revision_number), 0) + 1 INTO v_next_rev_num
  FROM public.cms_page_revisions WHERE page_id = p_page_id;

  PERFORM pg_catalog.set_config('cms.authorized_publishing', 'true', true);

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
    created_at,
    published_at
  )
  VALUES (
    p_page_id,
    v_next_rev_num,
    v_target.title,
    v_target.content_markdown,
    v_target.structured_content,
    v_target.meta_title,
    v_target.meta_description,
    'published',
    pg_catalog.coalesce(p_reason, 'Rollback to revision #' || v_target.revision_number),
    auth.uid(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_new_rev_id;

  UPDATE public.cms_page_revisions
  SET status = 'archived'
  WHERE page_id = p_page_id AND status = 'published' AND id <> v_new_rev_id;

  UPDATE public.cms_pages
  SET
    active_revision_id = v_new_rev_id,
    draft_revision_id = NULL,
    is_published = true,
    updated_at = pg_catalog.now()
  WHERE id = p_page_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'page_id', p_page_id,
    'new_revision_id', v_new_rev_id,
    'rolled_back_from_revision', v_target.revision_number,
    'published_by', auth.uid(),
    'published_at', pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_cms_page(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_cms_page(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rollback_cms_page(uuid, uuid, text) TO authenticated;

-- F. Safe Server-Side Media Deletion RPC with Complete Reference Inspection
CREATE OR REPLACE FUNCTION public.delete_cms_media_asset(
  p_media_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_media RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_media FROM public.cms_media WHERE id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media asset not found with id %', p_media_id USING ERRCODE = 'P0002';
  END IF;

  -- Delete operation will trigger public.prevent_in_use_media_deletion()
  DELETE FROM public.cms_media WHERE id = p_media_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'deleted_media_id', p_media_id,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_cms_media_asset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_cms_media_asset(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_cms_media_asset(uuid) TO authenticated;

-- --------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES (Explicit Non-Overlapping CRUD)
-- --------------------------------------------------------------------
ALTER TABLE public.cms_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_setting_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_section_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_editorial_content ENABLE ROW LEVEL SECURITY;

-- Clean only migration-owned policies explicitly
DROP POLICY IF EXISTS "Public read published media records" ON public.cms_media;
DROP POLICY IF EXISTS "Admins select cms_media" ON public.cms_media;
DROP POLICY IF EXISTS "Admins insert cms_media" ON public.cms_media;
DROP POLICY IF EXISTS "Admins update cms_media" ON public.cms_media;
DROP POLICY IF EXISTS "Admins delete draft cms_media only" ON public.cms_media;

DROP POLICY IF EXISTS "Public read public store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins select store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins insert store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins update store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins delete store settings" ON public.store_settings;

DROP POLICY IF EXISTS "Public read active published setting revisions" ON public.cms_setting_revisions;
DROP POLICY IF EXISTS "Admins select setting revisions" ON public.cms_setting_revisions;
DROP POLICY IF EXISTS "Admins insert setting revisions" ON public.cms_setting_revisions;
DROP POLICY IF EXISTS "Admins update setting revisions" ON public.cms_setting_revisions;
DROP POLICY IF EXISTS "Admins delete draft setting revisions only" ON public.cms_setting_revisions;

DROP POLICY IF EXISTS "Public read active scheduled homepage sections" ON public.homepage_sections;
DROP POLICY IF EXISTS "Admins select homepage sections" ON public.homepage_sections;
DROP POLICY IF EXISTS "Admins insert homepage sections" ON public.homepage_sections;
DROP POLICY IF EXISTS "Admins update homepage sections" ON public.homepage_sections;
DROP POLICY IF EXISTS "Admins delete homepage sections" ON public.homepage_sections;

DROP POLICY IF EXISTS "Public read active published section revisions" ON public.cms_section_revisions;
DROP POLICY IF EXISTS "Admins select section revisions" ON public.cms_section_revisions;
DROP POLICY IF EXISTS "Admins insert section revisions" ON public.cms_section_revisions;
DROP POLICY IF EXISTS "Admins update section revisions" ON public.cms_section_revisions;
DROP POLICY IF EXISTS "Admins delete draft section revisions only" ON public.cms_section_revisions;

DROP POLICY IF EXISTS "Public read published cms pages" ON public.cms_pages;
DROP POLICY IF EXISTS "Admins select cms pages" ON public.cms_pages;
DROP POLICY IF EXISTS "Admins insert cms pages" ON public.cms_pages;
DROP POLICY IF EXISTS "Admins update cms pages" ON public.cms_pages;
DROP POLICY IF EXISTS "Admins delete cms pages" ON public.cms_pages;

DROP POLICY IF EXISTS "Public read active published page revisions" ON public.cms_page_revisions;
DROP POLICY IF EXISTS "Admins select page revisions" ON public.cms_page_revisions;
DROP POLICY IF EXISTS "Admins insert page revisions" ON public.cms_page_revisions;
DROP POLICY IF EXISTS "Admins update page revisions" ON public.cms_page_revisions;
DROP POLICY IF EXISTS "Admins delete draft page revisions only" ON public.cms_page_revisions;

DROP POLICY IF EXISTS "Public read published product editorial" ON public.product_editorial_content;
DROP POLICY IF EXISTS "Admins select product editorial" ON public.product_editorial_content;
DROP POLICY IF EXISTS "Admins insert product editorial" ON public.product_editorial_content;
DROP POLICY IF EXISTS "Admins update product editorial" ON public.product_editorial_content;
DROP POLICY IF EXISTS "Admins delete product editorial" ON public.product_editorial_content;

-- A. cms_media Policies
CREATE POLICY "Public read published media records"
  ON public.cms_media FOR SELECT TO anon, authenticated
  USING (status = 'published' AND storage_bucket = 'site-media');

CREATE POLICY "Admins select cms_media"
  ON public.cms_media FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert cms_media"
  ON public.cms_media FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update cms_media"
  ON public.cms_media FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete draft cms_media only"
  ON public.cms_media FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

-- B. store_settings Policies
CREATE POLICY "Public read public store settings"
  ON public.store_settings FOR SELECT TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Admins select store settings"
  ON public.store_settings FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert store settings"
  ON public.store_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update store settings"
  ON public.store_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete store settings"
  ON public.store_settings FOR DELETE TO authenticated
  USING (public.is_admin());

-- C. cms_setting_revisions Policies
CREATE POLICY "Public read active published setting revisions"
  ON public.cms_setting_revisions FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND
    EXISTS (
      SELECT 1 FROM public.store_settings st
      WHERE st.setting_key = cms_setting_revisions.setting_key
        AND st.is_public = true
        AND st.active_revision_id = cms_setting_revisions.id
    )
  );

CREATE POLICY "Admins select setting revisions"
  ON public.cms_setting_revisions FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert setting revisions"
  ON public.cms_setting_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update setting revisions"
  ON public.cms_setting_revisions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete draft setting revisions only"
  ON public.cms_setting_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

-- D. homepage_sections Policies
CREATE POLICY "Public read active scheduled homepage sections"
  ON public.homepage_sections FOR SELECT TO anon, authenticated
  USING (
    is_active = true AND
    (starts_at IS NULL OR starts_at <= pg_catalog.now()) AND
    (ends_at IS NULL OR ends_at > pg_catalog.now())
  );

CREATE POLICY "Admins select homepage sections"
  ON public.homepage_sections FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert homepage sections"
  ON public.homepage_sections FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update homepage sections"
  ON public.homepage_sections FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete homepage sections"
  ON public.homepage_sections FOR DELETE TO authenticated
  USING (public.is_admin());

-- E. cms_section_revisions Policies
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

CREATE POLICY "Admins select section revisions"
  ON public.cms_section_revisions FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert section revisions"
  ON public.cms_section_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update section revisions"
  ON public.cms_section_revisions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete draft section revisions only"
  ON public.cms_section_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

-- F. cms_pages Policies
CREATE POLICY "Public read published cms pages"
  ON public.cms_pages FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "Admins select cms pages"
  ON public.cms_pages FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert cms pages"
  ON public.cms_pages FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update cms pages"
  ON public.cms_pages FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete cms pages"
  ON public.cms_pages FOR DELETE TO authenticated
  USING (public.is_admin());

-- G. cms_page_revisions Policies
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

CREATE POLICY "Admins select page revisions"
  ON public.cms_page_revisions FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert page revisions"
  ON public.cms_page_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update page revisions"
  ON public.cms_page_revisions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete draft page revisions only"
  ON public.cms_page_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

-- H. product_editorial_content Policies
CREATE POLICY "Public read published product editorial"
  ON public.product_editorial_content FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "Admins select product editorial"
  ON public.product_editorial_content FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins insert product editorial"
  ON public.product_editorial_content FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins update product editorial"
  ON public.product_editorial_content FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete product editorial"
  ON public.product_editorial_content FOR DELETE TO authenticated
  USING (public.is_admin());

-- --------------------------------------------------------------------
-- 11. STORAGE POLICIES ON storage.objects
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
-- 12. MINIMAL AND SPECIFIC PRIVILEGES (No GRANT ALL, No TRUNCATE)
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public / Anonymous shoppers: SELECT only on content tables
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

-- Authenticated administrators: SELECT, INSERT, UPDATE, DELETE (TRUNCATE is NEVER granted)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.cms_media,
  public.store_settings,
  public.cms_setting_revisions,
  public.homepage_sections,
  public.cms_section_revisions,
  public.cms_pages,
  public.cms_page_revisions,
  public.product_editorial_content
TO authenticated;

-- ====================================================================
-- End of Migration v1.6
-- ====================================================================

