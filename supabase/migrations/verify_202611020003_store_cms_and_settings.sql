-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Store CMS & Settings Schema
-- File: verify_202611020003_store_cms_and_settings.sql
-- Migration: 202611020003_store_cms_and_settings.sql
-- ==============================================================================
--
-- Run this script in the Supabase SQL Editor after applying the migration
-- to verify schema and security invariants without modifying any data.
--
-- ==============================================================================

\echo '--- [CHECK 1] Verify RLS is enabled on CMS and store settings tables ---'
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('store_settings', 'homepage_sections', 'cms_pages')
ORDER BY c.relname;

\echo '--- [CHECK 2] Verify table columns and constraints for CMS tables ---'
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('store_settings', 'homepage_sections', 'cms_pages')
ORDER BY table_name, ordinal_position;

\echo '--- [CHECK 3] Verify additive columns on products and product_variants ---'
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'products' AND column_name IN ('meta_title', 'meta_description'))
    OR
    (table_name = 'product_variants' AND column_name IN ('price', 'options', 'sort_order'))
  )
ORDER BY table_name, column_name;

\echo '--- [CHECK 4] Verify RLS policies on CMS and store settings tables ---'
SELECT
    tablename,
    policyname,
    roles,
    cmd,
    permissive,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('store_settings', 'homepage_sections', 'cms_pages')
ORDER BY tablename, policyname;

\echo '--- [CHECK 5] Assert ZERO anonymous / public mutation policies exist on public CMS tables ---'
-- This query MUST return 0 rows.
SELECT
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('store_settings', 'homepage_sections', 'cms_pages')
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND (roles && ARRAY['anon', 'public']::name[]);

\echo '--- [CHECK 6] Verify table grants across roles ---'
SELECT
    table_name,
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('store_settings', 'homepage_sections', 'cms_pages')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

\echo '--- [CHECK 7] Verify storage buckets exist and are public ---'
SELECT
    id,
    name,
    public,
    created_at
FROM storage.buckets
WHERE id IN ('product-media', 'banner-media')
ORDER BY id;

\echo '--- [CHECK 8] Verify storage object policies for media buckets ---'
SELECT
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname ILIKE '%media%'
    OR policyname ILIKE '%banner%'
    OR policyname ILIKE '%product%'
  )
ORDER BY policyname;

\echo '--- [CHECK 9] Verify initial seed data rows ---'
SELECT 'store_settings' AS table_name, count(*) AS row_count FROM public.store_settings
UNION ALL
SELECT 'homepage_sections' AS table_name, count(*) AS row_count FROM public.homepage_sections
UNION ALL
SELECT 'cms_pages' AS table_name, count(*) AS row_count FROM public.cms_pages;
