-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Migration 202611030004
-- File: supabase/migrations/verify_202611030004_add_orders_test_flag_and_inventory_release.sql
-- ==============================================================================

DO $$
DECLARE
  v_col_test boolean;
  v_col_released boolean;
  v_col_deducted boolean;
  v_func_exists boolean;
  v_secdef boolean;
  v_anon_grant boolean;
  v_service_grant boolean;
  v_backfilled_count integer;
  v_seed_exempt boolean;
BEGIN
  -- 1. Verify columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'is_test_order'
  ) INTO v_col_test;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'inventory_released_at'
  ) INTO v_col_released;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'inventory_deducted'
  ) INTO v_col_deducted;

  IF NOT (v_col_test AND v_col_released AND v_col_deducted) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: Columns is_test_order, inventory_released_at, or inventory_deducted missing on public.orders.';
  END IF;

  -- 2. Verify RPC existence and security
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cancel_order_and_release_inventory'
  ) INTO v_func_exists;

  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: cancel_order_and_release_inventory function does not exist.';
  END IF;

  SELECT p.prosecdef INTO v_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cancel_order_and_release_inventory';

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: Function must be SECURITY DEFINER.';
  END IF;

  -- 3. Verify permissions
  SELECT has_function_privilege('anon', 'public.cancel_order_and_release_inventory(uuid)', 'EXECUTE')
  INTO v_anon_grant;

  IF v_anon_grant THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: anon role must not have EXECUTE privilege.';
  END IF;

  SELECT has_function_privilege('service_role', 'public.cancel_order_and_release_inventory(uuid)', 'EXECUTE')
  INTO v_service_grant;

  IF NOT v_service_grant THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: service_role must have EXECUTE privilege.';
  END IF;

  -- 4. Verify test orders backfill
  SELECT count(*)::integer INTO v_backfilled_count
  FROM public.orders
  WHERE is_test_order = true;

  IF v_backfilled_count < 6 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: Expected at least 6 test orders flagged, found: %', v_backfilled_count;
  END IF;

  -- 5. Verify seed order exemption from stock deduction
  SELECT (inventory_deducted = false) INTO v_seed_exempt
  FROM public.orders
  WHERE order_number = 'CA-7891F04B40';

  IF v_seed_exempt IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: Seed order CA-7891F04B40 must have inventory_deducted = false.';
  END IF;

  RAISE NOTICE 'SUCCESS: Migration 202611030004 verified successfully.';
END $$;

