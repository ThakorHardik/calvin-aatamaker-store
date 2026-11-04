-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Migration 202611030002
-- File: supabase/migrations/verify_202611030002_add_products_customization_config.sql
-- ==============================================================================
--
-- Read-only verification queries to run after applying 202611030002.
--
-- ==============================================================================

\echo '--- [CHECK 1] Verify column customization_config exists on public.products ---'
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'customization_config';

\echo '--- [CHECK 2] Verify check constraint chk_products_customization_config_object ---'
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public'
  AND cl.relname = 'products'
  AND c.conname = 'chk_products_customization_config_object';

\echo '--- [CHECK 3] Verify customizable products have valid configuration ---'
SELECT
    id,
    name,
    slug,
    is_customisable,
    customization_config->>'enabled' AS config_enabled,
    customization_config->>'mode' AS config_mode,
    customization_config->>'allow_photo_upload' AS allow_photo_upload,
    customization_config->>'allow_text_tools' AS allow_text_tools,
    customization_config->>'max_photo_size_mb' AS max_photo_size_mb,
    customization_config->>'max_text_layers' AS max_text_layers,
    jsonb_array_length(customization_config->'fields') AS fields_count
FROM public.products
WHERE is_customisable = true;

