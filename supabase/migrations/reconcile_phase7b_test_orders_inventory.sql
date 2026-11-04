-- ==============================================================================
-- CALVIN AATAMAKER — Phase 7B.7.4.1 Guarded Inventory Reconciliation
-- File: supabase/migrations/reconcile_phase7b_test_orders_inventory.sql
-- Target Product ID: 327d5d70-ec43-4d28-9aff-cd1de77a23c5 (Compact Domestic Aatamaker)
-- ==============================================================================
--
-- STRICT PRE-REQUISITES:
-- 1. Migration 202611030004 must be applied first so that `is_test_order`,
--    `inventory_released_at`, and `inventory_deducted` columns exist.
-- 2. Lock Acquisition Hierarchy: Locks public.orders rows FIRST, then public.products row SECOND,
--    matching the exact lock acquisition order of cancel_order_and_release_inventory()
--    to prevent database deadlocks.
-- 3. Exactly 5 development test orders must exist and remain pending, unpaid, and unreleased.
-- 4. Target product current stock must be exactly 94.
-- 5. Target product quantity across the 5 orders must sum to exactly 6 units.
--
-- DO NOT EXECUTE ON LIVE DATABASE WITHOUT EXPLICIT CLIENT AUTHORIZATION.
-- ==============================================================================

DO $$
DECLARE
  v_target_product_id CONSTANT uuid := '327d5d70-ec43-4d28-9aff-cd1de77a23c5';
  v_prod record;
  v_test_order_count integer := 0;
  v_non_test_count integer := 0;
  v_invalid_status_count integer := 0;
  v_invalid_pay_count integer := 0;
  v_already_released_count integer := 0;
  v_calculated_qty integer := 0;
  v_updated_prod_count integer := 0;
  v_updated_orders_count integer := 0;
  v_seed_order record;
BEGIN
  -- ----------------------------------------------------------------------------
  -- Step 1: LOCK ALL FIVE DEVELOPMENT ORDER ROWS (Orders Locked FIRST)
  -- ----------------------------------------------------------------------------
  PERFORM id
  FROM public.orders
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  )
  FOR UPDATE;

  -- Step 2: Verify exactly five expected development orders exist
  SELECT count(*)
  INTO v_test_order_count
  FROM public.orders
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  );

  IF v_test_order_count <> 5 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: Expected 5 development test orders, found %.', v_test_order_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 3: VERIFY ALL FIVE HAVE is_test_order = true
  -- ----------------------------------------------------------------------------
  SELECT count(*)
  INTO v_non_test_count
  FROM public.orders
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  ) AND is_test_order <> true;

  IF v_non_test_count > 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: % development order(s) are not flagged with is_test_order = true.', v_non_test_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 4: VERIFY ALL FIVE REMAIN pending
  -- ----------------------------------------------------------------------------
  SELECT count(*)
  INTO v_invalid_status_count
  FROM public.orders
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  ) AND order_status <> 'pending';

  IF v_invalid_status_count > 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: % development order(s) are not in pending status.', v_invalid_status_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 5: VERIFY ALL FIVE REMAIN UNPAID
  -- ----------------------------------------------------------------------------
  SELECT count(*)
  INTO v_invalid_pay_count
  FROM public.orders
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  ) AND payment_status <> 'pending';

  IF v_invalid_pay_count > 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: % development order(s) are not in pending payment status.', v_invalid_pay_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 6: VERIFY NO TEST ORDER HAS ALREADY RELEASED INVENTORY
  -- ----------------------------------------------------------------------------
  SELECT count(*)
  INTO v_already_released_count
  FROM public.orders
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  ) AND inventory_released_at IS NOT NULL;

  IF v_already_released_count > 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: % development order(s) already have inventory_released_at populated.', v_already_released_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 7 & 8: LOCK TARGET PRODUCT ROW & VERIFY CURRENT STOCK IS EXACTLY 94 (Product Locked SECOND)
  -- ----------------------------------------------------------------------------
  SELECT id, name, stock_quantity
  INTO v_prod
  FROM public.products
  WHERE id = v_target_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: Target product (%) does not exist.', v_target_product_id;
  END IF;

  IF v_prod.stock_quantity <> 94 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: Target product stock is %, expected exactly 94. Aborting to prevent inventory corruption.', v_prod.stock_quantity;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 9 & 10: CALCULATE ACTUAL QUANTITY & VERIFY IT IS EXACTLY 6 UNITS
  -- ----------------------------------------------------------------------------
  SELECT COALESCE(sum(oi.quantity), 0)
  INTO v_calculated_qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  ) AND oi.product_id = v_target_product_id;

  IF v_calculated_qty <> 6 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: Calculated deducted quantity is %, expected exactly 6 units.', v_calculated_qty;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 11 & 12: RESTORE SIX UNITS & VERIFY EXACTLY ONE PRODUCT ROW UPDATED
  -- ----------------------------------------------------------------------------
  UPDATE public.products
  SET stock_quantity = stock_quantity + 6,
      updated_at = pg_catalog.now()
  WHERE id = v_target_product_id
    AND stock_quantity = 94;

  GET DIAGNOSTICS v_updated_prod_count = ROW_COUNT;
  IF v_updated_prod_count <> 1 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: Failed to update target product (rows updated: %, expected 1).', v_updated_prod_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 13 & 14: MARK 5 TEST ORDERS CANCELLED & RELEASED, VERIFY 5 ROWS UPDATED
  -- ----------------------------------------------------------------------------
  UPDATE public.orders
  SET order_status = 'cancelled',
      inventory_released_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE order_number IN (
    'CA-120A39C5E1',
    'CA-FE9C311C5A',
    'CA-35C3C3A849',
    'CA-70F00BBF32',
    'CA-MTC84MQF84'
  ) AND inventory_released_at IS NULL;

  GET DIAGNOSTICS v_updated_orders_count = ROW_COUNT;
  IF v_updated_orders_count <> 5 THEN
    RAISE EXCEPTION 'RECONCILIATION_ABORTED: Failed to update test orders (rows updated: %, expected 5).', v_updated_orders_count;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 15 & 16: HANDLE SEED ORDER CA-7891F04B40 SEPARATELY (EXEMPT FROM RELEASE)
  -- ----------------------------------------------------------------------------
  SELECT id, order_number, order_status, is_test_order, inventory_deducted, inventory_released_at
  INTO v_seed_order
  FROM public.orders
  WHERE order_number = 'CA-7891F04B40'
  FOR UPDATE;

  IF FOUND THEN
    -- Ensure seed order is explicitly marked as exempt from stock deduction/restoration
    -- without populating a misleading inventory_released_at timestamp
    UPDATE public.orders
    SET is_test_order = true,
        inventory_deducted = false,
        updated_at = pg_catalog.now()
    WHERE id = v_seed_order.id;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Step 17: COMPLETE VALIDATION & SUCCESS NOTICE
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'SUCCESS: Reconciled 6 units of stock for % (stock restored from 94 to 100). All 5 development test orders cancelled and released.', v_prod.name;
END $$;
