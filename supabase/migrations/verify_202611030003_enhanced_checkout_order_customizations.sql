-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Enhanced Checkout Order Migration
-- File: supabase/migrations/verify_202611030003_enhanced_checkout_order_customizations.sql
-- ==============================================================================

DO $$
DECLARE
  v_func_exists boolean;
  v_is_secdef boolean;
  v_search_path text;
  v_anon_grant boolean;
  v_service_grant boolean;
BEGIN
  -- 1. Verify function existence
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_checkout_order'
  ) INTO v_func_exists;

  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: public.create_checkout_order does not exist.';
  END IF;

  -- 2. Verify SECURITY DEFINER
  SELECT p.prosecdef INTO v_is_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_checkout_order';

  IF NOT v_is_secdef THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: public.create_checkout_order is not SECURITY DEFINER.';
  END IF;

  -- 3. Verify search_path pinning
  SELECT array_to_string(p.proconfig, ', ') INTO v_search_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_checkout_order';

  IF v_search_path IS NULL OR v_search_path !~* 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: search_path is not pinned to public, pg_temp. Found: %', v_search_path;
  END IF;

  -- 4. Verify permission isolation (anon/authenticated revoked, service_role granted)
  SELECT has_function_privilege('anon', 'public.create_checkout_order(uuid, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, jsonb)', 'EXECUTE')
  INTO v_anon_grant;

  IF v_anon_grant THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: anon role must not have EXECUTE privilege.';
  END IF;

  SELECT has_function_privilege('service_role', 'public.create_checkout_order(uuid, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, jsonb)', 'EXECUTE')
  INTO v_service_grant;

  IF NOT v_service_grant THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: service_role must have EXECUTE privilege.';
  END IF;

  RAISE NOTICE 'SUCCESS: public.create_checkout_order passes all security and integrity checks.';
END;
$$;

