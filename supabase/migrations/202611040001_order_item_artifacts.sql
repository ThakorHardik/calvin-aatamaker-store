-- ============================================================================
-- CALVIN AATAMAKER — SUPPLEMENTARY ORDER ITEM ARTIFACTS TABLE
-- Migration: 202611040001_order_item_artifacts.sql
-- Description: Stores supplementary or derived manufacturing artifacts
--              (e.g., flat artwork derived from immutable snapshots for historical
--              orders) without mutating the original immutable order or snapshot.
-- PROPOSED LOCAL SCRIPT ONLY — DO NOT APPLY WITHOUT USER AUTHORIZATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_item_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('flat_artwork', '3d_preview', 'cnc_toolpath', 'spec_sheet')),
  storage_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'derived_from_snapshot' CHECK (source IN ('captured_at_checkout', 'derived_from_snapshot', 'factory_calibrated')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_order_item_artifacts_item_id ON public.order_item_artifacts(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_artifacts_order_id ON public.order_item_artifacts(order_id);

-- Enable RLS
ALTER TABLE public.order_item_artifacts ENABLE ROW LEVEL SECURITY;

-- Owner can read their own order artifacts
CREATE POLICY "Customers can read own order artifacts"
  ON public.order_item_artifacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_item_artifacts.order_id
        AND orders.customer_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Admins can manage all order artifacts
CREATE POLICY "Admins have full access to order artifacts"
  ON public.order_item_artifacts
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

