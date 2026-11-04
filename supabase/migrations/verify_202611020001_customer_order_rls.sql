-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Customer Order RLS
-- File: verify_202611020001_customer_order_rls.sql
-- Migration: 202611020001_customer_order_rls.sql
-- ==============================================================================
--
-- Run this script in the Supabase SQL Editor after applying the migration
-- to verify security invariants without modifying any data.
--
-- ==============================================================================

\echo '--- [CHECK 1] Verify RLS is enabled on orders and order_items ---'
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('orders', 'order_items')
ORDER BY c.relname;

\echo '--- [CHECK 2] Verify SELECT policies on orders and order_items ---'
SELECT
    tablename,
    policyname,
    roles,
    cmd,
    permissive,
    qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items')
ORDER BY tablename, policyname;

\echo '--- [CHECK 3] Assert ZERO customer write/mutation policies exist ---'
-- This query MUST return 0 rows.
SELECT
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items')
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND (roles && ARRAY['authenticated', 'anon', 'public']::name[]);

\echo '--- [CHECK 4] Verify public.is_admin() integrity & SECURITY DEFINER ---'
SELECT
    p.proname AS function_name,
    p.prosecdef AS is_security_definer,
    p.proconfig AS settings_search_path,
    format_type(p.prorettype, NULL) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_admin';

\echo '--- [CHECK 5] Verify table grants for authenticated role ---'
SELECT
    'orders' AS table_name,
    has_table_privilege('authenticated', 'public.orders', 'SELECT') AS has_select,
    has_table_privilege('authenticated', 'public.orders', 'INSERT') AS has_insert,
    has_table_privilege('authenticated', 'public.orders', 'UPDATE') AS has_update,
    has_table_privilege('authenticated', 'public.orders', 'DELETE') AS has_delete
UNION ALL
SELECT
    'order_items' AS table_name,
    has_table_privilege('authenticated', 'public.order_items', 'SELECT') AS has_select,
    has_table_privilege('authenticated', 'public.order_items', 'INSERT') AS has_insert,
    has_table_privilege('authenticated', 'public.order_items', 'UPDATE') AS has_update,
    has_table_privilege('authenticated', 'public.order_items', 'DELETE') AS has_delete;

\echo '--- [CHECK 6] Verify anonymous role (anon) has NO table access ---'
SELECT
    'orders' AS table_name,
    has_table_privilege('anon', 'public.orders', 'SELECT') AS anon_can_select
UNION ALL
SELECT
    'order_items' AS table_name,
    has_table_privilege('anon', 'public.order_items', 'SELECT') AS anon_can_select;

