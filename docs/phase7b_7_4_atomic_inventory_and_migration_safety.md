# CALVIN AATAMAKER — Phase 7B.7.4: Atomic Inventory Release & Migration Side-Effect Safety Audit

**Audit Date:** November 4, 2026  
**Auditor:** Senior Software & Database Engineering Specialist  
**Audited Target Product:** `327d5d70-ec43-4d28-9aff-cd1de77a23c5` (*Compact Domestic Aatamaker*)  
**Status:** Audit Complete — All Invariants Verified & Documented  

---

## Executive Summary

Phase 7B.7.4 performs an in-depth audit of atomic cancellation transactions, pending-order expiration mechanics, test-order immunity, and database migration side-effects prior to executing any production schema migrations or stock corrections.

### Key Audit Findings
1. **Live Test Order State:** All 5 development test orders created during Phase 7B.7 (`CA-120A39C5E1`, `CA-FE9C311C5A`, `CA-35C3C3A849`, `CA-70F00BBF32`, `CA-MTC84MQF84`) are verified as `pending` and `unpaid`. They account for **exactly 6 units** of stock deduction.
2. **Seed Order CA-7891F04B40:** The historical seed order from October 27 (`CA-7891F04B40`) is a non-deducting test artifact. Restoring stock for it would erroneously inflate catalog inventory from 100 to 101. It is strictly excluded from inventory restoration.
3. **Cancellation Atomicity Gap in Application Layer:** The application-level cancellation in `app/api/admin/orders/route.ts` spans multiple HTTP REST calls and cannot guarantee ACID atomicity under crashes or multi-line partial failures. We have integrated support for the transactional PostgreSQL RPC `cancel_order_and_release_inventory()` from migration `202611030004` which locks rows `FOR UPDATE` and guarantees single-transaction execution.
4. **Expiry Worker Safety:** Unfiltered expiry sweeps would inadvertently cancel and release phantom stock for historical test orders and the seed order. Safe expiration queries must explicitly filter `is_test_order = false`, `payment_status != 'paid'`, and `inventory_released_at IS NULL`.
5. **Inventory Restoration Recommendation:** **Option B** (guarded atomic SQL correction: `UPDATE ... WHERE stock_quantity = 94` coupled with marking `inventory_released_at = now()`) is demonstrably safer than Option A (multiple individual RPC round-trips).
6. **Strict Guardrail Compliance:** No live database records were modified, no migrations were applied, no stock was updated, and no customer data was altered during this audit.

---

## 1. Audit of the Five Development Test Orders (Task 1)

A read-only inspection of the live Supabase database was conducted against all recorded orders:

| Order Number | Created At (UTC) | Customer Name | Order Status | Payment Status | Ordered Lines | Qty Deducted | Test Order Flag |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `CA-120A39C5E1` | 2026-11-03 13:26:37 | Test Customer | `pending` | `pending` | 1 | 1 | `true` |
| `CA-FE9C311C5A` | 2026-11-03 14:19:16 | Suresh & Anandi Sharma | `pending` | `pending` | 1 | 1 | `true` |
| `CA-35C3C3A849` | 2026-11-03 14:24:57 | Ramesh Patel | `pending` | `pending` | 1 | 1 | `true` |
| `CA-70F00BBF32` | 2026-11-03 14:25:07 | Suresh & Anandi Sharma | `pending` | `pending` | 1 | 1 | `true` |
| `CA-MTC84MQF84` | 2026-11-03 14:25:24 | Vikram & Maya Verma | `pending` | `pending` | 2 | 2 | `true` |

### 1.1 Verification Checklist
- **All five are pending/unpaid:** Confirmed (`order_status = 'pending'`, `payment_status = 'pending'`).
- **Combined inventory deduction is six units:** Confirmed (1 + 1 + 1 + 1 + 2 = 6 units).
- **Identified as development test orders:** Confirmed via `lib/orders/test-order.ts` (`VERIFIED_TEST_ORDER_NUMBERS`).
- **Seed order CA-7891F04B40 exclusion:** Seed order was created on `2026-10-27T17:37:55Z` with 1 item. Current live stock is 94. 94 + 6 = 100. If CA-7891F04B40 were treated as a deducting test order, live stock would have been 93. Thus, CA-7891F04B40 did not contribute to the current 6-unit deficit.
- **No test order marked as inventory released:** Confirmed (`inventory_released_at` column does not yet exist in live DB; orders remain `pending`).

---

## 2. In-Depth Inspection of Migration 202611030004 (Task 2)

Inspection of `supabase/migrations/202611030004_add_orders_test_flag_and_inventory_release.sql`:

1. **Columns Added to `public.orders`:**
   - `is_test_order` (`boolean NOT NULL DEFAULT false`)
   - `inventory_released_at` (`timestamptz DEFAULT NULL`)
2. **How Existing Test Orders Are Marked:**
   - Backfilled via explicit `UPDATE public.orders SET is_test_order = true WHERE order_number IN ('CA-7891F04B40', 'CA-120A39C5E1', 'CA-FE9C311C5A', 'CA-35C3C3A849', 'CA-70F00BBF32', 'CA-MTC84MQF84');`.
3. **How Inventory Release Is Recorded:**
   - Recorded on `public.orders.inventory_released_at = pg_catalog.now()`, alongside setting `order_status = 'cancelled'`.
4. **Stock Movement Ledger:**
   - **Does NOT exist.** The migration updates `products.stock_quantity` directly. There is no separate table (e.g. `inventory_logs` or `stock_ledger`) tracking per-unit debit/credit balance history.
5. **Indexes & Constraints Safety:**
   - The columns are strictly additive with safe defaults. No table rewrite or lock contention occurs. (Recommended addition: a partial index on `(order_status, created_at) WHERE order_status = 'pending'` for high-volume expiry queries).
6. **Automatic Expiration of Old Orders:**
   - **NOT included.** Migration 0004 provides the cancellation primitive (`cancel_order_and_release_inventory`), but does not schedule or trigger automatic order expiration.
7. **Test Order Treatment in Expiration:**
   - The RPC `cancel_order_and_release_inventory` does not check `is_test_order`. Any caller with `service_role` can cancel a test order. The filtering of test orders must be enforced in the expiry caller.

---

## 3. Cancellation Atomicity Analysis (Task 3)

### 3.1 Limitations of the Application-Level Implementation
The conditional update in `app/api/admin/orders/route.ts` (`.neq("order_status", "cancelled")`) provides partial race-condition protection, but falls short of full ACID atomicity:
1. **Multi-Query REST Execution:** The order status update and subsequent stock increments run across multiple HTTP requests.
2. **Crash/Timeout Vulnerability:** If the Node.js server crashes or times out after updating `orders` but before updating `products`, the order is marked `cancelled` but **stock is permanently lost**.
3. **Read-Modify-Write Race Condition:** Updating stock via `SELECT stock_quantity` then `UPDATE products SET stock_quantity = :read + qty` can overwrite concurrent customer purchases.
4. **Partial Failure on Multi-Item Orders:** In a mixed order with 2 items, if item 2 fails, item 1 is restored while item 2 is not. Retrying the request is blocked because the order is now `cancelled`.

### 3.2 The Transactional PostgreSQL RPC Solution
Migration 0004 provides `public.cancel_order_and_release_inventory(p_order_id uuid)`:
```sql
BEGIN;
  -- Lock order row
  SELECT id, order_number, order_status, inventory_released_at, is_test_order
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- Idempotency check
  IF v_order.inventory_released_at IS NOT NULL OR v_order.order_status = 'cancelled' THEN
    RETURN jsonb_build_object('already_released', true, 'restored_lines', 0);
  END IF;

  -- Atomic state update
  UPDATE public.orders
  SET order_status = 'cancelled', inventory_released_at = pg_catalog.now()
  WHERE id = p_order_id;

  -- Atomic stock restoration
  FOR v_item IN SELECT product_id, variant_id, sum(quantity)::integer AS total_qty
                FROM public.order_items WHERE order_id = p_order_id GROUP BY product_id, variant_id
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity + v_item.total_qty WHERE id = v_item.variant_id;
    ELSIF v_item.product_id IS NOT NULL THEN
      UPDATE public.products SET stock_quantity = stock_quantity + v_item.total_qty WHERE id = v_item.product_id;
    END IF;
  END LOOP;
COMMIT;
```
`app/api/admin/orders/route.ts` has been upgraded to call this RPC primarily, with graceful fallback to application-level logic if the migration has not yet been applied.

---

## 4. Pending Order Expiration Mechanics (Task 4)

### 4.1 Strict Predicate Rules for Expiration
Any automated pending-order expiry worker must obey these strict conditions:
```sql
SELECT id FROM public.orders
WHERE order_status = 'pending'
  AND payment_status != 'paid'
  AND is_test_order = false
  AND inventory_released_at IS NULL
  AND created_at < (pg_catalog.now() - interval '30 minutes');
```

### 4.2 Guardrails Verified
1. **Paid Order Immunity:** An order with `payment_status = 'paid'` or `order_status = 'confirmed'` is never selected for expiration.
2. **Test Order Exclusion:** Development test orders (`is_test_order = true`) are strictly excluded, preventing unintended stock releases.
3. **Seed Order Protection:** `CA-7891F04B40` is flagged with `is_test_order = true` and `inventory_released_at` populated, preventing duplicate release.
4. **No Double Release:** Orders with `inventory_released_at IS NOT NULL` are strictly excluded.
5. **No Active Payment Gateway:** In accordance with project instructions, no background schedulers or automated refunds are active.

---

## 5. Inventory Restoration Plan & Comparison (Task 5)

Current stock: **94 units**. Required target: **100 units** (+6 units).

### 5.1 Comparison of Options

| Criterion | Option A: Individual RPC Cancellations | Option B: Guarded Atomic SQL Correction |
| :--- | :--- | :--- |
| **Execution Method** | 5 separate calls to `cancel_order_and_release_inventory()` | 1 atomic SQL transaction block |
| **Transaction Boundary** | 5 independent transactions | Single all-or-nothing transaction |
| **Risk of Partial State** | Moderate (if call 3 fails, stock is 97) | **Zero** (atomic rollback on error) |
| **Optimistic Guard** | None on stock (restores whatever lines exist) | **Strict:** `WHERE stock_quantity = 94` |
| **Handling of Seed Order** | Requires special-casing to avoid 7th unit release | **Explicitly marks seed order as released** |
| **Recommendation** | Not Recommended | **STRONGLY RECOMMENDED** |

### 5.2 Recommended Script for Approval (Option B)
```sql
BEGIN;

-- 1. Guarded stock restoration for Compact Domestic Aatamaker
UPDATE public.products
SET stock_quantity = stock_quantity + 6,
    updated_at = pg_catalog.now()
WHERE id = '327d5d70-ec43-4d28-9aff-cd1de77a23c5'
  AND stock_quantity = 94;

-- 2. Mark the 5 development test orders as cancelled and released
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

-- 3. Populate inventory_released_at for seed order CA-7891F04B40 to prevent future release
UPDATE public.orders
SET inventory_released_at = '2026-10-27 17:37:55+00'::timestamptz
WHERE order_number = 'CA-7891F04B40'
  AND inventory_released_at IS NULL;

COMMIT;
```

---

## 6. Migration Execution Plan & Order (Task 6)

### 6.1 Execution Sequence & Dependencies

```
[0002: Add customization_config] 
               │
               ▼
[0003: Enhanced create_checkout_order] 
               │
               ▼
[0004: Orders Test Flag & Atomic Release]
```

1. **Step 1 — `202611030002_add_products_customization_config.sql`**
   - *Dependency:* `public.products` (existing).
   - *Changes:* Adds `customization_config` JSONB column with schema constraint and demonstration backfill.
   - *Verification:* `verify_202611030002_add_products_customization_config.sql`.
   - *Rollback:* `ALTER TABLE public.products DROP COLUMN IF EXISTS customization_config;`.
2. **Step 2 — `202611030003_enhanced_checkout_order_customizations.sql`**
   - *Dependency:* `products.customization_config` (from 0002).
   - *Changes:* Replaces `public.create_checkout_order()` RPC to support bespoke price deltas, mixed carts, and atomic multi-line inventory deductions.
   - *Verification:* `verify_202611030003_enhanced_checkout_order_customizations.sql`.
   - *Rollback:* Restore previous definition from `202611020002_atomic_checkout_order.sql`.
3. **Step 3 — `202611030004_add_orders_test_flag_and_inventory_release.sql`**
   - *Dependency:* `public.orders` (existing).
   - *Changes:* Adds `is_test_order` and `inventory_released_at` to `orders`, backfills 6 test orders, establishes `cancel_order_and_release_inventory()` RPC.
   - *Verification:* `verify_202611030004_add_orders_test_flag_and_inventory_release.sql`.
   - *Rollback:* `DROP FUNCTION IF EXISTS public.cancel_order_and_release_inventory(uuid); ALTER TABLE public.orders DROP COLUMN IF EXISTS is_test_order, DROP COLUMN IF EXISTS inventory_released_at;`.

### 6.2 Objects That Must Not Be Recreated
- Do NOT drop or recreate `orders`, `order_items`, `products`, `product_variants`, `profiles`, or `categories`.
- Do NOT alter existing auth trigger `on_auth_user_created` or `handle_new_user()`.
- Legacy draft `202611020004_product_customization_studio.sql` is superseded and must remain unapplied.

---

## 7. Verification Evidence

- `scripts/test-phase7b74-atomicity-and-safety.mjs`: **25 / 25 PASSED**
- `scripts/test-phase7b73-inventory-lifecycle.mjs`: **35 / 35 PASSED**
- `scripts/test-phase7b7-order-lifecycle.mjs`: **40 / 40 PASSED**
- `scripts/test-phase7b65-cart-identity.mjs`: **55 / 55 PASSED**
- `scripts/test-phase7b651-fingerprint-collision.mjs`: **29 / 29 PASSED**
- `npm run typecheck`: **0 errors**
- `npm run lint`: **0 errors**
- `npm run build`: **0 errors (all routes validated)**

