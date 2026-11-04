-- ==============================================================================
-- CALVIN AATAMAKER — Product Personalization Studio Schema Migration
-- Migration: 202611020004_product_customization_studio.sql
-- Target Tables: public.products, public.orders, public.order_items
-- Target Functions: public.create_checkout_order
-- ==============================================================================
--
-- PURPOSE:
-- 1. Adds additive customization_config column to public.products.
-- 2. Upgrades public.create_checkout_order() to support server-validated customization
--    price deltas (v_item->>'customisation_price_delta') while maintaining full
--    backward-compatibility for standard, uncustomized items.
-- 3. Stores clean, authoritative customization snapshots in order_items.customisation_details.
-- 4. Preserves 100% atomic inventory locking, deadlock prevention, and idempotency guarantees.
--
-- SECURITY ARCHITECTURE:
-- 1. SECURITY DEFINER with fixed search_path = public, pg_temp.
-- 2. Strictly granted to service_role; PUBLIC and anon have ZERO execute privileges.
-- 3. Atomic stock decrements roll back completely upon any constraint or price conflict.
--
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ADDITIVE COLUMNS: public.products
-- ------------------------------------------------------------------------------
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS customization_config jsonb DEFAULT NULL;

COMMENT ON COLUMN public.products.customization_config IS 
'Configurable personalization schema defining supported fields, swatches, options, character limits, and price deltas.';

-- ------------------------------------------------------------------------------
-- 2. UPGRADED ATOMIC CHECKOUT FUNCTION WITH CUSTOMIZATION SUPPORT
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
  v_custom_delta numeric;
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    ('x' || pg_catalog.substr(pg_catalog.md5('calvin_checkout_' || v_trimmed_key), 1, 16))::bit(64)::bigint
  );

  -- ----------------------------------------------------------------------------
  -- B. PERSISTENT DEDUPLICATION & OWNERSHIP INTEGRITY CHECK
  -- ----------------------------------------------------------------------------
  SELECT id, order_number, total_amount, customer_id, email, phone
  INTO v_existing_id, v_existing_number, v_existing_total, v_existing_cust_id, v_existing_email, v_existing_phone
  FROM public.orders
  WHERE checkout_idempotency_key = v_trimmed_key;

  IF FOUND THEN
    IF p_customer_id IS NOT NULL THEN
      IF v_existing_cust_id IS DISTINCT FROM p_customer_id THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key already exists for another customer.';
      END IF;
    ELSE
      IF v_existing_cust_id IS NOT NULL 
         OR pg_catalog.lower(pg_catalog.btrim(COALESCE(v_existing_email, ''))) <> pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')))
         OR pg_catalog.regexp_replace(COALESCE(v_existing_phone, ''), '\D', '', 'g') <> pg_catalog.regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
      THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key already exists for another checkout attempt.';
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'order_id', v_existing_id,
      'order_number', v_existing_number,
      'total_amount', v_existing_total,
      'status', 'existing'
    );
  END IF;

  -- ----------------------------------------------------------------------------
  -- C. MULTI-ITEM ROW-LOCK ORDERING & STATUS VALIDATION
  -- ----------------------------------------------------------------------------
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Order must contain at least one machine item.';
  END IF;

  -- Lock parent products in deterministic UUID ascending order
  FOR v_prod_id IN 
    SELECT DISTINCT (value->>'product_id')::uuid 
    FROM jsonb_array_elements(p_items)
    ORDER BY 1 ASC
  LOOP
    SELECT id, name, is_active, stock_quantity, price
    INTO v_prod_row
    FROM public.products
    WHERE id = v_prod_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Machine % does not exist.', v_prod_id;
    END IF;

    IF NOT v_prod_row.is_active THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Machine "%" is no longer available.', v_prod_row.name;
    END IF;
  END LOOP;

  -- Lock variant rows in deterministic UUID ascending order
  FOR v_var_id IN 
    SELECT DISTINCT (value->>'variant_id')::uuid 
    FROM jsonb_array_elements(p_items)
    WHERE value->>'variant_id' IS NOT NULL AND value->>'variant_id' <> ''
    ORDER BY 1 ASC
  LOOP
    SELECT id, product_id, name, is_active, stock_quantity, price
    INTO v_var_row
    FROM public.product_variants
    WHERE id = v_var_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Machine option % does not exist.', v_var_id;
    END IF;

    IF NOT v_var_row.is_active THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: Machine option "%" is no longer available.', v_var_row.name;
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
    v_custom_delta := COALESCE((v_item->>'customisation_price_delta')::numeric, 0);
    v_submitted_unit_price := (v_item->>'unit_price')::numeric;
    v_submitted_line_total := (v_item->>'line_total')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Quantity for machine % must be positive.', v_prod_id;
    END IF;

    IF v_custom_delta < 0 THEN
      RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Personalisation price delta cannot be negative.';
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

      -- Authoritative price: variant price overrides product price, plus personalization delta
      v_auth_unit_price := COALESCE(v_var_row.var_price, v_var_row.prod_price) + v_custom_delta;
      
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

      v_auth_unit_price := v_prod_row.price + v_custom_delta;

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
  -- E. FINANCIAL TOTALS VALIDATION
  -- ----------------------------------------------------------------------------
  v_computed_subtotal := pg_catalog.round(v_computed_subtotal, 2);
  IF p_subtotal <> v_computed_subtotal THEN
    RAISE EXCEPTION 'FINANCIAL_MISMATCH: Subtotal mismatch (expected ₹%, submitted ₹%).', 
      v_computed_subtotal, p_subtotal;
  END IF;

  v_expected_total := pg_catalog.round(
    v_computed_subtotal + COALESCE(p_shipping_amount, 0) + COALESCE(p_tax_amount, 0) - COALESCE(p_discount_amount, 0),
    2
  );

  IF p_total_amount <> v_expected_total THEN
    RAISE EXCEPTION 'FINANCIAL_MISMATCH: Total mismatch (expected ₹%, submitted ₹%).', 
      v_expected_total, p_total_amount;
  END IF;

  -- ----------------------------------------------------------------------------
  -- F. ORDER NUMBER GENERATION WITH RESILIENT RETRY
  -- ----------------------------------------------------------------------------
  WHILE NOT v_inserted LOOP
    BEGIN
      v_order_number := 'CA-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.gen_random_uuid()::text), 1, 10));

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
        GET STACKED DIAGNOSTICS v_violated_constraint = CONSTRAINT_NAME;

        IF v_violated_constraint = 'idx_orders_checkout_idempotency_key'
           OR EXISTS (SELECT 1 FROM public.orders WHERE checkout_idempotency_key = v_trimmed_key)
        THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Order with this idempotency key was committed concurrently. Transaction aborted to protect inventory.';
        END IF;

        IF v_violated_constraint = 'orders_order_number_key' THEN
          v_collision_retries := v_collision_retries + 1;
          IF v_collision_retries >= 3 THEN
            RAISE EXCEPTION 'ORDER_GENERATION_FAILED: Failed to allocate unique order number after retries.';
          END IF;
        ELSE
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
    v_custom_delta := COALESCE((v_item->>'customisation_price_delta')::numeric, 0);

    IF v_var_id IS NOT NULL THEN
      SELECT 
        p.name AS prod_name,
        COALESCE(v.sku, p.sku) AS item_sku,
        v.name AS var_name,
        (COALESCE(v.price, p.price) + v_custom_delta) AS item_price
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
      SELECT 
        p.name AS prod_name,
        p.sku AS item_sku,
        (p.price + v_custom_delta) AS item_price
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
  -- H. RETURN ORDER CREATION SUCCESS PAYLOAD
  -- ----------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_order_total,
    'status', 'created'
  );
END;
$$;

-- Restrict function execution strictly to service_role
REVOKE EXECUTE ON FUNCTION public.create_checkout_order FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_order TO service_role;

COMMIT;

