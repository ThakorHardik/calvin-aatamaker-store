-- ==============================================================================
-- CALVIN AATAMAKER — Atomic Checkout & Inventory Concurrency Migration
-- Migration: 202611020002_atomic_checkout_order.sql
-- ==============================================================================
--
-- PURPOSE:
-- 1. Introduces a dedicated checkout_idempotency_key column with a unique partial
--    index on public.orders for permanent, leak-proof duplicate prevention.
-- 2. Implements public.create_checkout_order() as a hardened SECURITY DEFINER
--    transactional RPC with search_path = public, pg_temp.
-- 3. Locks affected parent products in deterministic UUID order, followed by
--    affected variants in deterministic UUID order to prevent deadlocks.
-- 4. Verifies active status of parent products AND variants under lock.
-- 5. Validates authoritative database prices against submitted line item totals.
-- 6. Enforces exact numeric financial calculations in INR.
-- 7. Decrements stock atomically and rolls back completely on any failure.
-- 8. Validates idempotency ownership:
--    - For authenticated requests: verifies matching customer_id with IS NOT DISTINCT FROM.
--    - For guest requests: verifies normalized email AND normalized mobile number.
--    - Zero sensitive order details leaked to mismatched callers.
-- 9. Uses GET STACKED DIAGNOSTICS to handle unique constraints:
--    - Retries ONLY orders_order_number_key collisions (up to 3 times).
--    - Re-raises unexpected unique constraint violations.
--    - Preserves full transaction rollback for idempotency key conflicts.
-- 10. Obtains order item metadata (name, sku, variant_name) directly from locked DB rows.
-- 11. Strictly restricts execution to service_role inside an atomic transaction.
--
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SCHEMA EXTENSIONS: PERSISTENT IDEMPOTENCY & LEAST PRIVILEGE
-- ------------------------------------------------------------------------------

-- Ensure untrusted roles cannot create objects in the public schema
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- Add dedicated checkout idempotency column to public.orders (additive, non-destructive)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;

-- Add comment explaining purpose
COMMENT ON COLUMN public.orders.checkout_idempotency_key IS 
'Cryptographically random UUID idempotency token for atomic, leak-proof order deduplication.';

-- Create unique partial index enforcing permanent uniqueness specifically on public.orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_idempotency_key 
ON public.orders (checkout_idempotency_key) 
WHERE checkout_idempotency_key IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC TRANSACTION FUNCTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_checkout_order(
  p_customer_id uuid,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_shipping_address_line1 text,
  p_shipping_address_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_customer_notes text,
  p_subtotal numeric,
  p_shipping_amount numeric,
  p_tax_amount numeric,
  p_discount_amount numeric,
  p_total_amount numeric,
  p_currency text,
  p_idempotency_key text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed_key text;
  v_existing_id uuid;
  v_existing_number text;
  v_existing_total numeric;
  v_existing_cust_id uuid;
  v_existing_email text;
  v_existing_phone text;
  v_item jsonb;
  v_prod_id uuid;
  v_var_id uuid;
  v_qty integer;
  v_submitted_unit_price numeric;
  v_submitted_line_total numeric;
  v_auth_unit_price numeric;
  v_expected_line_total numeric;
  v_computed_subtotal numeric := 0;
  v_expected_total numeric := 0;
  v_prod_row record;
  v_var_row record;
  v_order_id uuid;
  v_order_number text;
  v_order_total numeric;
  v_collision_retries integer := 0;
  v_inserted boolean := false;
  v_violated_constraint text;
BEGIN
  -- ----------------------------------------------------------------------------
  -- A. VALIDATE & LOCK CRYPTOGRAPHIC UUID IDEMPOTENCY TOKEN
  -- ----------------------------------------------------------------------------
  v_trimmed_key := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  
  IF v_trimmed_key IS NULL 
     OR pg_catalog.length(v_trimmed_key) <> 36 
     OR v_trimmed_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' 
  THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: A valid UUID checkout idempotency key is required.';
  END IF;

  -- Acquire transaction-scoped advisory lock based on the hash of the idempotency key.
  -- Serializes simultaneous requests with the exact same token to eliminate duplicate orders.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('calvin_checkout_' || v_trimmed_key));

  -- Check if order with this key was already committed (permanent lookup, no expiry)
  SELECT id, order_number, total_amount, customer_id, email, phone
  INTO v_existing_id, v_existing_number, v_existing_total, v_existing_cust_id, v_existing_email, v_existing_phone
  FROM public.orders
  WHERE checkout_idempotency_key = v_trimmed_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Verify ownership:
    -- 1. If existing order was authenticated OR incoming request is authenticated:
    IF v_existing_cust_id IS NOT NULL OR p_customer_id IS NOT NULL THEN
      IF NOT (v_existing_cust_id IS NOT DISTINCT FROM p_customer_id) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_OWNERSHIP_MISMATCH: Idempotency token conflict.';
      END IF;
    ELSE
      -- 2. If both existing order and incoming request are guest checkouts:
      -- Additionally verify normalized email AND normalized mobile number (last 10 digits)
      IF pg_catalog.lower(pg_catalog.btrim(COALESCE(v_existing_email, ''))) <> pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')))
         OR pg_catalog.right(pg_catalog.regexp_replace(COALESCE(v_existing_phone, ''), '\D', '', 'g'), 10) <> pg_catalog.right(pg_catalog.regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10)
      THEN
        RAISE EXCEPTION 'IDEMPOTENCY_OWNERSHIP_MISMATCH: Idempotency token conflict.';
      END IF;
    END IF;

    -- Return duplicate order info ONLY when ownership verification passes
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_existing_id,
      'order_number', v_existing_number,
      'total_amount', v_existing_total,
      'is_duplicate', true
    );
  END IF;

  -- ----------------------------------------------------------------------------
  -- B. BASIC INPUT & FINANCIAL SANITY VALIDATION
  -- ----------------------------------------------------------------------------
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Order must contain at least one line item.';
  END IF;

  IF pg_catalog.upper(pg_catalog.btrim(COALESCE(p_currency, 'INR'))) <> 'INR' THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Store currency must be INR (₹).';
  END IF;

  IF p_subtotal < 0 OR p_shipping_amount < 0 OR p_tax_amount < 0 OR p_discount_amount < 0 OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Financial amounts must be non-negative.';
  END IF;

  -- Check for duplicated inventory targets in request
  IF (
    SELECT count(*) 
    FROM (
      SELECT DISTINCT 
        (value->>'product_id')::uuid AS pid, 
        NULLIF(value->>'variant_id', '')::uuid AS vid 
      FROM jsonb_array_elements(p_items)
    ) t
  ) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Duplicate machine selection detected in cart. Please consolidate items.';
  END IF;

  -- ----------------------------------------------------------------------------
  -- C. DETERMINISTIC INVENTORY & PRICING LOCKING
  -- ----------------------------------------------------------------------------
  -- Step C1: Lock all distinct parent products in ascending UUID order to prevent deadlocks
  FOR v_prod_id IN 
    SELECT DISTINCT (value->>'product_id')::uuid AS pid 
    FROM jsonb_array_elements(p_items) 
    ORDER BY pid ASC
  LOOP
    SELECT id, name, price, stock_quantity, is_active
    INTO v_prod_row
    FROM public.products
    WHERE id = v_prod_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Machine (%) was not found.', v_prod_id;
    END IF;

    IF NOT v_prod_row.is_active THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Machine "%" is currently inactive.', v_prod_row.name;
    END IF;
  END LOOP;

  -- Step C2: Lock all distinct product variants in ascending UUID order to prevent deadlocks
  FOR v_var_id IN 
    SELECT DISTINCT (value->>'variant_id')::uuid AS vid 
    FROM jsonb_array_elements(p_items) 
    WHERE value->>'variant_id' IS NOT NULL AND (value->>'variant_id') <> ''
    ORDER BY vid ASC
  LOOP
    SELECT id, product_id, name, price, stock_quantity, is_active
    INTO v_var_row
    FROM public.product_variants
    WHERE id = v_var_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Product option (%) was not found.', v_var_id;
    END IF;

    IF NOT v_var_row.is_active THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Product option "%" is currently inactive.', v_var_row.name;
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- D. VALIDATE AUTHORITATIVE PRICES, STOCK & DECREMENT INVENTORY
  -- ----------------------------------------------------------------------------
  FOR v_item IN 
    SELECT value 
    FROM jsonb_array_elements(p_items) 
    ORDER BY (value->>'product_id')::uuid ASC, NULLIF(value->>'variant_id', '')::uuid ASC NULLS FIRST
  LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_var_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_submitted_unit_price := (v_item->>'unit_price')::numeric;
    v_submitted_line_total := (v_item->>'line_total')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Quantity for machine % must be positive.', v_prod_id;
    END IF;

    -- Branch D1: Variant Item Verification & Decrement
    IF v_var_id IS NOT NULL THEN
      SELECT v.id, v.product_id, v.name AS var_name, v.price AS var_price, 
             v.stock_quantity AS var_stock, p.name AS prod_name, p.price AS prod_price
      INTO v_var_row
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE v.id = v_var_id AND v.product_id = v_prod_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'ITEM_UNAVAILABLE: Option % does not belong to machine %.', v_var_id, v_prod_id;
      END IF;

      -- Authoritative price: variant price overrides product price if present
      v_auth_unit_price := COALESCE(v_var_row.var_price, v_var_row.prod_price);
      
      IF v_auth_unit_price IS NULL OR v_auth_unit_price < 0 THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: Machine "%" has an invalid price configuration.', v_var_row.prod_name;
      END IF;

      IF v_submitted_unit_price <> v_auth_unit_price THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: The price for "% — %" has changed (expected ₹%, submitted ₹%). Please update your cart.', 
          v_var_row.prod_name, v_var_row.var_name, v_auth_unit_price, v_submitted_unit_price;
      END IF;

      v_expected_line_total := pg_catalog.round(v_auth_unit_price * v_qty, 2);
      IF v_submitted_line_total <> v_expected_line_total THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: Line total mismatch for "% — %".', v_var_row.prod_name, v_var_row.var_name;
      END IF;

      IF v_var_row.var_stock < v_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % unit(s) remaining for "% — %".', v_var_row.var_stock, v_var_row.prod_name, v_var_row.var_name;
      END IF;

      -- Atomic variant decrement
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_qty,
          updated_at = pg_catalog.now()
      WHERE id = v_var_id;

      v_computed_subtotal := v_computed_subtotal + v_expected_line_total;

    -- Branch D2: Base Product Verification & Decrement
    ELSE
      SELECT id, name, price, stock_quantity
      INTO v_prod_row
      FROM public.products
      WHERE id = v_prod_id;

      v_auth_unit_price := v_prod_row.price;

      IF v_auth_unit_price IS NULL OR v_auth_unit_price < 0 THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: Machine "%" has an invalid price configuration.', v_prod_row.name;
      END IF;

      IF v_submitted_unit_price <> v_auth_unit_price THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: The price for "%" has changed (expected ₹%, submitted ₹%). Please update your cart.', 
          v_prod_row.name, v_auth_unit_price, v_submitted_unit_price;
      END IF;

      v_expected_line_total := pg_catalog.round(v_auth_unit_price * v_qty, 2);
      IF v_submitted_line_total <> v_expected_line_total THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: Line total mismatch for "%".', v_prod_row.name;
      END IF;

      IF v_prod_row.stock_quantity < v_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % unit(s) remaining for machine "%".', v_prod_row.stock_quantity, v_prod_row.name;
      END IF;

      -- Atomic product decrement
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_qty,
          updated_at = pg_catalog.now()
      WHERE id = v_prod_id;

      v_computed_subtotal := v_computed_subtotal + v_expected_line_total;
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- E. FINANCIAL TOTALS AUDIT
  -- ----------------------------------------------------------------------------
  v_computed_subtotal := pg_catalog.round(v_computed_subtotal, 2);
  IF p_subtotal <> v_computed_subtotal THEN
    RAISE EXCEPTION 'PRICE_MISMATCH: Subtotal mismatch (computed ₹%, submitted ₹%).', v_computed_subtotal, p_subtotal;
  END IF;

  v_expected_total := pg_catalog.round(v_computed_subtotal + p_shipping_amount + p_tax_amount - p_discount_amount, 2);
  IF p_total_amount <> v_expected_total THEN
    RAISE EXCEPTION 'PRICE_MISMATCH: Total mismatch (expected ₹%, submitted ₹%).', v_expected_total, p_total_amount;
  END IF;

  -- ----------------------------------------------------------------------------
  -- F. CREATE PARENT ORDER WITH DIAGNOSTIC CONSTRAINT HANDLING & CONCURRENT ABORT
  -- ----------------------------------------------------------------------------
  WHILE NOT v_inserted AND v_collision_retries < 3 LOOP
    BEGIN
      -- Generate collision-safe order number matching verified store schema CA-XXXXXXXXXX
      v_order_number := 'CA-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 10));

      INSERT INTO public.orders (
        order_number,
        checkout_idempotency_key,
        customer_id,
        customer_name,
        email,
        phone,
        shipping_address_line1,
        shipping_address_line2,
        city,
        state,
        postal_code,
        country,
        customer_notes,
        subtotal,
        shipping_amount,
        tax_amount,
        discount_amount,
        total_amount,
        currency,
        order_status,
        payment_status,
        payment_reference
      ) VALUES (
        v_order_number,
        v_trimmed_key,
        p_customer_id,
        p_customer_name,
        p_email,
        p_phone,
        p_shipping_address_line1,
        NULLIF(pg_catalog.btrim(p_shipping_address_line2), ''),
        p_city,
        p_state,
        p_postal_code,
        COALESCE(NULLIF(pg_catalog.btrim(p_country), ''), 'India'),
        NULLIF(pg_catalog.btrim(p_customer_notes), ''),
        v_computed_subtotal,
        COALESCE(p_shipping_amount, 0),
        COALESCE(p_tax_amount, 0),
        COALESCE(p_discount_amount, 0),
        v_expected_total,
        'INR',
        'pending',
        'pending',
        NULL
      )
      RETURNING id, order_number, total_amount
      INTO v_order_id, v_order_number, v_order_total;

      v_inserted := true;
    EXCEPTION 
      WHEN unique_violation THEN
        -- Retrieve the exact constraint/index name that caused the violation
        GET STACKED DIAGNOSTICS v_violated_constraint = CONSTRAINT_NAME;

        -- 1. If collision was on checkout_idempotency_key:
        IF v_violated_constraint = 'idx_orders_checkout_idempotency_key'
           OR EXISTS (SELECT 1 FROM public.orders WHERE checkout_idempotency_key = v_trimmed_key)
        THEN
          -- A concurrent transaction already committed this idempotency key.
          -- Abort this transaction immediately to roll back all stock decrements!
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Order with this idempotency key was committed concurrently. Transaction aborted to protect inventory.';
        END IF;

        -- 2. Retry ONLY when orders_order_number_key collided:
        IF v_violated_constraint = 'orders_order_number_key' THEN
          v_collision_retries := v_collision_retries + 1;
          IF v_collision_retries >= 3 THEN
            RAISE EXCEPTION 'ORDER_GENERATION_FAILED: Failed to allocate unique order number after retries.';
          END IF;
        ELSE
          -- 3. Re-raise any other unexpected unique constraint violations
          RAISE;
        END IF;
    END;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- G. INSERT ORDER LINE ITEMS USING AUTHORITATIVE DATABASE ROW METADATA
  -- ----------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_var_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    IF v_var_id IS NOT NULL THEN
      -- Read authoritative metadata from the locked variant and product rows
      SELECT 
        p.name AS prod_name,
        COALESCE(v.sku, p.sku) AS item_sku,
        v.name AS var_name,
        COALESCE(v.price, p.price) AS item_price
      INTO v_var_row
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE v.id = v_var_id AND v.product_id = v_prod_id;

      INSERT INTO public.order_items (
        order_id,
        product_id,
        variant_id,
        product_name,
        sku,
        variant_name,
        unit_price,
        quantity,
        line_total,
        customisation_details
      ) VALUES (
        v_order_id,
        v_prod_id,
        v_var_id,
        v_var_row.prod_name,
        v_var_row.item_sku,
        v_var_row.var_name,
        v_var_row.item_price,
        v_qty,
        pg_catalog.round(v_var_row.item_price * v_qty, 2),
        COALESCE(v_item->'customisation_details', '{}'::jsonb)
      );
    ELSE
      -- Read authoritative metadata from the locked product row
      SELECT 
        p.name AS prod_name,
        p.sku AS item_sku,
        p.price AS item_price
      INTO v_prod_row
      FROM public.products p
      WHERE p.id = v_prod_id;

      INSERT INTO public.order_items (
        order_id,
        product_id,
        variant_id,
        product_name,
        sku,
        variant_name,
        unit_price,
        quantity,
        line_total,
        customisation_details
      ) VALUES (
        v_order_id,
        v_prod_id,
        NULL,
        v_prod_row.prod_name,
        v_prod_row.item_sku,
        NULL,
        v_prod_row.item_price,
        v_qty,
        pg_catalog.round(v_prod_row.item_price * v_qty, 2),
        COALESCE(v_item->'customisation_details', '{}'::jsonb)
      );
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- H. RETURN ORDER CREATION PAYLOAD
  -- ----------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_order_total,
    'is_duplicate', false
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PERMISSIONS & SECURITY HARDENING
-- ------------------------------------------------------------------------------
-- Ensure function owner is postgres
ALTER FUNCTION public.create_checkout_order(
  uuid, text, text, text, text, text, text, text, text, text, text, 
  numeric, numeric, numeric, numeric, numeric, text, text, jsonb
) OWNER TO postgres;

-- Revoke all execution permissions from untrusted roles
REVOKE ALL ON FUNCTION public.create_checkout_order(
  uuid, text, text, text, text, text, text, text, text, text, text, 
  numeric, numeric, numeric, numeric, numeric, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE exclusively to service_role
GRANT EXECUTE ON FUNCTION public.create_checkout_order(
  uuid, text, text, text, text, text, text, text, text, text, text, 
  numeric, numeric, numeric, numeric, numeric, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.create_checkout_order IS
'Production-grade atomic checkout order placement with multi-tier inventory locking, authoritative pricing & metadata verification, guest & authenticated idempotency ownership, diagnostic constraint handling, and full rollback protection.';

COMMIT;
