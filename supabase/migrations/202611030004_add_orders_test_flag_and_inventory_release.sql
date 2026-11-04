-- ==============================================================================
-- CALVIN AATAMAKER — Migration: Orders Test Flag & Atomic Inventory Release on Cancellation
-- Migration: 202611030004_add_orders_test_flag_and_inventory_release.sql
-- Target Tables: public.orders, public.products, public.product_variants
-- ==============================================================================
--
-- PURPOSE:
-- 1. Adds `is_test_order` (boolean DEFAULT false) to public.orders for permanent,
--    tamper-proof identification of development verification orders without
--    relying on customer-facing notes.
-- 2. Adds `inventory_released_at` (timestamptz DEFAULT NULL) to public.orders to
--    guarantee that order cancellation restores stock exactly once (idempotent).
-- 3. Backfills `is_test_order = true` for the 6 confirmed test orders.
-- 4. Provides a hardened transactional RPC `public.cancel_order_and_release_inventory(p_order_id uuid)`
--    restricted to `service_role`.
--
-- DO NOT APPLY TO LIVE DATABASE WITHOUT EXPLICIT CLIENT AUTHORIZATION.
-- ==============================================================================

BEGIN;

-- 1. Additive columns on public.orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_test_order boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS inventory_released_at timestamptz DEFAULT NULL;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS inventory_deducted boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.orders.is_test_order IS 
'Flags orders created during development, automated testing, or staging verification. Test orders can never be confirmed, processed, shipped, or delivered.';

COMMENT ON COLUMN public.orders.inventory_released_at IS 
'Timestamp when reserved inventory was restored following order cancellation or expiration. Prevents duplicate inventory release.';

COMMENT ON COLUMN public.orders.inventory_deducted IS 
'Flags whether physical inventory was deducted when this order was created. Seed orders that bypassed stock decrement have inventory_deducted = false and are exempt from stock restoration.';

-- 2. Backfill known verified development orders
UPDATE public.orders
SET is_test_order = true
WHERE order_number IN (
  'CA-7891F04B40',
  'CA-120A39C5E1',
  'CA-FE9C311C5A',
  'CA-35C3C3A849',
  'CA-70F00BBF32',
  'CA-MTC84MQF84'
);

-- Mark seed order as exempt from inventory deduction (stock was never deducted for it)
UPDATE public.orders
SET inventory_deducted = false
WHERE order_number = 'CA-7891F04B40';

-- 3. Atomic Order Cancellation & Inventory Release RPC
CREATE OR REPLACE FUNCTION public.cancel_order_and_release_inventory(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order record;
  v_item record;
  v_prod_id uuid;
  v_var_id uuid;
  v_qty integer;
  v_already_released boolean := false;
  v_restored_lines integer := 0;
BEGIN
  -- Verify order existence and lock row for update
  SELECT id, order_number, order_status, inventory_released_at, is_test_order, inventory_deducted
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order (%) does not exist.', p_order_id;
  END IF;

  -- Idempotency check: if already cancelled and inventory released, return immediately
  IF v_order.inventory_released_at IS NOT NULL OR v_order.order_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'already_released', true,
      'restored_lines', 0,
      'message', 'Order is already cancelled and inventory was previously released.'
    );
  END IF;

  -- If inventory was never deducted (e.g. historical seed order CA-7891F04B40),
  -- cancel the order without modifying catalog stock
  IF NOT v_order.inventory_deducted THEN
    UPDATE public.orders
    SET order_status = 'cancelled',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'already_released', false,
      'restored_lines', 0,
      'message', 'Order cancelled. Inventory was never deducted (exempt from restoration).'
    );
  END IF;

  -- 1. Update order status and set inventory release timestamp
  UPDATE public.orders
  SET order_status = 'cancelled',
      inventory_released_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_order_id;

  -- 2. Aggregate line item quantities and restore stock
  FOR v_item IN
    SELECT product_id, variant_id, sum(quantity)::integer AS total_qty
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY product_id, variant_id
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity + v_item.total_qty,
          updated_at = pg_catalog.now()
      WHERE id = v_item.variant_id;
    ELSIF v_item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item.total_qty,
          updated_at = pg_catalog.now()
      WHERE id = v_item.product_id;
    END IF;

    v_restored_lines := v_restored_lines + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'already_released', false,
    'restored_lines', v_restored_lines,
    'message', 'Order cancelled and reserved stock restored successfully.'
  );
END;
$$;

-- Secure execution privileges
REVOKE EXECUTE ON FUNCTION public.cancel_order_and_release_inventory FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_and_release_inventory TO service_role;

COMMIT;

