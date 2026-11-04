# CALVIN AATAMAKER — Phase 7B.6.2 Database Migration Contract Review Report

**Date:** 2026-11-03  
**Status:** CONTRACT REVIEWED & VERIFIED (READY FOR APPLICATION UPON USER APPROVAL)  
**Pending Migration:** `supabase/migrations/202611030002_add_products_customization_config.sql`  
**Automated Tests:** 153 / 153 PASSED (0 failures) | TypeScript: 0 errors | ESLint: 0 errors | Production Build: 24/24 Static Pages Compiled Successfully  

---

## 1. Exact TypeScript Configuration Contract

The authoritative TypeScript interface governing product personalization is defined in `types/customization.ts`:

```typescript
export type CustomizationFieldType = "text" | "long_text" | "select" | "swatch";

export type CustomizationOption = {
  id: string;
  value: string;
  label: string;
  price_delta: number;
  swatch_color?: string;
  image_url?: string;
};

export type CustomizationField = {
  id: string;
  type: CustomizationFieldType;
  label: string;
  help_text?: string;
  required: boolean;
  max_length?: number;
  options?: CustomizationOption[];
};

export type CustomizationMode = "demonstration" | "production";

export type ProductCustomizationConfig = {
  enabled: boolean;
  fields: CustomizationField[];
  model_id?: string | null;
  surface_id?: string | null;
  allow_photo_upload?: boolean;
  allow_text_tools?: boolean;
  max_photo_size_mb?: number;
  allowed_photo_types?: string[];
  max_text_layers?: number;
  allowed_fonts?: string[];
  mode?: CustomizationMode;
  base_customization_price?: number;
};
```

---

## 2. Complete JSONB Field Comparison

A field-by-field matrix comparing the TypeScript contract, the Admin form, the Customization Studio, Checkout/Cart, and the migration backfill:

| Configuration Property | TypeScript Type | Admin Products Editor | Customization Studio | Checkout & Cart | Migration Backfill JSON | Status & Contract Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `enabled` | `boolean` (required) | `form.is_customisable` | Checks `config?.enabled` | Checks `config.enabled` | `'enabled', true` | **100% Match** |
| `mode` | `"demonstration" \| "production"` | Dropdown selector | Shows demonstration safety badge | Blocks manufacturing CNC/press release | `'mode', 'demonstration'` | **100% Match (Safety Locked)** |
| `model_id` | `string \| null` (optional) | Model profile select | Links 3D GLB model | Stored in lineage metadata | `'model_id', null` | **100% Match** |
| `surface_id` | `string \| null` (optional) | Surface target select | Links 380x620mm surface | Stored in lineage metadata | `'surface_id', null` | **100% Match** |
| `allow_photo_upload` | `boolean` (optional) | Checkbox control | Shows/hides photo tool | Validates photo upload | `'allow_photo_upload', true` | **100% Match** |
| `allow_text_tools` | `boolean` (optional) | Checkbox control | Shows/hides typography tool | Validates text layers | `'allow_text_tools', true` | **100% Match** |
| `max_photo_size_mb` | `number` (optional) | Number input (MB) | Enforces file size cap | Checked at `/api/customizations/upload` | `'max_photo_size_mb', 10` | **100% Match (10MB standard)** |
| `allowed_photo_types` | `string[]` (optional) | Format checkboxes | Client upload accept filter | Magic-bytes buffer validation | `jsonb_build_array('image/jpeg', 'image/png', 'image/webp')` | **100% Match** |
| `max_text_layers` | `number` (optional) | Number input (layers) | Enforces canvas text limit | Validates layer count $\le 5$ | `'max_text_layers', 5` | **100% Match** |
| `allowed_fonts` | `string[]` (optional) | Font families select | Font picker selector | Clean font CSS binding | `jsonb_build_array('serif', 'sans-serif', 'display', 'script')` | **100% Match** |
| `base_customization_price` | `number` (optional) | Currency input (₹) | Added to unit price | Server-verified price delta | `'base_customization_price', 0` | **100% Match** |
| `fields` | `CustomizationField[]` | Dynamic fields builder | Renders swatches & options | Validates option selection & price deltas | 3 demonstration fields (`front_panel_finish`, `sieve_mesh_grade`, `family_name_engraving`) | **100% Match** |

---

## 3. Actual Live Product, 3D Model & Printable Surface Associations

A live read-only inspection query was executed against Supabase:

```
=== INSPECTION RESULTS ===
Products: [
  {
    id: '327d5d70-ec43-4d28-9aff-cd1de77a23c5',
    name: 'Compact Domestic Aatamaker',
    slug: 'compact-domestic-aatamaker-20c2f7',
    is_customisable: true,
    price: 18999,
    stock_quantity: 100
  }
]
Product 3D Models: [] (0 rows seeded)
Printable Surfaces: [] (0 rows seeded)
Customer Designs: [] (0 rows seeded)
```

### Key Relational Insights:
1. **Model Storage Architecture:**
   - The relational table `public.product_3d_models` possesses a foreign key `product_id REFERENCES public.products(id) ON DELETE SET NULL`.
   - The relational table `public.product_printable_surfaces` possesses a foreign key `model_id REFERENCES public.product_3d_models(id) ON DELETE CASCADE`.
   - `customization_config` stores the *policy* (permissions, limits, pricing, dynamic fields, and optional explicit `model_id`/`surface_id` pointers).
   - When `customization_config.model_id` is null, the storefront and customizer resolve the 3D model through the relational link `product_3d_models.product_id = product.id`.
2. **Zero Relationship Duplication:**
   There is no conflicting source of truth. Heavy 3D mesh specifications (GLB binary paths, UV channel coordinates, millimeter boundaries, fixed corporate branding mark) remain strictly in the relational tables, while commercial options and customer permissions remain on the product row in `customization_config`.

---

## 4. Migration Safety Review

The pending migration `supabase/migrations/202611030002_add_products_customization_config.sql` was evaluated against all safety criteria:

| Safety Criterion | Evaluation | Verification Evidence |
| :--- | :--- | :--- |
| **Additive & Non-Breaking** | **PASS** | Adds column `customization_config jsonb DEFAULT NULL`. Standard uncustomized products remain `NULL` and continue normal commerce without interruption. |
| **Safe Default Configuration** | **PASS** | Defaults to `NULL`. Backfills existing customizable machines with `mode = 'demonstration'`. |
| **Field Preservation** | **PASS** | Only updates `customization_config`. Product price (₹18,999), stock (100), active status (`true`), description, dimensions, categories, and images are 100% preserved. |
| **Targeted Backfill** | **PASS** | Condition: `WHERE is_customisable = true AND customization_config IS NULL;`. Non-customizable products are ignored. |
| **Correct Column References** | **PASS** | Uses confirmed existing column `is_customisable`. |
| **JSON Object Enforcement** | **PASS** | Adds check constraint `chk_products_customization_config_object`: `CHECK (customization_config IS NULL OR jsonb_typeof(customization_config) = 'object')`. |
| **Idempotency** | **PASS** | Uses `ADD COLUMN IF NOT EXISTS`, checks constraint existence in `pg_constraint`, and conditions backfill on `customization_config IS NULL`. |
| **Price & Stock Integrity** | **PASS** | Zero updates to `price`, `stock_quantity`, or `is_active`. |

---

## 5. Local Migration Corrections Applied

The initial draft of the migration used an empty array `'fields', '[]'::jsonb` and omitted several configuration properties (`allowed_photo_types`, `allowed_fonts`, `model_id`, `surface_id`).

### The Enhancement Applied to `supabase/migrations/202611030002_add_products_customization_config.sql`:
The backfill was updated to include all contract fields and the three calibrated demonstration fields (`front_panel_finish`, `sieve_mesh_grade`, `family_name_engraving`) matching the visual prototype:
1. Added `'model_id', null` and `'surface_id', null`.
2. Added `'allowed_photo_types', jsonb_build_array('image/jpeg', 'image/png', 'image/webp')`.
3. Added `'allowed_fonts', jsonb_build_array('serif', 'sans-serif', 'display', 'script')`.
4. Populated `'fields'` with:
   - `front_panel_finish` (swatch: Midnight Matte Charcoal, Natural Warm Teak, Royal Dark Walnut, Champagne Brushed Metallic).
   - `sieve_mesh_grade` (select: Complete 7-Sieve Domestic Kit, Ultra-Fine Bakery & Gluten-Free, Coarse Millets & Multi-Grain).
   - `family_name_engraving` (text: max 30 characters).

---

## 6. Admin Persistence Implementation Findings

### Admin Read Path
- `app/admin/products/page.tsx` executes `supabase.from("products").select("*, categories(name), product_images(*), product_variants(*)")`.
- PostgREST returns `customization_config`.
- `setEditing(product)` maps `product.customization_config` directly into form controls:
  - Form photo upload limits populate `form.customization_config.max_photo_size_mb`.
  - Form text layer limits populate `form.customization_config.max_text_layers`.
  - Customization fee populates `form.customization_config.base_customization_price`.
  - Mode populates `form.customization_config.mode`.
  - Model and surface selects populate `model_id` and `surface_id`.
  - Field builder populates `form.customization_config.fields`.

### Admin Write Path
- On save, `payload` sets `customization_config: form.is_customisable ? form.customization_config : null`.
- Once `customization_config` column exists in Supabase, `.update(payload)` writes the updated JSON directly into PostgreSQL.
- In Phase 7B.6.1, defensive retry logic was added so if the column is ever missing, it retries without crashing the admin form. Once the migration is executed, updates will persist immediately into PostgreSQL.

---

## 7. Tests and Verification Results

All quality gates passed with zero errors:

- **TypeScript Typecheck (`npm run typecheck`):** **0 errors** (`tsc --noEmit` exit 0).
- **ESLint Analysis (`npm run lint`):** **0 errors** (8 non-fatal warnings).
- **Next.js Production Build (`npm run build`):** **24 / 24 static pages generated successfully**.
- **Automated Regression Suites:** **153 / 153 PASSED (100%)**
  - Phase 7B.5 Storage & Safety: **44 / 44 PASSED**
  - Phase 7B.4 Boundaries & Safety: **20 / 20 PASSED**
  - Phase 7B.3 Storefront to Checkout: **18 / 18 PASSED**
  - Phase 7 Customization Engine: **16 / 16 PASSED**
  - Phase 7A 3D Model Foundation: **24 / 24 PASSED**
  - Phase 7B Asset Intake: **8 / 8 PASSED**
  - Phase 7B Model Readiness: **5 / 5 PASSED**
  - Phase 5 Checkout & Security: **18 / 18 PASSED**

---

## 8. Exact SQL Migration Prepared for Approval

> [!IMPORTANT]
> This SQL is completely finalized, additive, backward-compatible, and safe. It will only be applied to Supabase when you authorize it:

```sql
-- ==============================================================================
-- CALVIN AATAMAKER — Migration: Add customization_config to public.products
-- Migration File: supabase/migrations/202611030002_add_products_customization_config.sql
-- Target Table: public.products
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
```

---

## 9. Remaining Blockers

1. **User Execution of Migration 202611030002:**
   The SQL above is ready to be executed in the Supabase SQL Editor.
2. **Factory Caliper Measurements:**
   Physical caliper measurements for `CALVIN-COMPACT-01` are pending factory intake. The model remains locked in demonstration mode.
3. **No Phase 7C Tasks Started:**
   All work remained strictly confined to reviewing the database migration contract and verifying safety.

