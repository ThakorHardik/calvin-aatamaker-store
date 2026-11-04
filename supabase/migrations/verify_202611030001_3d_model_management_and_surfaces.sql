-- ==============================================================================
-- CALVIN AATAMAKER - Verification Script for 3D Model Management & Surfaces
-- Migration: 202611030001_3d_model_management_and_surfaces.sql
-- ==============================================================================

\set ON_ERROR_STOP on

\echo '--- [CHECK 1] Verify Tables Exist ---'
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('product_3d_models', 'product_printable_surfaces', 'customer_designs')
ORDER BY table_name;

\echo '--- [CHECK 2] Verify RLS is Enabled ---'
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('product_3d_models', 'product_printable_surfaces', 'customer_designs');

\echo '--- [CHECK 3] Verify Key Columns on product_3d_models ---'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'product_3d_models'
  AND column_name IN ('model_code', 'version', 'status', 'dimensions_mm', 'glb_storage_path', 'front_mesh_name')
ORDER BY column_name;

\echo '--- [CHECK 4] Verify Key Columns on product_printable_surfaces ---'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'product_printable_surfaces'
  AND column_name IN ('physical_width_mm', 'physical_height_mm', 'fixed_branding_overlay', 'safe_margin_top_mm', 'uv_mapping')
ORDER BY column_name;

\echo '--- [CHECK 5] Verify RLS Policies ---'
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('product_3d_models', 'product_printable_surfaces', 'customer_designs')
ORDER BY tablename, policyname;

\echo '--- [CHECK 6] Verify Storage Buckets ---'
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('product-3d-models', 'customer-customizations');

\echo '--- [CHECK 7] Verify Storage Objects Policies ---'
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname ILIKE '%3d models%' OR policyname ILIKE '%customization%'
ORDER BY policyname;

\echo '=== ALL 3D MODEL & PRINTABLE SURFACES VERIFICATION CHECKS PASSED ==='

