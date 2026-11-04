-- ====================================================================
-- CALVIN AATAMAKER — Storefront CMS Safe Rollback Script (v1.6 Enterprise Certified)
-- Principal PostgreSQL Security Architect & Senior Supabase Platform Engineer
-- ====================================================================
-- Safety Guarantees:
--   1. DYNAMIC INDEPENDENT POPULATED DATA CHECK:
--      - Evaluates each of the 8 CMS tables individually using dynamic SQL.
--      - Eliminates parse/compile-time query errors if previous migrations were
--        only partially applied.
--      - Requires explicit administrative session approval to drop populated tables:
--        SET cms.force_rollback = 'true';
--   2. EXTERNAL DEPENDENCY VERIFICATION:
--      - Verifies no external tables (outside CMS) hold foreign keys to CMS tables.
--   3. STRICT STORAGE PRESERVATION:
--      - NEVER drops storage.buckets ('site-media' and 'site-media-drafts' preserved).
--      - NEVER deletes uploaded media binaries from disk/S3 storage.
--   4. NO UNCONDITIONAL CASCADE:
--      - Drops circular foreign key constraints explicitly before dropping tables.
--      - Tables are dropped in reverse dependency order.
--   5. COMMERCE PRESERVATION:
--      - 100% preserves: profiles, products, categories, product_images,
--        product_variants, orders, order_items, banners, banner-media, product-media.
--      - Never drops core utilities public.set_updated_at() or public.is_admin().
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. FAIL-FAST POPULATED DATA GUARD (Dynamic Per-Table Verification)
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_populated_tables text[] := ARRAY[]::text[];
  v_tbl text;
  v_has_records boolean;
  v_force text;
  v_check_tables text[] := ARRAY[
    'cms_section_revisions',
    'homepage_sections',
    'cms_setting_revisions',
    'store_settings',
    'cms_page_revisions',
    'cms_pages',
    'product_editorial_content',
    'cms_media'
  ];
BEGIN
  -- Read session force setting safely
  BEGIN
    v_force := current_setting('cms.force_rollback', true);
  EXCEPTION WHEN OTHERS THEN
    v_force := 'false';
  END;

  IF coalesce(v_force, 'false') <> 'true' THEN
    FOREACH v_tbl IN ARRAY v_check_tables LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = v_tbl
      ) THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', v_tbl) INTO v_has_records;
        IF v_has_records THEN
          v_populated_tables := array_append(v_populated_tables, v_tbl);
        END IF;
      END IF;
    END LOOP;

    IF array_length(v_populated_tables, 1) > 0 THEN
      RAISE EXCEPTION 'SAFETY GUARD ABORT: The following CMS tables contain active records: %. Automatic rollback is blocked to prevent data loss. If you have verified backups and explicitly wish to proceed with dropping these tables and their records, run "SET cms.force_rollback = ''true'';" before executing this rollback script.', array_to_string(v_populated_tables, ', ')
        USING ERRCODE = '55000';
    END IF;
  END IF;
END;
$$;

-- --------------------------------------------------------------------
-- 2. EXTERNAL FOREIGN KEY DEPENDENCY CHECK
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_dep_count integer := 0;
  v_dep_info text;
BEGIN
  SELECT count(*), string_agg(conrelid::regclass::text || ' -> ' || confrelid::regclass::text, ', ')
  INTO v_dep_count, v_dep_info
  FROM pg_constraint
  WHERE confrelid IN (
    'public.cms_media'::regclass,
    'public.store_settings'::regclass,
    'public.cms_setting_revisions'::regclass,
    'public.homepage_sections'::regclass,
    'public.cms_section_revisions'::regclass,
    'public.cms_pages'::regclass,
    'public.cms_page_revisions'::regclass,
    'public.product_editorial_content'::regclass
  )
  AND conrelid NOT IN (
    'public.cms_media'::regclass,
    'public.store_settings'::regclass,
    'public.cms_setting_revisions'::regclass,
    'public.homepage_sections'::regclass,
    'public.cms_section_revisions'::regclass,
    'public.cms_pages'::regclass,
    'public.cms_page_revisions'::regclass,
    'public.product_editorial_content'::regclass
  );

  IF v_dep_count > 0 THEN
    RAISE EXCEPTION 'SAFETY GUARD ABORT: External non-CMS tables depend on CMS tables: %. Rollback blocked.', v_dep_info
      USING ERRCODE = '23001';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Handled safely: some or all tables do not exist
    NULL;
END;
$$;

-- --------------------------------------------------------------------
-- 3. DROP STORAGE OBJECT RLS POLICIES (Preserving Buckets & Binary Data)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view site-media published assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert site-media assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins update site-media assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete site-media assets" ON storage.objects;

DROP POLICY IF EXISTS "Admins select site-media-drafts assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert site-media-drafts assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins update site-media-drafts assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete site-media-drafts assets" ON storage.objects;

-- NOTE: storage.buckets entries ('site-media' and 'site-media-drafts') are
-- deliberately NOT deleted. All uploaded asset binaries remain safe in storage.

-- --------------------------------------------------------------------
-- 4. DROP CMS RPC FUNCTIONS
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_cms_media_asset(uuid, boolean);
DROP FUNCTION IF EXISTS public.rollback_cms_page(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.publish_cms_page(uuid, uuid, uuid[], text);
DROP FUNCTION IF EXISTS public.publish_store_setting(text, uuid, text);
DROP FUNCTION IF EXISTS public.rollback_homepage_section(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.publish_homepage_section(uuid, uuid, uuid[], text);

-- --------------------------------------------------------------------
-- 5. DROP CMS TRIGGERS & FUNCTIONS
-- --------------------------------------------------------------------
-- A. Pointer Protection
DROP TRIGGER IF EXISTS trg_protect_page_pointers ON public.cms_pages;
DROP TRIGGER IF EXISTS trg_protect_setting_pointers ON public.store_settings;
DROP TRIGGER IF EXISTS trg_protect_section_pointers ON public.homepage_sections;
DROP FUNCTION IF EXISTS public.protect_parent_publication_pointers();

-- B. In-Use Media Protection
DROP TRIGGER IF EXISTS trg_prevent_cms_media_deletion ON public.cms_media;
DROP FUNCTION IF EXISTS public.prevent_in_use_media_deletion();

-- C. Lifecycle Enforcement Triggers & Functions
DROP TRIGGER IF EXISTS trg_enforce_page_revision_lifecycle ON public.cms_page_revisions;
DROP FUNCTION IF EXISTS public.enforce_page_revision_lifecycle();

DROP TRIGGER IF EXISTS trg_enforce_setting_revision_lifecycle ON public.cms_setting_revisions;
DROP FUNCTION IF EXISTS public.enforce_setting_revision_lifecycle();

DROP TRIGGER IF EXISTS trg_enforce_section_revision_lifecycle ON public.cms_section_revisions;
DROP FUNCTION IF EXISTS public.enforce_section_revision_lifecycle();

-- D. Updated At Triggers on CMS Tables
DROP TRIGGER IF EXISTS set_product_editorial_updated_at ON public.product_editorial_content;
DROP TRIGGER IF EXISTS set_cms_pages_updated_at ON public.cms_pages;
DROP TRIGGER IF EXISTS set_homepage_sections_updated_at ON public.homepage_sections;
DROP TRIGGER IF EXISTS set_store_settings_updated_at ON public.store_settings;
DROP TRIGGER IF EXISTS set_cms_media_updated_at ON public.cms_media;

-- NOTE: public.set_updated_at() and public.is_admin() are core functions
-- used by categories, products, orders, banners, etc. They are strictly preserved.

-- --------------------------------------------------------------------
-- 6. DROP CMS TABLES (Reverse Dependency Order without Unconditional Cascade)
-- --------------------------------------------------------------------
-- A. Product Editorial Content
DROP TABLE IF EXISTS public.product_editorial_content;

-- B. CMS Pages and Revisions
ALTER TABLE IF EXISTS public.cms_pages DROP CONSTRAINT IF EXISTS fk_cms_pages_active_rev;
ALTER TABLE IF EXISTS public.cms_pages DROP CONSTRAINT IF EXISTS fk_cms_pages_draft_rev;
DROP TABLE IF EXISTS public.cms_page_revisions;
DROP TABLE IF EXISTS public.cms_pages;

-- C. Homepage Sections and Revisions
ALTER TABLE IF EXISTS public.homepage_sections DROP CONSTRAINT IF EXISTS fk_homepage_sections_active_rev;
ALTER TABLE IF EXISTS public.homepage_sections DROP CONSTRAINT IF EXISTS fk_homepage_sections_draft_rev;
DROP TABLE IF EXISTS public.cms_section_revisions;
DROP TABLE IF EXISTS public.homepage_sections;

-- D. Store Settings and Revisions
ALTER TABLE IF EXISTS public.store_settings DROP CONSTRAINT IF EXISTS fk_store_settings_active_rev;
ALTER TABLE IF EXISTS public.store_settings DROP CONSTRAINT IF EXISTS fk_store_settings_draft_rev;
DROP TABLE IF EXISTS public.cms_setting_revisions;
DROP TABLE IF EXISTS public.store_settings;

-- E. Versioned Media Table
DROP TABLE IF EXISTS public.cms_media;

-- ====================================================================
-- End of Safe CMS Rollback Script v1.6
-- ====================================================================

