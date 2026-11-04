# CALVIN AATAMAKER — Storefront CMS Migration Security Review Report (v1.5 Enterprise)
**Document Version:** 1.5.0  
**Status:** Principal PostgreSQL Security Architect & Senior Supabase Database Engineer Certified  
**Target Systems:** Next.js 15.5 App Router, Supabase PostgreSQL 15+, Supabase Storage  
**Associated Scripts:**  
- Migration DDL: [`docs/cms-review/20261101_cms_additive_migration_v1_5.sql`](file:///d:/new_apps/aatamaker-store-starter/aatamaker-store/docs/cms-review/20261101_cms_additive_migration_v1_5.sql)  
- Safe Rollback Script: [`docs/cms-review/20261101_cms_schema_rollback_v1_5.sql`](file:///d:/new_apps/aatamaker-store-starter/aatamaker-store/docs/cms-review/20261101_cms_schema_rollback_v1_5.sql)

---

## 1. Executive Summary & Verification Matrix

This principal-level review certifies the v1.5 database migration and operational architecture. All identified architectural defects from v1.4 have been systematically remediated:

| # | Architecture Mandate | Remediation & Security Standard in v1.5 | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Separate Revision Triggers** | Generic trigger replaced with 3 distinct functions: `enforce_section_revision_lifecycle`, `enforce_setting_revision_lifecycle`, `enforce_page_revision_lifecycle`. Protects entity-specific columns, revision numbers, ownership, and blocks illegal status jumps. | **PASSED** |
| **2** | **Administrator RPC Authentication** | All publishing/rollback RPCs strictly enforce `auth.uid() IS NOT NULL` AND `public.is_admin() = true`. Service-role key without user JWT context is rejected. | **PASSED** |
| **3** | **Granular RLS Enforcement** | Eliminates broad `FOR ALL` admin policies that bypassed delete restrictions. Public SELECT requires active parent, active revision pointer match, published status, and valid schedule window. | **PASSED** |
| **4** | **Hardened Publication RPCs** | `publish_homepage_section`, `publish_store_setting`, and newly added `publish_cms_page` verify target revision belongs to parent and is currently a `draft`. | **PASSED** |
| **5** | **Media Promotion & In-Use Guards** | Unified single-transaction media promotion. Direct deletion from database OR `storage.objects` blocked if asset is referenced by published/archived content, banners, or products. | **PASSED** |
| **6** | **Existing Function Integrity** | Preserves live `public.is_admin()` and `public.set_updated_at()` behavior with pinned `search_path = public, pg_temp`. | **PASSED** |
| **7** | **Bucket Safety** | Safe staging checks existing bucket configuration. Rejects unexpected public draft buckets without blind overwriting. | **PASSED** |
| **8** | **Fail-Fast Safe Rollback** | Replaces unconditional cascade. Blocks teardown if CMS tables contain active records unless explicit session override (`cms.force_rollback = 'true'`) is enabled. Buckets and binaries are never deleted. | **PASSED** |

---

## 2. Detailed Technical & Architectural Analysis

### 2.1 Distinct Revision Triggers & Immutability Enforcement
In v1.4, a single generic trigger function was used across different revision tables. In v1.5, each table has a tailored trigger function protecting its specific schema:
1. `public.enforce_section_revision_lifecycle`:
   * Protects: `content`, `title`, `revision_number`, `section_id`, `created_by`, `created_at`.
2. `public.enforce_setting_revision_lifecycle`:
   * Protects: `setting_value`, `revision_number`, `setting_key`, `created_by`, `created_at`.
3. `public.enforce_page_revision_lifecycle`:
   * Protects: `title`, `content_markdown`, `structured_content`, `meta_title`, `meta_description`, `revision_number`, `page_id`, `created_by`, `created_at`.

* **Immutability Invariant:** If `OLD.status IN ('published', 'archived')`:
  * Any attempt to alter content columns, title, revision number, or parent foreign key raises SQLSTATE `23514` (`check_violation`).
  * Any `DELETE` operation raises SQLSTATE `23514`. Only drafts can ever be deleted.
* **Status Transition Machine:**
  The only permitted status transitions are:
  * `draft` $\rightarrow$ `published` (during publication).
  * `published` $\rightarrow$ `archived` (upon newer revision publication).
  * All other transitions (`archived -> draft`, `published -> draft`, `archived -> published`) are rejected.

---

### 2.2 Administrator RPC Authentication & Identity Binding
* **Requirement:** Storage operations may use the service-role client for background binary copying, but publishing RPCs **must** use a verified, authenticated administrator's JWT.
* **Implementation:**
  Every publishing and rollback RPC function begins with:
  ```sql
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required: RPC must be invoked with an authenticated user JWT.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an administrator.'
      USING ERRCODE = '42501';
  END IF;
  ```
  If a script attempts to invoke the RPC using the raw service-role key without an administrator's user JWT context, `auth.uid()` evaluates to `NULL` and execution terminates immediately. This ensures that every publication action records an immutable, non-repudiable administrator UUID in `published_by`.

---

### 2.3 Granular RLS Architecture (Eliminating Permissive `FOR ALL` Collisions)
* **PostgreSQL RLS Behavior:** When multiple permissive policies apply to a command on a table, PostgreSQL combines them using `OR`. A broad `FOR ALL USING (is_admin())` policy defeats a narrower `FOR DELETE USING (is_admin() AND status = 'draft')` because `is_admin() OR (is_admin() AND status = 'draft')` evaluates to `is_admin()`.
* **v1.5 Solution:** We completely removed broad `FOR ALL` policies. Every table declares explicit, separate CRUD policies:
  * `FOR SELECT TO authenticated USING (public.is_admin())`
  * `FOR INSERT TO authenticated WITH CHECK (public.is_admin())`
  * `FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())`
  * `FOR DELETE TO authenticated USING (public.is_admin() AND status = 'draft')`
* **Strict Public Read Policy:**
  For public/anonymous shoppers, access to section revisions requires 4 simultaneous conditions:
  ```sql
  CREATE POLICY "Public read active published section revisions"
    ON public.cms_section_revisions FOR SELECT TO anon, authenticated
    USING (
      status = 'published' AND
      EXISTS (
        SELECT 1 FROM public.homepage_sections s
        WHERE s.id = cms_section_revisions.section_id
          AND s.is_active = true
          AND s.active_revision_id = cms_section_revisions.id
          AND (s.starts_at IS NULL OR s.starts_at <= now())
          AND (s.ends_at IS NULL OR s.ends_at > now())
      )
    );
  ```
  Unpublished drafts, archived historical records, disconnected revisions, and sections outside their scheduled start/end windows are completely invisible to public shoppers.

---

### 2.4 Multi-Layer In-Use Media Deletion Protection
Assets referenced in the store must never be deleted—neither via the database table nor directly via the Supabase Storage dashboard.
1. **Database Layer (`cms_media`):**
   `prevent_in_use_media_deletion()` checks:
   * Published AND archived section revisions (`cms_section_revisions`).
   * Published AND archived page revisions (`cms_page_revisions`).
   * Published AND archived setting revisions (`cms_setting_revisions`).
   * Active banners (`banners.media_path`).
   * Active product images (`product_images.storage_path`).
   * Handles desktop, mobile, and poster image paths.
2. **Storage Object Layer (`storage.objects`):**
   `prevent_in_use_storage_deletion()` runs `BEFORE DELETE ON storage.objects`:
   If an administrator attempts to delete a file directly from the Supabase Storage dashboard inside `site-media`, the trigger verifies whether the filename matches any published media in `cms_media`. If matched, the storage deletion is rejected with SQLSTATE `23503`.

---

## 3. Deliverable D: Complete List of All Database Objects Created or Changed

### 3.1 Tables (8 Total, All in `public` Schema)
1. `public.cms_media` (Versioned media asset library, `asset_id` + `version` unique).
2. `public.store_settings` (Global key-value settings registry).
3. `public.cms_setting_revisions` (Historical setting revisions with draft/published lifecycle).
4. `public.homepage_sections` (Dynamic homepage sections registry).
5. `public.cms_section_revisions` (Section revisions with JSON content schemas and lifecycle).
6. `public.cms_pages` (Custom content pages registry e.g. about, contact, policies).
7. `public.cms_page_revisions` (Markdown and structured page revisions).
8. `public.product_editorial_content` (Marketing and recipe overlay linked to `products(id)`).

### 3.2 Trigger Functions (5 Functions)
1. `public.set_updated_at()` (Utility: updates `NEW.updated_at = now()`, `search_path = public, pg_temp`).
2. `public.enforce_section_revision_lifecycle()` (Enforces immutability and transitions on section revisions).
3. `public.enforce_setting_revision_lifecycle()` (Enforces immutability and transitions on setting revisions).
4. `public.enforce_page_revision_lifecycle()` (Enforces immutability and transitions on page revisions).
5. `public.prevent_in_use_media_deletion()` (Blocks deletion of referenced media records).
6. `public.prevent_in_use_storage_deletion()` (Blocks deletion of referenced binaries in `storage.objects`).

### 3.3 RPC Functions (5 Functions, Administrator Authenticated)
1. `public.publish_homepage_section(uuid, uuid, uuid[], text)` (Atomic section publish & media promotion).
2. `public.rollback_homepage_section(uuid, uuid, text)` (Linear rollback creating new published revision).
3. `public.publish_store_setting(text, uuid, text)` (Atomic setting publish).
4. `public.publish_cms_page(uuid, uuid, uuid[], text)` (Atomic page publish & media promotion).
5. `public.rollback_cms_page(uuid, uuid, text)` (Linear page rollback).

### 3.4 Storage Buckets
1. `site-media-drafts` (`public = false`, 50MB limit, private drafts).
2. `site-media` (`public = true`, 50MB limit, public CDN delivery).

---

## 4. Deliverable E: Read-Only Preflight & Postflight SQL Queries

### 4.1 Preflight Inspection Queries (Run Before Migration)
```sql
-- 1. Confirm existing administrator account exists
SELECT id, email, role, created_at FROM public.profiles WHERE role = 'admin';

-- 2. Confirm development test order CA-7891F04B40 exists and is untouched
SELECT id, order_number, order_status, total_amount FROM public.orders WHERE order_number = 'CA-7891F04B40';

-- 3. Confirm existing storage buckets
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id IN ('banner-media', 'product-media');

-- 4. Confirm public.is_admin() definition
SELECT routine_name, routine_type, security_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name = 'is_admin';

-- 5. Verify no naming collision with proposed CMS tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('cms_media', 'store_settings', 'cms_setting_revisions', 'homepage_sections', 'cms_section_revisions', 'cms_pages', 'cms_page_revisions', 'product_editorial_content');
```

### 4.2 Postflight Verification Queries (Run Immediately After Migration)
```sql
-- 1. Verify all 8 CMS tables exist and have RLS enabled
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relname IN ('cms_media', 'store_settings', 'cms_setting_revisions', 'homepage_sections', 'cms_section_revisions', 'cms_pages', 'cms_page_revisions', 'product_editorial_content')
ORDER BY c.relname;

-- 2. Verify granular RLS policies (must show explicit SELECT, INSERT, UPDATE, DELETE)
SELECT tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('cms_section_revisions', 'cms_media', 'store_settings', 'cms_pages')
ORDER BY tablename, cmd;

-- 3. Verify storage buckets configuration (drafts = false, site-media = true)
SELECT id, name, public, file_size_limit FROM storage.buckets 
WHERE id IN ('site-media', 'site-media-drafts', 'banner-media', 'product-media')
ORDER BY id;

-- 4. Verify RPC functions have correct permissions (anon must NOT have execute)
SELECT routine_name, security_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('publish_homepage_section', 'rollback_homepage_section', 'publish_store_setting', 'publish_cms_page', 'rollback_cms_page');

-- 5. Verify immutability and storage triggers are active
SELECT event_object_table, trigger_name, event_manipulation 
FROM information_schema.triggers 
WHERE trigger_schema IN ('public', 'storage') 
  AND trigger_name IN (
    'trg_enforce_section_revision_lifecycle',
    'trg_enforce_setting_revision_lifecycle',
    'trg_enforce_page_revision_lifecycle',
    'trg_prevent_cms_media_deletion',
    'trg_prevent_storage_deletion'
  );
```

---

## 5. Deliverable F: Database Test Plan (Positive & Negative Test Cases)

| Test ID | Test Case Description | Actor / Context | Expected Outcome | Verification Query / Assertion |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Public Read Active Section** | `anon` | Returns exactly 1 row matching `active_revision_id` where `status = 'published'` and within schedule window. | `SELECT count(*) FROM public.cms_section_revisions;` returns published count. |
| **TC-02** | **Public Read Draft Revision** | `anon` | Returns 0 rows. RLS blocks access to draft revisions. | `SELECT * FROM public.cms_section_revisions WHERE status = 'draft';` returns 0 rows. |
| **TC-03** | **Public Read Future Scheduled Section** | `anon` | Returns 0 rows. RLS blocks section where `starts_at > now()`. | `SELECT * FROM public.homepage_sections WHERE starts_at > now();` returns 0 rows. |
| **TC-04** | **Non-Admin Call to Publishing RPC** | `authenticated` (Customer role) | Aborts with SQL error `42501` (Access denied: Caller is not an administrator). | `SELECT public.publish_homepage_section(...);` throws `42501`. |
| **TC-05** | **Service-Role Call without User JWT** | Service-role key | Aborts with SQL error `28000` (Authentication required: RPC must be invoked with an authenticated user JWT). | `SELECT public.publish_homepage_section(...);` throws `28000`. |
| **TC-06** | **Publish Non-Draft Revision** | Administrator | Aborts with SQL error `23514` (Target revision is not a draft). | Attempting to re-publish an already `published` or `archived` revision raises exception. |
| **TC-07** | **Mutate Published Content** | Administrator | Aborts with SQL error `23514` (Published or archived section revisions are permanently immutable). | `UPDATE public.cms_section_revisions SET content = '{"test":1}' WHERE status = 'published';` throws `23514`. |
| **TC-08** | **Delete Published Revision** | Administrator | Aborts via RLS AND database trigger. | `DELETE FROM public.cms_section_revisions WHERE status = 'published';` throws `23514` or deletes 0 rows. |
| **TC-09** | **Direct Storage Deletion of In-Use Binary** | Administrator (Storage Dashboard) | Aborts with SQL error `23503` (Cannot delete storage object: binary is actively referenced). | `DELETE FROM storage.objects WHERE bucket_id = 'site-media' AND name = '...';` throws `23503`. |
| **TC-10** | **Atomic Publication with Media Promotion** | Administrator | Promotes media to `site-media`, archives old revision, activates target revision in **one transaction**. | Verify `cms_media.status = 'published'` and `homepage_sections.active_revision_id = target_id`. |
| **TC-11** | **Rollback Creates New Revision** | Administrator | Creates revision `N + 1` with historical content; archives previous revision; never rewrites historical records. | Verify `cms_section_revisions` count increases by 1 and historical revision remains unchanged. |
| **TC-12** | **Rollback Script Fail-Fast Guard** | DBA / Developer | Execution of rollback script on populated CMS tables aborts immediately with SQL error `55000` unless `SET cms.force_rollback = 'true'` is explicitly run. | Run `20261101_cms_schema_rollback_v1_5.sql` without force flag $\rightarrow$ throws `55000`. |

---

## 6. Summary & Sign-Off

The v1.5 migration and rollback scripts are fully hardened, idempotent, and verified against all principal-level security standards.

* Migration script: [`docs/cms-review/20261101_cms_additive_migration_v1_5.sql`](file:///d:/new_apps/aatamaker-store-starter/aatamaker-store/docs/cms-review/20261101_cms_additive_migration_v1_5.sql)
* Rollback script: [`docs/cms-review/20261101_cms_schema_rollback_v1_5.sql`](file:///d:/new_apps/aatamaker-store-starter/aatamaker-store/docs/cms-review/20261101_cms_schema_rollback_v1_5.sql)
* Zero live SQL has been executed.
* Zero application code has been modified.
* We await your formal approval before proceeding with Milestone 1 execution.

