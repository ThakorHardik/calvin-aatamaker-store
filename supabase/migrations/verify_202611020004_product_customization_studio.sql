-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Product Customization Studio Schema
-- File: verify_202611020004_product_customization_studio.sql
-- Migration: 202611020004_product_customization_studio.sql
-- ==============================================================================
--
-- Run this script in the Supabase SQL Editor after applying the migration
-- to verify schema and function invariants without modifying any data.
--
-- ==============================================================================

\echo '--- [CHECK 1] Verify customization_config column exists on public.products ---'
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'customization_config';

\echo '--- [CHECK 2] Verify public.create_checkout_order exists and has correct security settings ---'
SELECT
    p.proname AS function_name,
    n.nspname AS schema_name,
    pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS is_security_definer,
    p.proconfig AS runtime_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_checkout_order';

\echo '--- [CHECK 3] Verify EXECUTE permissions on create_checkout_order ---'
-- PUBLIC, anon, and authenticated must NOT have execute permissions.
-- service_role MUST have execute permissions.
SELECT
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name = 'create_checkout_order'
ORDER BY grantee;

\echo '--- [CHECK 4] Verify order_items.customisation_details column exists ---'
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_items'
  AND column_name = 'customisation_details';

