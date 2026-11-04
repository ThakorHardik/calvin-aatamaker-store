-- ==============================================================================
-- CALVIN AATAMAKER — Enhanced Checkout Order with Bespoke Customizations & Mixed Carts
-- Migration Proposal: 202611030003_enhanced_checkout_order_customizations.sql
-- ==============================================================================
--
-- PURPOSE:
-- 1. Updates public.create_checkout_order() to support:
--    a) Normal uncustomized orders.
--    b) Fully customized bespoke orders with price deltas.
--    c) Mixed orders (normal + customized of the same machine model).
--    d) Multiple distinct custom designs of the same machine model in one order.
-- 2. Aggregates stock decrements across multiple cart items targeting the same
--    physical machine inventory, ensuring atomic decrement without duplicate rejection.
-- 3. Authoritatively validates base price plus customization price adjustments.
-- 4. Preserves full cryptographic UUID idempotency key verification, advisory locking,
--    diagnostic constraint handling, and atomic rollback guarantees.
--
-- DO NOT APPLY TO LIVE DATABASE WITHOUT EXPLICIT CLIENT AUTHORIZATION.
-- ==============================================================================

BEGIN;

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
  v_custom_delta numeric;
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
  v_req_stock integer;
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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('calvin_checkout_' || v_trimmed_key));

  -- Check if order with this key was already committed
  SELECT id, order_number, total_amount, customer_id, email, phone
  INTO v_existing_id, v_existing_number, v_existing_total, v_existing_cust_id, v_existing_email, v_existing_phone
  FROM public.orders
  WHERE checkout_idempotency_key = v_trimmed_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Verify ownership:
    IF v_existing_cust_id IS NOT NULL OR p_customer_id IS NOT NULL THEN
      IF NOT (v_existing_cust_id IS NOT DISTINCT FROM p_customer_id) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_OWNERSHIP_MISMATCH: Idempotency token conflict.';
      END IF;
    ELSE
      IF pg_catalog.lower(pg_catalog.btrim(COALESCE(v_existing_email, ''))) <> pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')))
         OR pg_catalog.right(pg_catalog.regexp_replace(COALESCE(v_existing_phone, ''), '\D', '', 'g'), 10) <> pg_catalog.right(pg_catalog.regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10)
      THEN
        RAISE EXCEPTION 'IDEMPOTENCY_OWNERSHIP_MISMATCH: Idempotency token conflict.';
      END IF;
    END IF;

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

  -- ----------------------------------------------------------------------------
  -- C. DETERMINISTIC INVENTORY & PRICING LOCKING
  -- ----------------------------------------------------------------------------
  -- Step C1: Lock all distinct parent products in ascending UUID order
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

  -- Step C2: Lock all distinct product variants in ascending UUID order
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
  -- D. VALIDATE AGGREGATE INVENTORY PER TARGET (SUPPORTS MIXED & MULTI-CUSTOM ITEMS)
  -- ----------------------------------------------------------------------------
  -- Check parent products stock against sum of all line items targeting it
  FOR v_prod_id, v_req_stock IN
    SELECT (value->>'product_id')::uuid, sum((value->>'quantity')::integer)
    FROM jsonb_array_elements(p_items)
    WHERE value->>'variant_id' IS NULL OR (value->>'variant_id') = ''
    GROUP BY (value->>'product_id')::uuid
  LOOP
    SELECT stock_quantity, name INTO v_prod_row FROM public.products WHERE id = v_prod_id;
    IF v_prod_row.stock_quantity < v_req_stock THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % unit(s) remaining for machine "%" (requested %).', 
        v_prod_row.stock_quantity, v_prod_row.name, v_req_stock;
    END IF;
  END LOOP;

  -- Check variants stock against sum of all line items targeting it
  FOR v_var_id, v_req_stock IN
    SELECT (value->>'variant_id')::uuid, sum((value->>'quantity')::integer)
    FROM jsonb_array_elements(p_items)
    WHERE value->>'variant_id' IS NOT NULL AND (value->>'variant_id') <> ''
    GROUP BY (value->>'variant_id')::uuid
  LOOP
    SELECT stock_quantity, name INTO v_var_row FROM public.product_variants WHERE id = v_var_id;
    IF v_var_row.stock_quantity < v_req_stock THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % unit(s) remaining for product option "%" (requested %).', 
        v_var_row.stock_quantity, v_var_row.name, v_req_stock;
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- E. VALIDATE PRICES, CALCULATE SUBTOTAL & DECREMENT INVENTORY
  -- ----------------------------------------------------------------------------
  FOR v_item IN 
    SELECT value 
    FROM jsonb_array_elements(p_items) 
  LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_var_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_submitted_unit_price := (v_item->>'unit_price')::numeric;
    v_submitted_line_total := (v_item->>'line_total')::numeric;
    v_custom_delta := COALESCE((v_item->>'customisation_price_delta')::numeric, (v_item->'customisation_details'->>'_price_delta')::numeric, 0);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'CHECKOUT_VALIDATION_ERROR: Quantity for machine % must be positive.', v_prod_id;
    END IF;

    IF v_var_id IS NOT NULL THEN
      SELECT v.id, v.product_id, v.name AS var_name, v.price AS var_price, p.name AS prod_name, p.price AS prod_price
      INTO v_var_row
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE v.id = v_var_id AND v.product_id = v_prod_id;

      v_auth_unit_price := COALESCE(v_var_row.var_price, v_var_row.prod_price) + v_custom_delta;

      IF v_submitted_unit_price <> v_auth_unit_price THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: The price for "% — %" has changed (expected ₹%, submitted ₹%). Please update your cart.', 
          v_var_row.prod_name, v_var_row.var_name, v_auth_unit_price, v_submitted_unit_price;
      END IF;

      v_expected_line_total := pg_catalog.round(v_auth_unit_price * v_qty, 2);
      IF v_submitted_line_total <> v_expected_line_total THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: Line total mismatch for "% — %".', v_var_row.prod_name, v_var_row.var_name;
      END IF;

      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_qty,
          updated_at = pg_catalog.now()
      WHERE id = v_var_id;

      v_computed_subtotal := v_computed_subtotal + v_expected_line_total;
    ELSE
      SELECT id, name, price INTO v_prod_row FROM public.products WHERE id = v_prod_id;

      v_auth_unit_price := v_prod_row.price + v_custom_delta;

      IF v_submitted_unit_price <> v_auth_unit_price THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: The price for "%" has changed (expected ₹%, submitted ₹%). Please update your cart.', 
          v_prod_row.name, v_auth_unit_price, v_submitted_unit_price;
      END IF;

      v_expected_line_total := pg_catalog.round(v_auth_unit_price * v_qty, 2);
      IF v_submitted_line_total <> v_expected_line_total THEN
        RAISE EXCEPTION 'PRICE_MISMATCH: Line total mismatch for "%".', v_prod_row.name;
      END IF;

      UPDATE public.products
      SET stock_quantity = stock_quantity - v_qty,
          updated_at = pg_catalog.now()
      WHERE id = v_prod_id;

      v_computed_subtotal := v_computed_subtotal + v_expected_line_total;
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- F. FINANCIAL TOTALS AUDIT
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
  -- G. CREATE PARENT ORDER
  -- ----------------------------------------------------------------------------
  WHILE NOT v_inserted AND v_collision_retries < 3 LOOP
    BEGIN
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
  -- H. INSERT ORDER LINE ITEMS WITH FULL CUSTOMIZATION DETAILS SNAPSHOT
  -- ----------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_var_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_submitted_unit_price := (v_item->>'unit_price')::numeric;
    v_submitted_line_total := (v_item->>'line_total')::numeric;

    IF v_var_id IS NOT NULL THEN
      SELECT 
        p.name AS prod_name,
        COALESCE(v.sku, p.sku) AS item_sku,
        v.name AS var_name
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
        v_submitted_unit_price,
        v_qty,
        v_submitted_line_total,
        COALESCE(v_item->'customisation_details', '{}'::jsonb)
      );
    ELSE
      SELECT 
        p.name AS prod_name,
        p.sku AS item_sku
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
        v_submitted_unit_price,
        v_qty,
        v_submitted_line_total,
        COALESCE(v_item->'customisation_details', '{}'::jsonb)
      );
    END IF;
  END LOOP;

  -- Return successfully created order record
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_order_total,
    'is_duplicate', false
  );
END;
$$;

-- Secure execution permissions
REVOKE EXECUTE ON FUNCTION public.create_checkout_order FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_order TO service_role;

COMMIT;

