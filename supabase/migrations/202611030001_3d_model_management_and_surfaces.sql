-- ==============================================================================
-- CALVIN AATAMAKER — 3D Product Personalization & Model Management Foundation
-- Migration: 202611030001_3d_model_management_and_surfaces.sql
-- Target Tables: public.product_3d_models, public.product_printable_surfaces, public.customer_designs
-- Storage Buckets: product-3d-models, customer-customizations
-- ==============================================================================
--
-- PURPOSE:
-- 1. Provides versioned 3D machine model profiles supporting up to 5 distinct models.
-- 2. Defines printable front-panel surface geometry, millimeter dimensions, safe margins,
--    and locked CALVIN corporate branding envelopes.
-- 3. Stores customer personalized designs linked to products and orders.
-- 4. Establishes least-privilege Row-Level Security (RLS) policies.
--
-- SECURITY ARCHITECTURE:
-- 1. Admin/Staff: Full management via public.is_admin().
-- 2. Storefront (anon/authenticated): Strictly restricted to published, active models.
-- 3. Customer designs: Authenticated customers can read and write only their own records.
--
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: public.product_3d_models
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_3d_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  model_code text NOT NULL,
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'published', 'archived')),
  is_active boolean NOT NULL DEFAULT false,
  dimensions_mm jsonb NOT NULL DEFAULT '{"width": 480, "height": 880, "depth": 340}'::jsonb,
  glb_storage_path text,
  thumbnail_path text,
  front_mesh_name text NOT NULL DEFAULT 'Front_Print_Surface',
  validation_notes text,
  validated_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_product_3d_models_code_version UNIQUE (model_code, version)
);

CREATE INDEX IF NOT EXISTS idx_product_3d_models_product_id ON public.product_3d_models(product_id);
CREATE INDEX IF NOT EXISTS idx_product_3d_models_status_active ON public.product_3d_models(status, is_active);

COMMENT ON TABLE public.product_3d_models IS 'Physical machine 3D model profiles, dimensional specs, and GLB asset versions.';

-- ------------------------------------------------------------------------------
-- 2. TABLE: public.product_printable_surfaces
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_printable_surfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.product_3d_models(id) ON DELETE CASCADE,
  surface_key text NOT NULL DEFAULT 'front_door_panel',
  surface_name text NOT NULL DEFAULT 'Front Door Panel',
  mesh_target_name text NOT NULL DEFAULT 'Front_Print_Surface',
  material_slot_name text NOT NULL DEFAULT 'mat_front_print',
  physical_width_mm numeric(8,2) NOT NULL CHECK (physical_width_mm > 0),
  physical_height_mm numeric(8,2) NOT NULL CHECK (physical_height_mm > 0),
  safe_margin_top_mm numeric(8,2) NOT NULL DEFAULT 10.0 CHECK (safe_margin_top_mm >= 0),
  safe_margin_bottom_mm numeric(8,2) NOT NULL DEFAULT 10.0 CHECK (safe_margin_bottom_mm >= 0),
  safe_margin_left_mm numeric(8,2) NOT NULL DEFAULT 10.0 CHECK (safe_margin_left_mm >= 0),
  safe_margin_right_mm numeric(8,2) NOT NULL DEFAULT 10.0 CHECK (safe_margin_right_mm >= 0),
  bleed_margin_mm numeric(8,2) NOT NULL DEFAULT 3.0 CHECK (bleed_margin_mm >= 0),
  fixed_branding_overlay jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "locked": true,
    "brand_text": "CALVIN",
    "position": "top_center",
    "offset_x_mm": 0,
    "offset_y_mm": 30,
    "width_mm": 120,
    "height_mm": 30
  }'::jsonb,
  uv_mapping jsonb NOT NULL DEFAULT '{
    "uv_channel": 0,
    "u_min": 0.0,
    "u_max": 1.0,
    "v_min": 0.0,
    "v_max": 1.0,
    "flip_y": false,
    "rotation_deg": 0
  }'::jsonb,
  cutout_zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calibrated', 'validated', 'published')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_model_surface UNIQUE (model_id, surface_key)
);

CREATE INDEX IF NOT EXISTS idx_printable_surfaces_model_id ON public.product_printable_surfaces(model_id);

COMMENT ON TABLE public.product_printable_surfaces IS 'Printable surface geometry, millimeter bounds, safe margins, and locked corporate branding.';

-- ------------------------------------------------------------------------------
-- 3. TABLE: public.customer_designs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  model_id uuid REFERENCES public.product_3d_models(id) ON DELETE RESTRICT,
  surface_id uuid REFERENCES public.product_printable_surfaces(id) ON DELETE RESTRICT,
  design_title text,
  design_data jsonb NOT NULL DEFAULT '{"version": 1, "layers": []}'::jsonb,
  preview_thumbnail_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'cart', 'ordered', 'archived')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_designs_customer_id ON public.customer_designs(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_designs_product_id ON public.customer_designs(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_designs_order_id ON public.customer_designs(order_id);

COMMENT ON TABLE public.customer_designs IS 'Saved customer personalization documents, layer manifests, and order links.';

-- ------------------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.product_3d_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_printable_surfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_designs ENABLE ROW LEVEL SECURITY;

-- Product 3D Models Policies
DROP POLICY IF EXISTS "Public can view published 3d models" ON public.product_3d_models;
CREATE POLICY "Public can view published 3d models" ON public.product_3d_models
  FOR SELECT TO anon, authenticated
  USING (status = 'published' AND is_active = true);

DROP POLICY IF EXISTS "Admins have full access to 3d models" ON public.product_3d_models;
CREATE POLICY "Admins have full access to 3d models" ON public.product_3d_models
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Printable Surfaces Policies
DROP POLICY IF EXISTS "Public can view published printable surfaces" ON public.product_printable_surfaces;
CREATE POLICY "Public can view published printable surfaces" ON public.product_printable_surfaces
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND EXISTS (
      SELECT 1 FROM public.product_3d_models m 
      WHERE m.id = product_printable_surfaces.model_id 
        AND m.status = 'published' 
        AND m.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins have full access to printable surfaces" ON public.product_printable_surfaces;
CREATE POLICY "Admins have full access to printable surfaces" ON public.product_printable_surfaces
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Customer Designs Policies
DROP POLICY IF EXISTS "Customers can view own designs" ON public.customer_designs;
CREATE POLICY "Customers can view own designs" ON public.customer_designs
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Customers can create own designs" ON public.customer_designs;
CREATE POLICY "Customers can create own designs" ON public.customer_designs
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Customers can update own draft designs" ON public.customer_designs;
CREATE POLICY "Customers can update own draft designs" ON public.customer_designs
  FOR UPDATE TO authenticated
  USING (customer_id = (SELECT auth.uid()) AND status IN ('draft', 'cart'))
  WITH CHECK (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to customer designs" ON public.customer_designs;
CREATE POLICY "Admins have full access to customer designs" ON public.customer_designs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. GRANTS
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.product_3d_models TO anon, authenticated;
GRANT SELECT ON public.product_printable_surfaces TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_designs TO authenticated;
GRANT SELECT ON public.customer_designs TO anon;

GRANT ALL ON public.product_3d_models TO service_role;
GRANT ALL ON public.product_printable_surfaces TO service_role;
GRANT ALL ON public.customer_designs TO service_role;

-- ------------------------------------------------------------------------------
-- 6. STORAGE BUCKET INITIALIZATION & SECURITY POLICIES
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('product-3d-models', 'product-3d-models', true, 52428800, ARRAY['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']),
  ('customer-customizations', 'customer-customizations', false, 20971520, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/json'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies for product-3d-models
DROP POLICY IF EXISTS "public read product 3d models" ON storage.objects;
CREATE POLICY "public read product 3d models" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-3d-models');

DROP POLICY IF EXISTS "staff manage product 3d models" ON storage.objects;
CREATE POLICY "staff manage product 3d models" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-3d-models' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-3d-models' AND public.is_admin());

-- Storage Policies for customer-customizations
DROP POLICY IF EXISTS "customers upload customization assets" ON storage.objects;
CREATE POLICY "customers upload customization assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-customizations'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "customers read own customization assets" ON storage.objects;
CREATE POLICY "customers read own customization assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-customizations'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "staff manage customer customizations" ON storage.objects;
CREATE POLICY "staff manage customer customizations" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'customer-customizations' AND public.is_admin())
  WITH CHECK (bucket_id = 'customer-customizations' AND public.is_admin());

COMMIT;

