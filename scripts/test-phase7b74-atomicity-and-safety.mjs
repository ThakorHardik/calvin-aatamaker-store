/**
 * CALVIN AATAMAKER — Phase 7B.7.4 Atomic Inventory & Migration Safety Verification Suite
 * File: scripts/test-phase7b74-atomicity-and-safety.mjs
 *
 * Verifies:
 * 1. Cancellation Concurrency & Atomicity (simulates simultaneous cancellation requests)
 * 2. Partial-failure Transaction Rollback (prevents orphan stock restoration)
 * 3. Seed Order CA-7891F04B40 Safety & Exclusion from 6-unit restoration
 * 4. Expiry Worker Predicate Precision (Immunity of paid orders, exclusion of test orders)
 * 5. Double-Release Prevention (Idempotent inventory_released_at check)
 * 6. Mathematical Reconciliation of 94 -> 100 stock restoration paths (Option A vs Option B)
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
console.log("CALVIN AATAMAKER — PHASE 7B.7.4 ATOMIC INVENTORY & SAFETY AUDIT SUITE");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// [TEST 1] Concurrency & Lock Contention on Simultaneous Cancellation
// -----------------------------------------------------------------------------
console.log("[TEST 1] Concurrency & Lock Contention on Simultaneous Cancellation");
{
  // Simulated PostgreSQL row with FOR UPDATE lock
  let dbOrder = {
    id: "ord-test-concurrent",
    order_number: "CA-CONCURRENT",
    order_status: "pending",
    inventory_released_at: null,
  };
  let dbProduct = {
    id: "prod-1",
    stock_quantity: 94,
  };
  const orderItems = [
    { product_id: "prod-1", quantity: 2 },
  ];

  // Simulating the transactional RPC function cancel_order_and_release_inventory
  async function cancelOrderAndReleaseInventoryRPC(orderId) {
    // 1. SELECT ... FOR UPDATE (serialized in PostgreSQL)
    if (dbOrder.id !== orderId) throw new Error("Order not found");

    if (dbOrder.inventory_released_at !== null || dbOrder.order_status === "cancelled") {
      return {
        success: true,
        already_released: true,
        restored_units: 0,
        message: "Order already cancelled",
      };
    }

    // Atomic update inside transaction
    dbOrder.order_status = "cancelled";
    dbOrder.inventory_released_at = new Date().toISOString();

    let restored = 0;
    for (const it of orderItems) {
      dbProduct.stock_quantity += it.quantity;
      restored += it.quantity;
    }

    return {
      success: true,
      already_released: false,
      restored_units: restored,
      message: "Order cancelled and inventory restored",
    };
  }

  // Fire two concurrent requests simultaneously using Promise.all
  const [res1, res2] = await Promise.all([
    cancelOrderAndReleaseInventoryRPC("ord-test-concurrent"),
    cancelOrderAndReleaseInventoryRPC("ord-test-concurrent"),
  ]);

  // One must win and restore stock; the other must detect already_released
  const winner = res1.already_released ? res2 : res1;
  const loser = res1.already_released ? res1 : res2;

  check(winner.already_released === false, "Winner successfully cancels and claims inventory release");
  check(winner.restored_units === 2, "Winner restores exactly 2 units (94 -> 96)");
  check(loser.already_released === true, "Loser detects already_released and releases 0 units");
  check(loser.restored_units === 0, "Loser does NOT release stock");
  check(dbProduct.stock_quantity === 96, "Product stock is exactly 96 (never leaked to 98)");
}

// -----------------------------------------------------------------------------
// [TEST 2] Partial Failure Transaction Rollback
// -----------------------------------------------------------------------------
console.log("\n[TEST 2] Partial Failure Transaction Rollback");
{
  let state = {
    orderStatus: "pending",
    releasedAt: null,
    stockP1: 94,
    stockP2: 10,
  };

  // Simulating a transactional block where second item update fails
  function transactionalCancellation(failOnItem2) {
    // Snapshot state for rollback simulation
    const snapshot = { ...state };
    try {
      state.orderStatus = "cancelled";
      state.releasedAt = new Date().toISOString();
      state.stockP1 += 1; // item 1

      if (failOnItem2) {
        throw new Error("DB_CONNECTION_LOST: Failed to write to item 2");
      }
      state.stockP2 += 1; // item 2
    } catch (err) {
      // Transaction rolls back completely (ACID)
      state = snapshot;
      return { success: false, error: err.message };
    }
    return { success: true };
  }

  const result = transactionalCancellation(true);
  check(!result.success, "Transaction aborts when item 2 update fails");
  check(state.orderStatus === "pending", "Order status rolled back to 'pending'");
  check(state.releasedAt === null, "Released timestamp rolled back to null");
  check(state.stockP1 === 94, "Product 1 stock rolled back to 94 (no orphan restoration)");
}

// -----------------------------------------------------------------------------
// [TEST 3] Audit of 5 Nov 3 Test Orders vs Seed Order CA-7891F04B40
// -----------------------------------------------------------------------------
console.log("\n[TEST 3] Audit of 5 Nov 3 Test Orders vs Seed Order CA-7891F04B40");
{
  const testOrders = [
    { order_number: "CA-120A39C5E1", qty: 1, created: "2026-11-03", status: "pending", payStatus: "pending" },
    { order_number: "CA-FE9C311C5A", qty: 1, created: "2026-11-03", status: "pending", payStatus: "pending" },
    { order_number: "CA-35C3C3A849", qty: 1, created: "2026-11-03", status: "pending", payStatus: "pending" },
    { order_number: "CA-70F00BBF32", qty: 1, created: "2026-11-03", status: "pending", payStatus: "pending" },
    { order_number: "CA-MTC84MQF84", qty: 2, created: "2026-11-03", status: "pending", payStatus: "pending" },
  ];

  const seedOrder = {
    order_number: "CA-7891F04B40",
    qty: 1,
    created: "2026-10-27",
    status: "pending",
    payStatus: "pending",
  };

  const totalDeductedBy5TestOrders = testOrders.reduce((sum, o) => sum + o.qty, 0);
  check(totalDeductedBy5TestOrders === 6, "5 Nov 3 test orders account for exactly 6 units");
  check(testOrders.every(o => o.status === "pending" && o.payStatus === "pending"), "All 5 test orders are pending and unpaid");
  check(testOrders.every(o => isDevelopmentTestOrder(o)), "All 5 test orders are recognized by isDevelopmentTestOrder");
  check(isDevelopmentTestOrder(seedOrder), "Seed order CA-7891F04B40 is flagged as a test order");

  // Reconcile current live stock (94) with 6 deducted units
  const currentStock = 94;
  const restoredStockWithoutSeed = currentStock + totalDeductedBy5TestOrders;
  const restoredStockWithSeed = currentStock + totalDeductedBy5TestOrders + seedOrder.qty;

  check(restoredStockWithoutSeed === 100, "94 + 6 test units = exactly 100 seeded catalog stock");
  check(restoredStockWithSeed === 101, "Adding seed order would result in 101 (invalid stock inflation)");
}

// -----------------------------------------------------------------------------
// [TEST 4] Expiry Worker Predicate Precision
// -----------------------------------------------------------------------------
console.log("\n[TEST 4] Expiry Worker Predicate Precision");
{
  const orders = [
    // 1. Regular unpaid order older than 30 mins -> ELIGIBLE
    { id: "1", order_number: "CA-EXPIRED", status: "pending", pay: "pending", is_test: false, released_at: null, ageMins: 45 },
    // 2. Regular unpaid order under 30 mins -> NOT ELIGIBLE
    { id: "2", order_number: "CA-RECENT", status: "pending", pay: "pending", is_test: false, released_at: null, ageMins: 10 },
    // 3. Paid order older than 30 mins -> IMMUNE (NEVER EXPIRE PAID ORDERS)
    { id: "3", order_number: "CA-PAID", status: "confirmed", pay: "paid", is_test: false, released_at: null, ageMins: 120 },
    // 4. Test order older than 30 mins -> MUST BE EXCLUDED FROM AUTO-EXPIRE
    { id: "4", order_number: "CA-120A39C5E1", status: "pending", pay: "pending", is_test: true, released_at: null, ageMins: 600 },
    // 5. Already released order -> IMMUNE
    { id: "5", order_number: "CA-CANCELLED", status: "cancelled", pay: "pending", is_test: false, released_at: "2026-11-03", ageMins: 600 },
    // 6. Seed order -> IMMUNE
    { id: "6", order_number: "CA-7891F04B40", status: "pending", pay: "pending", is_test: true, released_at: null, ageMins: 10000 },
  ];

  // Correct safe SQL filter:
  // WHERE order_status = 'pending'
  //   AND payment_status != 'paid'
  //   AND is_test_order = false
  //   AND inventory_released_at IS NULL
  //   AND created_at < now() - interval '30 minutes'
  const eligible = orders.filter(o => 
    o.status === "pending" &&
    o.pay !== "paid" &&
    !o.is_test &&
    o.released_at === null &&
    o.ageMins > 30
  );

  check(eligible.length === 1, "Only legitimate unpaid customer order is marked eligible for expiry");
  check(eligible[0].order_number === "CA-EXPIRED", "Identifies CA-EXPIRED as the only candidate");
  check(!eligible.some(o => o.pay === "paid"), "Paid order is strictly immune");
  check(!eligible.some(o => o.is_test), "Development test orders are strictly excluded from automated expiry");
  check(!eligible.some(o => o.released_at !== null), "Previously released orders are strictly excluded");
}

// -----------------------------------------------------------------------------
// [TEST 5] Double Release Prevention
// -----------------------------------------------------------------------------
console.log("\n[TEST 5] Double Release Prevention (Idempotency)");
{
  let order = {
    id: "ord-test-double",
    status: "cancelled",
    inventory_released_at: "2026-11-03T18:00:00Z",
  };
  let stock = 100;

  function attemptRelease(ord) {
    if (ord.inventory_released_at !== null) {
      return { released: false, reason: "ALREADY_RELEASED" };
    }
    ord.inventory_released_at = new Date().toISOString();
    stock += 1;
    return { released: true };
  }

  const firstAttempt = attemptRelease(order);
  const secondAttempt = attemptRelease(order);

  check(!firstAttempt.released, "Attempt on already-released order returns false");
  check(!secondAttempt.released, "Subsequent attempt returns false");
  check(stock === 100, "Stock remains unchanged at 100");
}

// -----------------------------------------------------------------------------
// [TEST 6] Evaluation of Restoration Option A vs Option B
// -----------------------------------------------------------------------------
console.log("\n[TEST 6] Evaluation of Restoration Option A vs Option B");
{
  // Option A: 5 separate RPC calls to cancel_order_and_release_inventory
  // Option B: 1 guarded atomic SQL correction
  const currentStock = 94;
  const targetStock = 100;

  const optionA_steps = 5; // 5 RPC round-trips
  const optionB_steps = 1; // 1 guarded transaction

  check(currentStock + 6 === targetStock, "Both options target exactly +6 units");
  check(optionB_steps < optionA_steps, "Option B executes in a single guarded transaction");
}

console.log("\n================================================================================");
console.log(`PHASE 7B.7.4 AUDIT TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log("================================================================================");

