-- ==============================================================================
-- CALVIN AATAMAKER — Migration: Add customization_config to public.products
-- Migration File: supabase/migrations/202611030002_add_products_customization_config.sql
-- Target Table: public.products
-- ==============================================================================
--
-- PURPOSE:
-- Adds the missing additive JSONB column `customization_config` to `public.products`.
-- This column stores product-specific personalization schemas, including:
-- - Personalization activation (`enabled: boolean`)
-- - Operational mode (`mode: 'demonstration' | 'production'`)
-- - Photo upload permissions and byte boundaries (`allow_photo_upload`, `max_photo_size_mb`)
-- - Text tool permissions and layer limits (`allow_text_tools`, `max_text_layers`)
-- - Associated 3D model profile and printable surface linkage (`model_id`, `surface_id`)
-- - Base personalization pricing (`base_customization_price`)
-- - Dynamic customization fields and price deltas (`fields`)
--
-- SAFETY & BACKWARD COMPATIBILITY:
-- 1. ADDITIVE ONLY: Adds a nullable JSONB column with DEFAULT NULL.
-- 2. Non-breaking: Products without customization retain NULL and behave as standard catalog items.
-- 3. Idempotent: Uses `IF NOT EXISTS` for column addition.
-- 4. Constraint Validation: Enforces that if provided, `customization_config` must be a valid JSON object.
-- 5. Safe Backfill: Automatically backfills a safe demonstration default for existing customizable products.
--
-- ==============================================================================

BEGIN;

-- 1. Additive column on public.products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS customization_config jsonb DEFAULT NULL;

-- 2. Validate JSON structure (must be an object if not null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'chk_products_customization_config_object'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT chk_products_customization_config_object
    CHECK (customization_config IS NULL OR jsonb_typeof(customization_config) = 'object');
  END IF;
END $$;

-- 3. Column documentation
COMMENT ON COLUMN public.products.customization_config IS 
'Configurable personalization schema defining supported fields, upload rules, 3D model linkage, layer limits, and price deltas.';

-- 4. Backward-compatible backfill for existing customizable products
UPDATE public.products
SET customization_config = jsonb_build_object(
  'enabled', true,
  'mode', 'demonstration',
  'model_id', null,
  'surface_id', null,
  'allow_photo_upload', true,
  'allow_text_tools', true,
  'max_photo_size_mb', 10,
  'allowed_photo_types', jsonb_build_array('image/jpeg', 'image/png', 'image/webp'),
  'max_text_layers', 5,
  'allowed_fonts', jsonb_build_array('serif', 'sans-serif', 'display', 'script'),
  'base_customization_price', 0,
  'fields', jsonb_build_array(
    jsonb_build_object(
      'id', 'front_panel_finish',
      'type', 'swatch',
      'label', 'Cabinet Door & Panel Finish',
      'help_text', 'Select handcrafted timber veneer or architectural matte finish.',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('id', 'opt_matte_black', 'value', 'matte_black', 'label', 'Midnight Matte Charcoal', 'price_delta', 0, 'swatch_color', '#18181C'),
        jsonb_build_object('id', 'opt_teak_grain', 'value', 'teak_grain', 'label', 'Natural Warm Teak', 'price_delta', 1500, 'swatch_color', '#8B4513'),
        jsonb_build_object('id', 'opt_royal_walnut', 'value', 'royal_walnut', 'label', 'Royal Dark Walnut', 'price_delta', 2200, 'swatch_color', '#4A2E18'),
        jsonb_build_object('id', 'opt_brushed_brass', 'value', 'brushed_brass', 'label', 'Champagne Brushed Metallic', 'price_delta', 3500, 'swatch_color', '#D4AF37')
      )
    ),
    jsonb_build_object(
      'id', 'sieve_mesh_grade',
      'type', 'select',
      'label', 'Specialized Flour Mesh Kit',
      'help_text', 'Included stone-grinding sieve assortment for different grains.',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('id', 'opt_std_sieve', 'value', 'standard_assortment', 'label', 'Complete 7-Sieve Domestic Kit (Standard)', 'price_delta', 0),
        jsonb_build_object('id', 'opt_micro_sieve', 'value', 'micro_flour_sieve', 'label', 'Ultra-Fine Bakery & Gluten-Free Sieve Kit', 'price_delta', 750),
        jsonb_build_object('id', 'opt_heavy_millets', 'value', 'millets_multi_grain', 'label', 'Coarse Millets & Multi-Grain Grinding Kit', 'price_delta', 850)
      )
    ),
    jsonb_build_object(
      'id', 'family_name_engraving',
      'type', 'text',
      'label', 'Bespoke Brass Door Inscription',
      'help_text', 'Custom family name or kitchen inscription (up to 30 characters).',
      'required', false,
      'max_length', 30
    )
  )
)
WHERE is_customisable = true 
  AND customization_config IS NULL;

COMMIT;

