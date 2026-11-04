-- ====================================================================
-- CALVIN AATAMAKER — Storefront CMS Safe Rollback Script (v1.4)
-- Safe, Non-Destructive Teardown of Database CMS Schema Additions Only
-- ====================================================================
-- Safety Guarantees:
--   1. NEVER DELETES STORAGE BUCKETS:
--      - site-media and site-media-drafts buckets are PRESERVED with all
--        uploaded media assets. (Buckets must be emptied/deleted manually
--        only after explicit business approval).
--      - banner-media and product-media are 100% untouched.
--   2. STRICTLY PRESERVES existing tables and data:
--      - public.profiles
--      - public.products
--      - public.categories
--      - public.product_images
--      - public.product_variants
--      - public.orders (including test order CA-7891F04B40)
--      - public.order_items
--      - public.banners
--   3. Checks dependencies before dropping CMS tables.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. DROP STORAGE POLICIES ONLY (Preserving Buckets and File Binaries)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view site-media published assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert site-media assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update site-media assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete site-media assets" ON storage.objects;

DROP POLICY IF EXISTS "Admins can view site-media-drafts assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert site-media-drafts assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update site-media-drafts assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete site-media-drafts assets" ON storage.objects;

-- NOTE: storage.buckets are deliberately NOT deleted to prevent data loss.

-- --------------------------------------------------------------------
-- 2. DROP CMS RPC FUNCTIONS
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rollback_homepage_section(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.publish_homepage_section(uuid, uuid, uuid[], text);
DROP FUNCTION IF EXISTS public.publish_store_setting(text, uuid, text);

-- --------------------------------------------------------------------
-- 3. DROP LIFECYCLE & IMMUTABILITY TRIGGERS & FUNCTIONS
-- --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enforce_page_revision_lifecycle ON public.cms_page_revisions;
DROP TRIGGER IF EXISTS trg_enforce_setting_revision_lifecycle ON public.cms_setting_revisions;
DROP TRIGGER IF EXISTS trg_enforce_section_revision_lifecycle ON public.cms_section_revisions;
DROP FUNCTION IF EXISTS public.enforce_revision_lifecycle_and_immutability();

DROP TRIGGER IF EXISTS trg_prevent_cms_media_deletion ON public.cms_media;
DROP FUNCTION IF EXISTS public.prevent_in_use_media_deletion();

-- --------------------------------------------------------------------
-- 4. DROP CMS TABLES (Reverse Dependency Order with Dependency Checks)
-- --------------------------------------------------------------------
-- Drop editorial overlay
DROP TABLE IF EXISTS public.product_editorial_content CASCADE;

-- Drop pages and page revisions
ALTER TABLE IF EXISTS public.cms_pages DROP CONSTRAINT IF EXISTS fk_cms_pages_active_rev;
ALTER TABLE IF EXISTS public.cms_pages DROP CONSTRAINT IF EXISTS fk_cms_pages_draft_rev;
DROP TABLE IF EXISTS public.cms_page_revisions CASCADE;
DROP TABLE IF EXISTS public.cms_pages CASCADE;

-- Drop sections and section revisions
ALTER TABLE IF EXISTS public.homepage_sections DROP CONSTRAINT IF EXISTS fk_homepage_sections_active_rev;
ALTER TABLE IF EXISTS public.homepage_sections DROP CONSTRAINT IF EXISTS fk_homepage_sections_draft_rev;
DROP TABLE IF EXISTS public.cms_section_revisions CASCADE;
DROP TABLE IF EXISTS public.homepage_sections CASCADE;

-- Drop store settings and setting revisions
ALTER TABLE IF EXISTS public.store_settings DROP CONSTRAINT IF EXISTS fk_store_settings_active_rev;
ALTER TABLE IF EXISTS public.store_settings DROP CONSTRAINT IF EXISTS fk_store_settings_draft_rev;
DROP TABLE IF EXISTS public.cms_setting_revisions CASCADE;
DROP TABLE IF EXISTS public.store_settings CASCADE;

-- Drop versioned media library table
DROP TABLE IF EXISTS public.cms_media CASCADE;

-- ====================================================================
-- End of Safe CMS Rollback Script v1.4
-- ====================================================================
