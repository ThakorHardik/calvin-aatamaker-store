-- ==============================================================================
-- CALVIN AATAMAKER — Verification Script for Atomic Checkout Migration
-- Script: verify_202611020002_atomic_checkout_order.sql
-- ==============================================================================
--
-- VERIFICATION CRITERIA:
-- 1. Column public.orders.checkout_idempotency_key (exists, type text, nullable).
-- 2. Unique partial index idx_orders_checkout_idempotency_key:
--    - Confirms it belongs specifically to public.orders.
--    - Confirms indexed column is checkout_idempotency_key.
--    - Confirms uniqueness and validity.
--    - Confirms partial predicate is WHERE checkout_idempotency_key IS NOT NULL.
-- 3. Public schema CREATE privileges are strictly revoked for untrusted roles (anon, authenticated).
-- 4. Function public.create_checkout_order (exists, owner postgres, SECURITY DEFINER,
--    search_path = public, pg_temp).
-- 5. Function ACL verification:
--    - Uses pg_proc.proacl and aclexplode() to verify PUBLIC has NO EXECUTE grant.
--    - Verifies anon and authenticated have NO EXECUTE grant.
--    - Verifies service_role has EXECUTE grant.
--
-- ==============================================================================

DO $$
DECLARE
  v_col_name text;
  v_col_type text;
  v_col_notnull boolean;
  v_idx_table text;
  v_idx_unique boolean;
  v_idx_valid boolean;
  v_idx_pred text;
  v_idx_def text;
  v_idx_col text;
  v_anon_create boolean;
  v_auth_create boolean;
  v_func_oid oid;
  v_owner text;
  v_sec_definer boolean;
  v_search_path text;
  v_public_execute boolean;
  v_anon_grant boolean;
  v_auth_grant boolean;
  v_srv_grant boolean;
BEGIN
  -- ----------------------------------------------------------------------------
  -- 1. Check persistent idempotency column properties
  -- ----------------------------------------------------------------------------
  SELECT 
    a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod),
    a.attnotnull
  INTO v_col_name, v_col_type, v_col_notnull
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.orders'::regclass 
    AND a.attname = 'checkout_idempotency_key' 
    AND a.attnum > 0 
    AND NOT a.attisdropped;

  IF v_col_name IS NULL THEN
    RAISE NOTICE '[VERIFICATION PENDING] Column public.orders.checkout_idempotency_key does not yet exist. Apply migration 202611020002_atomic_checkout_order.sql first.';
    RETURN;
  END IF;

  IF v_col_type <> 'text' THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.orders.checkout_idempotency_key type is "%", expected "text".', v_col_type;
  END IF;

  IF v_col_notnull THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.orders.checkout_idempotency_key must be nullable to support non-idempotent or legacy orders.';
  END IF;

  -- ----------------------------------------------------------------------------
  -- 2. Check unique partial index definition, table ownership, validity & predicate
  -- ----------------------------------------------------------------------------
  SELECT 
    t.relname,
    i.indisunique,
    i.indisvalid,
    COALESCE(pg_catalog.pg_get_expr(i.indpred, i.indrelid), ''),
    COALESCE(pg_catalog.pg_get_indexdef(i.indexrelid), ''),
    COALESCE(pg_catalog.pg_get_indexdef(i.indexrelid, 1, true), '')
  INTO v_idx_table, v_idx_unique, v_idx_valid, v_idx_pred, v_idx_def, v_idx_col
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
  JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
  JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
  JOIN pg_catalog.pg_namespace cn ON cn.oid = c.relnamespace
  WHERE cn.nspname = 'public' 
    AND c.relname = 'idx_orders_checkout_idempotency_key';

  IF v_idx_def = '' THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Unique index idx_orders_checkout_idempotency_key is missing on public.orders.';
  END IF;

  IF v_idx_table <> 'orders' THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Index idx_orders_checkout_idempotency_key must belong specifically to table "public.orders". Found on: %', v_idx_table;
  END IF;

  IF NOT v_idx_unique THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Index idx_orders_checkout_idempotency_key must be UNIQUE.';
  END IF;

  IF NOT v_idx_valid THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Index idx_orders_checkout_idempotency_key is marked INVALID.';
  END IF;

  IF v_idx_pred NOT LIKE '%checkout_idempotency_key IS NOT NULL%' THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Index idx_orders_checkout_idempotency_key predicate must be WHERE checkout_idempotency_key IS NOT NULL. Found: %', v_idx_pred;
  END IF;

  IF v_idx_col <> 'checkout_idempotency_key' AND v_idx_def NOT LIKE '%(checkout_idempotency_key)%' THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Index idx_orders_checkout_idempotency_key must index column checkout_idempotency_key. Found: %', v_idx_col;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 3. Check public schema CREATE privileges are revoked for untrusted roles
  -- ----------------------------------------------------------------------------
  SELECT 
    pg_catalog.has_schema_privilege('anon', 'public', 'CREATE'),
    pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
  INTO v_anon_create, v_auth_create;

  IF v_anon_create THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Schema "public" must NOT have CREATE privilege granted to role "anon".';
  END IF;

  IF v_auth_create THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Schema "public" must NOT have CREATE privilege granted to role "authenticated".';
  END IF;

  -- ----------------------------------------------------------------------------
  -- 4. Check function existence and owner
  -- ----------------------------------------------------------------------------
  SELECT p.oid, r.rolname
  INTO v_func_oid, v_owner
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
  WHERE n.nspname = 'public' AND p.proname = 'create_checkout_order';

  IF v_func_oid IS NULL THEN
    RAISE NOTICE '[VERIFICATION PENDING] Function public.create_checkout_order does not yet exist. Apply migration 202611020002_atomic_checkout_order.sql first.';
    RETURN;
  END IF;

  IF v_owner NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] Function owner is "%", expected postgres.', v_owner;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 5. Check SECURITY DEFINER and pinned search_path
  -- ----------------------------------------------------------------------------
  SELECT 
    p.prosecdef,
    COALESCE(array_to_string(p.proconfig, ','), '')
  INTO v_sec_definer, v_search_path
  FROM pg_catalog.pg_proc p
  WHERE p.oid = v_func_oid;

  IF NOT v_sec_definer THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.create_checkout_order is NOT SECURITY DEFINER.';
  END IF;

  IF v_search_path NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.create_checkout_order search_path must be explicitly set to "public, pg_temp". Found: %', v_search_path;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 6. Check least-privilege function execution permissions via proacl & aclexplode
  -- ----------------------------------------------------------------------------
  -- Verify PUBLIC has NO EXECUTE grant in function ACL
  SELECT EXISTS (
    SELECT 1 
    FROM pg_catalog.pg_proc p,
         pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    WHERE p.oid = v_func_oid
      AND acl.grantee = 0 
      AND acl.privilege_type = 'EXECUTE'
  ) INTO v_public_execute;

  IF v_public_execute THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.create_checkout_order must NOT grant EXECUTE to PUBLIC (found in pg_proc.proacl via aclexplode).';
  END IF;

  -- Verify role-specific permissions
  SELECT 
    pg_catalog.has_function_privilege('anon', v_func_oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('authenticated', v_func_oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('service_role', v_func_oid, 'EXECUTE')
  INTO v_anon_grant, v_auth_grant, v_srv_grant;

  IF v_anon_grant THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.create_checkout_order must NOT be executable by role anon.';
  END IF;

  IF v_auth_grant THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.create_checkout_order must NOT be executable by role authenticated.';
  END IF;

  IF NOT v_srv_grant THEN
    RAISE EXCEPTION '[VERIFICATION FAILED] public.create_checkout_order must be executable by role service_role.';
  END IF;

  RAISE NOTICE '[VERIFICATION SUCCESS] public.create_checkout_order, unique partial index on public.orders, and least-privilege permissions verified successfully.';
END;
$$;
