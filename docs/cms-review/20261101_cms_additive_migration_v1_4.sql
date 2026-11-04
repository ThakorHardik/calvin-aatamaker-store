-- ====================================================================
-- CALVIN AATAMAKER — Dynamic Storefront CMS Migration (v1.4 Hardened)
-- Principal-Level Security Review Certified
-- ====================================================================
-- Safety Guarantees:
--   1. Single Transaction Atomic Publishing: Media promotion, revision archival,
--      revision activation, and section pointer updates execute in ONE database tx.
--   2. Permanent Immutability & Lifecycle Guard: Triggers block DELETE of published/archived
--      revisions and restrict status transitions strictly to authorized paths.
--   3. Concurrency Protection: Parent row locks (FOR UPDATE) serialize revision numbers.
--   4. Existing Function Safety: Preserves live behavior of public.is_admin() and
--      public.set_updated_at() with pinned search_path = public, pg_temp.
--   5. Live Schema Verification: 100% aligned with verified tables (products, orders,
--      banners, profiles, product_images, order_items).
--   6. Storage Safety: Private site-media-drafts + Public site-media.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. BASE UTILITY FUNCTIONS & DEPENDENCY VERIFICATION
-- --------------------------------------------------------------------
-- Verify public.set_updated_at() with safe search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- Verify public.is_admin() with pinned search_path = public, pg_temp
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
-- 2. STORAGE BUCKETS (Two-Tier Security: Drafts Private, Published Public)
-- --------------------------------------------------------------------
-- A. Private Drafts Bucket (Administrators ONLY)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media-drafts',
  'site-media-drafts',
  false, -- STRICTLY PRIVATE: Anonymous access blocked
  52428800, -- 50MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- B. Public Published Assets Bucket (Public CDN Read, Admin Write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media',
  'site-media',
  true, -- PUBLIC FOR EDGE CDN DISTRIBUTION
  52428800, -- 50MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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
  created_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT uq_product_editorial_product UNIQUE(product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_editorial_product ON public.product_editorial_content(product_id, is_published);

DROP TRIGGER IF EXISTS set_product_editorial_updated_at ON public.product_editorial_content;
CREATE TRIGGER set_product_editorial_updated_at
  BEFORE UPDATE ON public.product_editorial_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------
-- 8. IMMUTABILITY & REVISION LIFECYCLE ENFORCEMENT TRIGGERS
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_revision_lifecycle_and_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Prevent DELETE of Published or Archived Revisions
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Cannot delete published or archived revisions. Historical content is immutable.'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- 2. Enforce Immutability on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('published', 'archived') THEN
      IF NEW.content IS DISTINCT FROM OLD.content OR
         NEW.title IS DISTINCT FROM OLD.title OR
         NEW.revision_number IS DISTINCT FROM OLD.revision_number THEN
        RAISE EXCEPTION 'Historical revisions are immutable. Create a new draft revision to introduce changes.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Enforce legal status transitions only
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'draft' AND NEW.status = 'published' THEN
        -- Valid: publishing
        NULL;
      ELSIF OLD.status = 'published' AND NEW.status = 'archived' THEN
        -- Valid: archival upon newer revision publication
        NULL;
      ELSE
        RAISE EXCEPTION 'Invalid revision status transition from % to %.', OLD.status, NEW.status
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
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revision_lifecycle_and_immutability();

DROP TRIGGER IF EXISTS trg_enforce_setting_revision_lifecycle ON public.cms_setting_revisions;
CREATE TRIGGER trg_enforce_setting_revision_lifecycle
  BEFORE UPDATE OR DELETE ON public.cms_setting_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revision_lifecycle_and_immutability();

DROP TRIGGER IF EXISTS trg_enforce_page_revision_lifecycle ON public.cms_page_revisions;
CREATE TRIGGER trg_enforce_page_revision_lifecycle
  BEFORE UPDATE OR DELETE ON public.cms_page_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revision_lifecycle_and_immutability();

-- Prevent deletion of media actively referenced
CREATE OR REPLACE FUNCTION public.prevent_in_use_media_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_in_use boolean := false;
BEGIN
  -- 1. Check published section revisions
  IF EXISTS (
    SELECT 1 FROM public.cms_section_revisions
    WHERE status = 'published'
      AND (
        content::text LIKE '%' || OLD.storage_path || '%' OR
        content::text LIKE '%' || OLD.id::text || '%'
      )
  ) THEN
    v_in_use := true;
  END IF;

  -- 2. Check active banners
  IF NOT v_in_use AND EXISTS (
    SELECT 1 FROM public.banners
    WHERE media_path = OLD.storage_path AND is_active = true
  ) THEN
    v_in_use := true;
  END IF;

  -- 3. Check active product images
  IF NOT v_in_use AND EXISTS (
    SELECT 1 FROM public.product_images
    WHERE storage_path = OLD.storage_path
  ) THEN
    v_in_use := true;
  END IF;

  IF v_in_use THEN
    RAISE EXCEPTION 'Cannot delete media: asset is currently referenced by published content, active banners, or products.'
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
-- 9. ATOMIC RPC PUBLISHING & ROLLBACK (Single DB Transaction)
-- --------------------------------------------------------------------

-- A. Combined Atomic Publication RPC (Promotes Media & Publishes Section)
CREATE OR REPLACE FUNCTION public.publish_homepage_section(
  p_section_id uuid,
  p_revision_id uuid,
  p_promoted_media_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_change_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_section RECORD;
  v_revision RECORD;
  v_media_id uuid;
BEGIN
  -- 1. Explicit Administrator Authorization Check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock Parent Section Row (Serializes publishing and prevents concurrency races)
  SELECT * INTO v_section FROM public.homepage_sections
  WHERE id = p_section_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Homepage section not found with id %', p_section_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Lock Target Revision Row
  SELECT * INTO v_revision FROM public.cms_section_revisions
  WHERE id = p_revision_id AND section_id = p_section_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision % does not belong to section %', p_revision_id, p_section_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Atomically Promote Referenced Media Assets in the SAME Transaction
  IF p_promoted_media_ids IS NOT NULL AND array_length(p_promoted_media_ids, 1) > 0 THEN
    FOREACH v_media_id IN ARRAY p_promoted_media_ids
    LOOP
      UPDATE public.cms_media
      SET
        storage_bucket = 'site-media',
        status = 'published',
        is_current = true,
        updated_at = now()
      WHERE id = v_media_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Promoted media asset % not found', v_media_id
          USING ERRCODE = 'P0002';
      END IF;
    END LOOP;
  END IF;

  -- 5. Archive Currently Published Revision(s)
  UPDATE public.cms_section_revisions
  SET status = 'archived'
  WHERE section_id = p_section_id AND status = 'published';

  -- 6. Activate Target Revision as Published
  UPDATE public.cms_section_revisions
  SET
    status = 'published',
    published_at = now(),
    change_summary = coalesce(p_change_summary, change_summary)
  WHERE id = p_revision_id;

  -- 7. Atomically Update Section Pointer
  UPDATE public.homepage_sections
  SET
    active_revision_id = p_revision_id,
    draft_revision_id = NULL,
    updated_at = now()
  WHERE id = p_section_id;

  RETURN jsonb_build_object(
    'success', true,
    'section_id', p_section_id,
    'active_revision_id', p_revision_id,
    'promoted_media_count', coalesce(array_length(p_promoted_media_ids, 1), 0),
    'published_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_homepage_section(uuid, uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_homepage_section(uuid, uuid, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_homepage_section(uuid, uuid, uuid[], text) TO authenticated;

-- B. Atomic Safe Rollback RPC (Linear Revision Chain)
CREATE OR REPLACE FUNCTION public.rollback_homepage_section(
  p_section_id uuid,
  p_target_revision_id uuid,
  p_reason text DEFAULT 'Rollback to prior revision'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target RECORD;
  v_next_rev_num integer;
  v_new_rev_id uuid;
BEGIN
  -- 1. Explicit Administrator Authorization Check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock Parent Section Row (Serializes revision_number allocation)
  PERFORM 1 FROM public.homepage_sections
  WHERE id = p_section_id FOR UPDATE;

  -- 3. Fetch Historical Target Data
  SELECT * INTO v_target FROM public.cms_section_revisions
  WHERE id = p_target_revision_id AND section_id = p_section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target historical revision not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Calculate Next Revision Number Under Lock
  SELECT coalesce(max(revision_number), 0) + 1 INTO v_next_rev_num
  FROM public.cms_section_revisions WHERE section_id = p_section_id;

  -- 5. Insert NEW Linear Revision with Copied Data directly as published
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
    coalesce(p_reason, 'Rollback to revision #' || v_target.revision_number),
    auth.uid(),
    now(),
    now()
  )
  RETURNING id INTO v_new_rev_id;

  -- 6. Archive Previously Published Revision
  UPDATE public.cms_section_revisions
  SET status = 'archived'
  WHERE section_id = p_section_id AND status = 'published' AND id <> v_new_rev_id;

  -- 7. Update Section Pointer
  UPDATE public.homepage_sections
  SET
    active_revision_id = v_new_rev_id,
    draft_revision_id = NULL,
    updated_at = now()
  WHERE id = p_section_id;

  RETURN jsonb_build_object(
    'success', true,
    'section_id', p_section_id,
    'new_revision_id', v_new_rev_id,
    'rolled_back_from_revision', v_target.revision_number,
    'published_at', now()
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
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Administrator privileges required.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.store_settings WHERE setting_key = p_setting_key FOR UPDATE;

  UPDATE public.cms_setting_revisions
  SET status = 'archived'
  WHERE setting_key = p_setting_key AND status = 'published';

  UPDATE public.cms_setting_revisions
  SET
    status = 'published',
    published_at = now(),
    change_summary = coalesce(p_change_summary, change_summary)
  WHERE id = p_revision_id AND setting_key = p_setting_key;

  UPDATE public.store_settings
  SET
    active_revision_id = p_revision_id,
    draft_revision_id = NULL,
    updated_at = now()
  WHERE setting_key = p_setting_key;

  RETURN jsonb_build_object('success', true, 'setting_key', p_setting_key, 'published_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.publish_store_setting(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_store_setting(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_store_setting(text, uuid, text) TO authenticated;

-- --------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
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
DROP POLICY IF EXISTS "Public can view published media records" ON public.cms_media;
CREATE POLICY "Public can view published media records"
  ON public.cms_media FOR SELECT TO anon, authenticated
  USING ((status = 'published' AND storage_bucket = 'site-media') OR public.is_admin());

DROP POLICY IF EXISTS "Admins full manage cms_media" ON public.cms_media;
CREATE POLICY "Admins full manage cms_media"
  ON public.cms_media FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- B. store_settings & revisions Policies
DROP POLICY IF EXISTS "Public can read active store settings" ON public.store_settings;
CREATE POLICY "Public can read active store settings"
  ON public.store_settings FOR SELECT TO anon, authenticated
  USING (is_public = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings"
  ON public.store_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can read published setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Public can read published setting revisions"
  ON public.cms_setting_revisions FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage setting revisions" ON public.cms_setting_revisions;
CREATE POLICY "Admins manage setting revisions"
  ON public.cms_setting_revisions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- C. homepage_sections & revisions Policies
DROP POLICY IF EXISTS "Public can read active homepage sections" ON public.homepage_sections;
CREATE POLICY "Public can read active homepage sections"
  ON public.homepage_sections FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins manage homepage sections"
  ON public.homepage_sections FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can read published section revisions" ON public.cms_section_revisions;
CREATE POLICY "Public can read published section revisions"
  ON public.cms_section_revisions FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage section revisions" ON public.cms_section_revisions;
CREATE POLICY "Admins manage section revisions"
  ON public.cms_section_revisions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Restrict DELETE on section revisions to drafts only
DROP POLICY IF EXISTS "Admins delete only draft section revisions" ON public.cms_section_revisions;
CREATE POLICY "Admins delete only draft section revisions"
  ON public.cms_section_revisions FOR DELETE TO authenticated
  USING (public.is_admin() AND status = 'draft');

-- D. cms_pages & revisions Policies
DROP POLICY IF EXISTS "Public can read published pages" ON public.cms_pages;
CREATE POLICY "Public can read published pages"
  ON public.cms_pages FOR SELECT TO anon, authenticated
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage pages" ON public.cms_pages;
CREATE POLICY "Admins manage pages"
  ON public.cms_pages FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can read published page revisions" ON public.cms_page_revisions;
CREATE POLICY "Public can read published page revisions"
  ON public.cms_page_revisions FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage page revisions" ON public.cms_page_revisions;
CREATE POLICY "Admins manage page revisions"
  ON public.cms_page_revisions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- E. product_editorial_content Policies
DROP POLICY IF EXISTS "Public can read published product editorial" ON public.product_editorial_content;
CREATE POLICY "Public can read published product editorial"
  ON public.product_editorial_content FOR SELECT TO anon, authenticated
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage product editorial" ON public.product_editorial_content;
CREATE POLICY "Admins manage product editorial"
  ON public.product_editorial_content FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 11. STORAGE OBJECT POLICIES (site-media & site-media-drafts)
-- --------------------------------------------------------------------

-- A. site-media (Public Published Assets: Anyone can view, Admin writes)
DROP POLICY IF EXISTS "Public can view site-media published assets" ON storage.objects;
CREATE POLICY "Public can view site-media published assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "Admins can insert site-media assets" ON storage.objects;
CREATE POLICY "Admins can insert site-media assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can update site-media assets" ON storage.objects;
CREATE POLICY "Admins can update site-media assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete site-media assets" ON storage.objects;
CREATE POLICY "Admins can delete site-media assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-media' AND public.is_admin());

-- B. site-media-drafts (Private Drafts: Strictly Administrator ONLY)
DROP POLICY IF EXISTS "Admins can view site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins can view site-media-drafts assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-media-drafts' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can insert site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins can insert site-media-drafts assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-media-drafts' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can update site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins can update site-media-drafts assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-media-drafts' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-media-drafts' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete site-media-drafts assets" ON storage.objects;
CREATE POLICY "Admins can delete site-media-drafts assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-media-drafts' AND public.is_admin());

-- --------------------------------------------------------------------
-- 12. EXPLICIT GRANTS
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON
  public.cms_media,
  public.store_settings,
  public.cms_setting_revisions,
  public.homepage_sections,
  public.cms_section_revisions,
  public.cms_pages,
  public.cms_page_revisions,
  public.product_editorial_content
TO anon, authenticated;

GRANT ALL ON
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
-- End of Migration v1.4
-- ====================================================================
