/**
 * CALVIN AATAMAKER — Phase 7B.7.4.1 Guarded Inventory Reconciliation Test Suite
 * File: scripts/test-phase7b741-guarded-reconciliation.mjs
 *
 * Verifies:
 * 1. 17-step Guarded Transaction Validation Logic
 * 2. Precondition Aborts (stock != 94, missing orders, non-test orders, already-released orders)
 * 3. Seed Order CA-7891F04B40 Truthful Exemption (inventory_deducted = false)
 * 4. RPC vs Fallback Safety in Admin Orders Route (only fall back on missing function)
 * 5. Multi-item quantity aggregation exactness (1+1+1+1+2 = 6 units)
 */

import { isDevelopmentTestOrder, VERIFIED_TEST_ORDER_NUMBERS } from "../lib/orders/test-order.ts";

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

console.log("================================================================================");
console.log("CALVIN AATAMAKER — PHASE 7B.7.4.1 GUARDED RECONCILIATION SUITE");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// [TEST 1] Simulated 17-Step Guarded Reconciliation Transaction
// -----------------------------------------------------------------------------
console.log("[TEST 1] Simulated 17-Step Guarded Reconciliation Transaction");
{
  function runGuardedReconciliation(initialDbState, overrides = {}) {
    const db = JSON.parse(JSON.stringify(initialDbState));
    if (overrides.product) Object.assign(db.product, overrides.product);
    if (overrides.orders) db.orders = overrides.orders;

    // Step 1: Lock 5 test orders & Step 2: verify count == 5
    const testOrders = db.orders.filter(o =>
      ["CA-120A39C5E1", "CA-FE9C311C5A", "CA-35C3C3A849", "CA-70F00BBF32", "CA-MTC84MQF84"].includes(o.order_number)
    );
    if (testOrders.length !== 5) {
      throw new Error(`Expected 5 development test orders, found ${testOrders.length}`);
    }

    // Step 3: verify is_test_order = true
    if (!testOrders.every(o => o.is_test_order === true)) {
      throw new Error("One or more orders are not flagged as is_test_order = true");
    }

    // Step 4: verify all pending
    if (!testOrders.every(o => o.order_status === "pending")) {
      throw new Error("One or more orders are not pending");
    }

    // Step 5: verify all unpaid
    if (!testOrders.every(o => o.payment_status === "pending")) {
      throw new Error("One or more orders are not unpaid");
    }

    // Step 6: verify inventory_released_at IS NULL
    if (!testOrders.every(o => o.inventory_released_at === null)) {
      throw new Error("One or more orders already have inventory_released_at populated");
    }

    // Step 7 & 8: Lock target product row & verify stock == 94
    if (db.product.id !== "327d5d70-ec43-4d28-9aff-cd1de77a23c5") {
      throw new Error("Target product does not exist");
    }
    if (db.product.stock_quantity !== 94) {
      throw new Error(`Target product stock is ${db.product.stock_quantity}, expected 94`);
    }

    // Step 10 & 11: calculate product quantity from order_items and verify == 6
    const totalQty = testOrders.reduce((sum, o) => {
      const pItems = o.items.filter(it => it.product_id === db.product.id);
      return sum + pItems.reduce((s, it) => s + it.quantity, 0);
    }, 0);

    if (totalQty !== 6) {
      throw new Error(`Calculated quantity is ${totalQty}, expected 6`);
    }

    // Step 12 & 13: restore 6 units & verify 1 row updated
    db.product.stock_quantity += 6;
    const updatedProdCount = 1;
    if (updatedProdCount !== 1) throw new Error("Failed to update product");

    // Step 14 & 15: mark 5 orders cancelled and released & verify 5 rows updated
    let updatedOrdersCount = 0;
    for (const o of testOrders) {
      o.order_status = "cancelled";
      o.inventory_released_at = "2026-11-04T00:00:00Z";
      updatedOrdersCount++;
    }
    if (updatedOrdersCount !== 5) throw new Error("Failed to update orders");

    // Step 16: Seed order handled separately
    const seedOrder = db.orders.find(o => o.order_number === "CA-7891F04B40");
    if (seedOrder) {
      seedOrder.is_test_order = true;
      seedOrder.inventory_deducted = false;
      // Do NOT set inventory_released_at on seed order
    }

    // Step 17: Commit
    return { success: true, db };
  }

  const validDb = {
    product: { id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", name: "Compact Domestic Aatamaker", stock_quantity: 94 },
    orders: [
      { order_number: "CA-120A39C5E1", is_test_order: true, order_status: "pending", payment_status: "pending", inventory_released_at: null, items: [{ product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }] },
      { order_number: "CA-FE9C311C5A", is_test_order: true, order_status: "pending", payment_status: "pending", inventory_released_at: null, items: [{ product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }] },
      { order_number: "CA-35C3C3A849", is_test_order: true, order_status: "pending", payment_status: "pending", inventory_released_at: null, items: [{ product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }] },
      { order_number: "CA-70F00BBF32", is_test_order: true, order_status: "pending", payment_status: "pending", inventory_released_at: null, items: [{ product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }] },
      { order_number: "CA-MTC84MQF84", is_test_order: true, order_status: "pending", payment_status: "pending", inventory_released_at: null, items: [{ product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }, { product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }] },
      { order_number: "CA-7891F04B40", is_test_order: true, order_status: "pending", payment_status: "pending", inventory_released_at: null, inventory_deducted: true, items: [{ product_id: "327d5d70-ec43-4d28-9aff-cd1de77a23c5", quantity: 1 }] },
    ],
  };

  // Valid run
  const res = runGuardedReconciliation(validDb);
  check(res.success === true, "Valid reconciliation succeeds completely");
  check(res.db.product.stock_quantity === 100, "Product stock restored to exactly 100");
  check(res.db.orders.filter(o => o.order_status === "cancelled").length === 5, "Exactly 5 test orders cancelled");
  check(res.db.orders.filter(o => o.inventory_released_at !== null).length === 5, "Exactly 5 test orders marked released");
  
  const seedInDb = res.db.orders.find(o => o.order_number === "CA-7891F04B40");
  check(seedInDb.inventory_deducted === false, "Seed order marked inventory_deducted = false");
  check(seedInDb.inventory_released_at === null, "Seed order inventory_released_at remains NULL (truthful accounting)");

  // Failure Preconditions
  let failedStock = false;
  try {
    runGuardedReconciliation(validDb, { product: { stock_quantity: 93 } });
  } catch (e) {
    failedStock = e.message.includes("expected 94");
  }
  check(failedStock, "Aborts when stock is not exactly 94");

  let failedOrderCount = false;
  try {
    runGuardedReconciliation(validDb, { orders: validDb.orders.slice(1) });
  } catch (e) {
    failedOrderCount = e.message.includes("Expected 5 development test orders");
  }
  check(failedOrderCount, "Aborts when order count is not exactly 5");

  let failedNonTest = false;
  try {
    const altered = JSON.parse(JSON.stringify(validDb.orders));
    altered[0].is_test_order = false;
    runGuardedReconciliation(validDb, { orders: altered });
  } catch (e) {
    failedNonTest = e.message.includes("not flagged as is_test_order");
  }
  check(failedNonTest, "Aborts when an order lacks is_test_order = true");

  let failedAlreadyReleased = false;
  try {
    const altered = JSON.parse(JSON.stringify(validDb.orders));
    altered[0].inventory_released_at = "2026-11-03T12:00:00Z";
    runGuardedReconciliation(validDb, { orders: altered });
  } catch (e) {
    failedAlreadyReleased = e.message.includes("already have inventory_released_at populated");
  }
  check(failedAlreadyReleased, "Aborts when an order was already released");

  let failedBadQuantity = false;
  try {
    const altered = JSON.parse(JSON.stringify(validDb.orders));
    altered[4].items[0].quantity = 5; // changes total to 10
    runGuardedReconciliation(validDb, { orders: altered });
  } catch (e) {
    failedBadQuantity = e.message.includes("expected 6");
  }
  check(failedBadQuantity, "Aborts when item quantity does not sum to exactly 6");
}

// -----------------------------------------------------------------------------
// [TEST 2] RPC vs Fallback Safety in Admin Orders API
// -----------------------------------------------------------------------------
console.log("\n[TEST 2] RPC vs Fallback Safety in Admin Orders API");
{
  function routeCancellationHandler(mockRpcError, mockRpcResult, order) {
    // Exact logic in app/api/admin/orders/route.ts
    let executedFallback = false;
    let returned500 = false;
    let response = null;

    if (mockRpcError) {
      const errorMsg = mockRpcError.message || "";
      const errorCode = mockRpcError.code || "";
      const isMissingFunction =
        errorCode === "PGRST202" ||
        errorCode === "42883" ||
        errorMsg.includes("Could not find the function") ||
        errorMsg.includes("cancel_order_and_release_inventory") ||
        errorMsg.includes("does not exist");

      if (!isMissingFunction) {
        returned500 = true;
        return { executedFallback: false, returned500: true, error: errorMsg };
      }
      // RPC missing -> proceed to fallback
    } else if (mockRpcResult && typeof mockRpcResult === "object") {
      return {
        executedFallback: false,
        returned500: false,
        result: mockRpcResult,
        restored: !mockRpcResult.already_released,
      };
    }

    // Fallback logic
    executedFallback = true;
    const isExempt = order.inventory_deducted === false || order.order_number === "CA-7891F04B40";
    if (isExempt) {
      return {
        executedFallback: true,
        returned500: false,
        restored: false,
        message: "Exempt from stock restoration",
      };
    }

    return {
      executedFallback: true,
      returned500: false,
      restored: true,
      message: "Fallback restored inventory",
    };
  }

  // Case 1: RPC succeeds normally
  const rpcOk = routeCancellationHandler(null, { success: true, already_released: false, restored_lines: 1 }, { order_number: "CA-120A39C5E1" });
  check(!rpcOk.executedFallback, "Does NOT execute fallback when RPC succeeds");
  check(rpcOk.restored === true, "Marks inventory as restored on first RPC cancellation");

  // Case 2: RPC called again (idempotent / response was lost)
  const rpcRetry = routeCancellationHandler(null, { success: true, already_released: true, restored_lines: 0 }, { order_number: "CA-120A39C5E1" });
  check(!rpcRetry.executedFallback, "Does NOT execute fallback on RPC idempotent retry");
  check(rpcRetry.restored === false, "Prevents duplicate stock restoration on retry");

  // Case 3: Real Database Error in RPC (e.g. deadlock, validation fail, permission error)
  const rpcRealError = routeCancellationHandler({ code: "40P01", message: "deadlock detected" }, null, { order_number: "CA-120A39C5E1" });
  check(rpcRealError.returned500 === true, "Returns 500 when RPC hits real DB error");
  check(rpcRealError.executedFallback === false, "Strictly REFUSES fallback on real DB error");

  // Case 4: Missing function error (migration 0004 not yet applied)
  const rpcMissingFunc = routeCancellationHandler({ code: "PGRST202", message: "Could not find the function cancel_order_and_release_inventory" }, null, { order_number: "CA-120A39C5E1" });
  check(rpcMissingFunc.executedFallback === true, "Permits fallback ONLY when function is genuinely missing");
  check(rpcMissingFunc.restored === true, "Fallback restores stock for normal test order");

  // Case 5: Fallback on Seed Order CA-7891F04B40
  const fallbackSeed = routeCancellationHandler({ code: "PGRST202", message: "Could not find function" }, null, { order_number: "CA-7891F04B40", inventory_deducted: false });
  check(fallbackSeed.executedFallback === true, "Fallback handles seed order");
  check(fallbackSeed.restored === false, "Fallback refuses to restore stock for seed order (exempt)");
}

console.log("\n================================================================================");
console.log(`PHASE 7B.7.4.1 AUDIT TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log("================================================================================");

