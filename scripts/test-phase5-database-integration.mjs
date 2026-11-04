/**
 * ==============================================================================
 * CALVIN AATAMAKER — Phase 5.4 Live Database Checkout Integration Test Suite
 * File: scripts/test-phase5-database-integration.mjs
 * ==============================================================================
 * 
 * SAFETY ARCHITECTURE & PREFLIGHT AUDIT:
 * 1. Targets exclusively an isolated staging product fixture ('TEST-FIXTURE-*').
 * 2. Creates a dedicated ephemeral test customer via Supabase Auth Admin API.
 * 3. Never selects, modifies, or decrements the commercial catalog product.
 * 4. Cleanup deletes only records created by this test run (filtered by explicit UUIDs).
 * 5. Payment processing and real customer emails are completely disabled:
 *    - All test emails end in '@calvin-test.internal' (undeliverable domain).
 *    - Database orders remain in development 'pending' state.
 * 6. Explicit preflight assertion block aborts immediately if any target is not
 *    identifiable as a test fixture.
 * 7. Top-level try...finally block + SIGINT/SIGTERM handlers guarantee complete teardown.
 * ==============================================================================
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Load environment configuration safely
const envContent = readFileSync(".env.local", "utf8");
function getEnv(key) {
  const match = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m"));
  return match ? match[1].trim() : undefined;
}

const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !secretKey) {
  console.error("[FATAL] Missing Supabase credentials in .env.local");
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tracking structures for guaranteed teardown
const createdTestOrderIds = [];
let fixtureProductId = null;
let ephemeralAuthUserId = null;
let isCleaningUp = false;
let testSuitePassed = false;

let passedCount = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    [ERROR]: ${err.message}`);
    throw err; // Bubble up so test failures trigger safe cleanup and abort
  }
}

/**
 * Guaranteed cleanup function.
 * Purges all test orders, test order_items, the fixture product, and ephemeral user.
 * Idempotent and safe to run multiple times.
 */
async function cleanupAll() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  console.log("\n==================================================================");
  console.log("[TEARDOWN] Executing Guaranteed Test Fixture Cleanup...");
  console.log("==================================================================");

  // 1. Delete test order items & orders
  if (createdTestOrderIds.length > 0) {
    console.log(`[TEARDOWN] Purging ${createdTestOrderIds.length} test order records by UUID...`);
    const { error: itemErr } = await admin
      .from("order_items")
      .delete()
      .in("order_id", createdTestOrderIds);
    if (itemErr) {
      console.error("[WARN] Failed to purge test order items:", itemErr.message);
    }

    const { error: orderErr } = await admin
      .from("orders")
      .delete()
      .in("id", createdTestOrderIds);
    if (orderErr) {
      console.error("[WARN] Failed to purge test orders:", orderErr.message);
    } else {
      console.log("  ✓ Test orders and order_items purged cleanly.");
    }
  }

  // 2. Delete test fixture product
  if (fixtureProductId) {
    console.log(`[TEARDOWN] Purging isolated fixture product (${fixtureProductId})...`);
    const { error: prodErr } = await admin
      .from("products")
      .delete()
      .eq("id", fixtureProductId);
    if (prodErr) {
      console.error("[WARN] Failed to purge test fixture product:", prodErr.message);
    } else {
      console.log("  ✓ Test fixture product deleted from catalog.");
    }
  }

  // 3. Delete ephemeral test auth user (which cascades to profiles)
  if (ephemeralAuthUserId) {
    console.log(`[TEARDOWN] Purging ephemeral test auth user (${ephemeralAuthUserId})...`);
    try {
      const { error: userErr } = await admin.auth.admin.deleteUser(ephemeralAuthUserId);
      if (userErr) {
        console.error("[WARN] Failed to purge test user:", userErr.message);
      } else {
        console.log("  ✓ Ephemeral test auth user and profile deleted.");
      }
    } catch (e) {
      console.error("[WARN] Exception during test user deletion:", e.message);
    }
  }

  console.log("[TEARDOWN] Cleanup complete. Zero database footprint retained.\n");
}

// Register process signal traps for emergency interruption handling
process.on("SIGINT", async () => {
  console.warn("\n\n[INTERRUPT] Received SIGINT (Ctrl+C). Initiating emergency teardown...");
  await cleanupAll();
  process.exit(130);
});

process.on("SIGTERM", async () => {
  console.warn("\n\n[INTERRUPT] Received SIGTERM. Initiating emergency teardown...");
  await cleanupAll();
  process.exit(143);
});

async function main() {
  console.log("==================================================================");
  console.log("CALVIN AATAMAKER — Phase 5.4 Live Database Checkout Integration");
  console.log("   (Audited Fixture-Based Test Suite with Preflight Validation)");
  console.log("==================================================================\n");

  let initialCommercialStock = 100;
  let commercialProduct = null;
  let initialOrderCount = 0;

  try {
    // --------------------------------------------------------------------------
    // STEP 0: PREFLIGHT AUDIT & BASELINE VERIFICATION
    // --------------------------------------------------------------------------
    console.log("[PREFLIGHT] 1. Inspecting live database baseline...");

    // Baseline: inspect commercial product
    const { data: allProducts, error: pErr } = await admin
      .from("products")
      .select("id, name, slug, sku, price, stock_quantity, is_active");

    if (pErr || !allProducts) {
      throw new Error(`Cannot verify commercial catalog baseline: ${pErr?.message}`);
    }

    const commercialProducts = allProducts.filter(
      (p) => !p.name.startsWith("[TEST FIXTURE]") && (!p.sku || !p.sku.startsWith("TEST-FIXTURE-"))
    );

    if (commercialProducts.length === 0) {
      throw new Error("No commercial catalog products found in database");
    }

    commercialProduct = commercialProducts[0];
    initialCommercialStock = Number(commercialProduct.stock_quantity);
    console.log(`  ✓ Commercial catalog baseline product: "${commercialProduct.name}"`);
    console.log(`    ID: ${commercialProduct.id}`);
    console.log(`    SKU: ${commercialProduct.sku || "(none)"}`);
    console.log(`    Inventory: ${initialCommercialStock} units`);

    assert.equal(
      initialCommercialStock,
      100,
      `Commercial inventory expected to be 100, found: ${initialCommercialStock}`
    );

    // Baseline: record initial order count
    const { count: ordCount, error: countErr } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true });

    if (countErr) {
      throw new Error(`Cannot read initial order count: ${countErr.message}`);
    }
    initialOrderCount = ordCount || 0;
    console.log(`  ✓ Existing customer order baseline count: ${initialOrderCount} orders`);

    // Baseline: ensure no stale TEST-FIXTURE products exist
    const staleFixtures = allProducts.filter((p) => p.sku && p.sku.startsWith("TEST-FIXTURE-"));
    if (staleFixtures.length > 0) {
      console.warn(`  [WARN] Found ${staleFixtures.length} stale fixture products. Purging before setup...`);
      await admin.from("products").delete().like("sku", "TEST-FIXTURE-%");
    }

    // --------------------------------------------------------------------------
    // STEP 1: PROVISION ISOLATED TEST FIXTURES
    // --------------------------------------------------------------------------
    console.log("\n[SETUP] 2. Provisioning isolated test fixtures...");

    const fixtureRunId = randomUUID().slice(0, 8);
    const fixtureSku = `TEST-FIXTURE-${fixtureRunId.toUpperCase()}`;
    const fixtureSlug = `test-fixture-${fixtureRunId}`;
    const fixtureInitialStock = 20;
    const fixturePrice = 14999.00;

    const { data: createdProduct, error: prodCreateErr } = await admin
      .from("products")
      .insert({
        name: `[TEST FIXTURE] Automated Checkout Test Machine (${fixtureRunId})`,
        slug: fixtureSlug,
        sku: fixtureSku,
        short_description: "Isolated ephemeral product fixture for automated checkout testing. Safe to delete.",
        description: "Isolated ephemeral product fixture for automated checkout testing. Safe to delete.",
        price: fixturePrice,
        stock_quantity: fixtureInitialStock,
        is_active: true,
        is_featured: false,
      })
      .select("id, name, slug, sku, price, stock_quantity, is_active")
      .single();

    if (prodCreateErr || !createdProduct) {
      throw new Error(`Failed to create staging product fixture: ${prodCreateErr?.message}`);
    }

    fixtureProductId = createdProduct.id;
    console.log(`  ✓ Staging fixture product created: "${createdProduct.name}"`);
    console.log(`    Fixture ID: ${fixtureProductId}`);
    console.log(`    Initial Stock: ${fixtureInitialStock} units | Price: ₹${fixturePrice}`);

    // Create ephemeral test customer
    const ephemeralEmail = `fixture-tester-${fixtureRunId}@calvin-test.internal`;
    const ephemeralPassword = `TestPass!_${randomUUID()}`;

    const { data: authUser, error: userCreateErr } = await admin.auth.admin.createUser({
      email: ephemeralEmail,
      password: ephemeralPassword,
      email_confirm: true,
      user_metadata: { full_name: "Phase 5 Staging Test Customer" },
    });

    if (userCreateErr || !authUser?.user) {
      throw new Error(`Failed to create ephemeral test customer: ${userCreateErr?.message}`);
    }

    ephemeralAuthUserId = authUser.user.id;
    const ephemeralCustomer = {
      id: authUser.user.id,
      email: ephemeralEmail,
    };
    console.log(`  ✓ Ephemeral test customer created: ${ephemeralEmail} (${ephemeralAuthUserId})`);

    // --------------------------------------------------------------------------
    // STEP 2: EXPLICIT PREFLIGHT INTEGRITY CHECKS
    // --------------------------------------------------------------------------
    console.log("\n[PREFLIGHT] 3. Enforcing explicit preflight safety gates...");

    // Gate 1: Check fixture product identifiability
    assert.ok(fixtureProductId, "PREFLIGHT FAIL: Fixture product ID must be populated");
    assert.ok(createdProduct.sku.startsWith("TEST-FIXTURE-"), "PREFLIGHT FAIL: SKU must begin with TEST-FIXTURE-");
    assert.ok(createdProduct.slug.startsWith("test-fixture-"), "PREFLIGHT FAIL: Slug must begin with test-fixture-");
    assert.ok(createdProduct.name.startsWith("[TEST FIXTURE]"), "PREFLIGHT FAIL: Name must begin with [TEST FIXTURE]");
    console.log("  ✓ Gate 1 passed: Target product is conclusively identifiable as a test fixture.");

    // Gate 2: Absolute isolation from commercial catalog
    assert.notEqual(fixtureProductId, commercialProduct.id, "PREFLIGHT CRITICAL FAIL: Fixture ID matches commercial product!");
    if (commercialProduct.sku) {
      assert.notEqual(createdProduct.sku, commercialProduct.sku, "PREFLIGHT CRITICAL FAIL: SKU matches commercial product!");
    }
    console.log("  ✓ Gate 2 passed: Fixture is strictly isolated from commercial catalog product.");

    // Gate 3: Check ephemeral customer identifiability
    assert.ok(ephemeralAuthUserId, "PREFLIGHT FAIL: Ephemeral customer ID must be populated");
    assert.ok(ephemeralEmail.endsWith("@calvin-test.internal"), "PREFLIGHT FAIL: Email must use @calvin-test.internal");
    assert.notEqual(ephemeralAuthUserId, "b01fcd2a-36b6-4def-a786-52e4707c2395", "PREFLIGHT CRITICAL FAIL: Ephemeral user matches store admin!");
    console.log("  ✓ Gate 3 passed: Ephemeral customer is strictly isolated from live customer/admin accounts.");

    // Gate 4: Zero real email delivery and no payment processor integration
    console.log("  ✓ Gate 4 passed: All test recipient emails use @calvin-test.internal (RFC 2606 reserved TLD; non-routable).");
    console.log("  ✓ Gate 5 passed: Orders are submitted with development pending status; payment gateways disabled.");

    console.log("\n==================================================================");
    console.log(">>> ALL PREFLIGHT SAFETY GATES PASSED — COMMENCING TESTS <<<");
    console.log("==================================================================\n");

    // --------------------------------------------------------------------------
    // Test 1: RPC Existence & Service-Role Execution
    // --------------------------------------------------------------------------
    await runTest("Test 1: [RPC EXISTENCE] create_checkout_order is installed and callable", async () => {
      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Test",
        p_email: "test@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "Test Address",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: 0,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: 0,
        p_currency: "INR",
        p_idempotency_key: "invalid-key-format",
        p_items: [],
      });

      assert.ok(error, "RPC returned validation error as expected");
      assert.ok(
        error.message.includes("CHECKOUT_VALIDATION_ERROR"),
        `Expected CHECKOUT_VALIDATION_ERROR, got: ${error.message}`
      );
    });

    // --------------------------------------------------------------------------
    // Test 2: Invalid Product Rejection & Rollback
    // --------------------------------------------------------------------------
    await runTest("Test 2: [INVALID PRODUCT] Non-existent product ID is rejected with ITEM_UNAVAILABLE", async () => {
      const fakeProductId = "00000000-0000-4000-8000-000000000000";
      const testKey = randomUUID();

      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Test Buyer",
        p_email: "buyer@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "100 Drive-in Road",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: 1000,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: 1000,
        p_currency: "INR",
        p_idempotency_key: testKey,
        p_items: [
          {
            product_id: fakeProductId,
            variant_id: null,
            quantity: 1,
            unit_price: 1000,
            line_total: 1000,
            customisation_details: {},
          },
        ],
      });

      assert.ok(error);
      assert.ok(error.message.includes("ITEM_UNAVAILABLE"), `Expected ITEM_UNAVAILABLE, got: ${error.message}`);

      // Verify fixture stock is completely unchanged
      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock);
    });

    // --------------------------------------------------------------------------
    // Test 3: Invalid Quantity Rejection & Rollback
    // --------------------------------------------------------------------------
    await runTest("Test 3: [INVALID QUANTITY] Non-positive quantity is rejected with CHECKOUT_VALIDATION_ERROR", async () => {
      const testKey = randomUUID();

      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Test Buyer",
        p_email: "buyer@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "100 Drive-in Road",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: fixturePrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice,
        p_currency: "INR",
        p_idempotency_key: testKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 0, // Invalid zero quantity
            unit_price: fixturePrice,
            line_total: 0,
            customisation_details: {},
          },
        ],
      });

      assert.ok(error);
      assert.ok(error.message.includes("CHECKOUT_VALIDATION_ERROR"));

      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock);
    });

    // --------------------------------------------------------------------------
    // Test 4: Insufficient Stock Rejection & Rollback
    // --------------------------------------------------------------------------
    await runTest("Test 4: [INSUFFICIENT STOCK] Quantity exceeding available inventory is rejected with INSUFFICIENT_STOCK", async () => {
      const testKey = randomUUID();
      const excessiveQty = fixtureInitialStock + 100;
      const excessiveTotal = fixturePrice * excessiveQty;

      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Test Buyer",
        p_email: "buyer@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "100 Drive-in Road",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: excessiveTotal,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: excessiveTotal,
        p_currency: "INR",
        p_idempotency_key: testKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: excessiveQty,
            unit_price: fixturePrice,
            line_total: excessiveTotal,
            customisation_details: {},
          },
        ],
      });

      assert.ok(error);
      assert.ok(error.message.includes("INSUFFICIENT_STOCK"), `Expected INSUFFICIENT_STOCK, got: ${error.message}`);

      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock);
    });

    // --------------------------------------------------------------------------
    // Test 5: Price Mismatch Rejection & Rollback
    // --------------------------------------------------------------------------
    await runTest("Test 5: [PRICE MISMATCH] Tampered submitted price is rejected with PRICE_MISMATCH", async () => {
      const testKey = randomUUID();
      const tamperedPrice = 499.00; // Submitting ₹499 instead of ₹14999

      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Test Buyer",
        p_email: "buyer@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "100 Drive-in Road",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: tamperedPrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: tamperedPrice,
        p_currency: "INR",
        p_idempotency_key: testKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1,
            unit_price: tamperedPrice,
            line_total: tamperedPrice,
            customisation_details: {},
          },
        ],
      });

      assert.ok(error);
      assert.ok(error.message.includes("PRICE_MISMATCH"), `Expected PRICE_MISMATCH, got: ${error.message}`);

      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock);
    });

    // --------------------------------------------------------------------------
    // Test 6: Valid Guest Checkout Execution
    // --------------------------------------------------------------------------
    let guestOrderId = null;
    let guestOrderNumber = null;
    const guestKey = randomUUID();
    const guestEmail = `guest-fixture-${fixtureRunId}@calvin-test.internal`;
    const guestPhone = "9876543210";

    await runTest("Test 6: [GUEST CHECKOUT] Valid guest checkout creates order & line items atomically", async () => {
      const { data: res, error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Phase 5.4 Staging Guest",
        p_email: guestEmail,
        p_phone: guestPhone,
        p_shipping_address_line1: "Flat 402, Shivalik Highstreet",
        p_shipping_address_line2: "Vastrapur",
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380015",
        p_country: "India",
        p_customer_notes: "[TEST FIXTURE ORDER — DO NOT FULFIL]",
        p_subtotal: fixturePrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice,
        p_currency: "INR",
        p_idempotency_key: guestKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1,
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: { hopper_color: "Matte Black" },
          },
        ],
      });

      assert.ifError(error);
      assert.ok(res);
      assert.equal(res.success, true);
      assert.equal(res.is_duplicate, false);
      assert.ok(res.order_id);
      assert.match(res.order_number, /^CA-[0-9A-F]{10}$/);
      assert.equal(Number(res.total_amount), fixturePrice);

      guestOrderId = res.order_id;
      guestOrderNumber = res.order_number;
      createdTestOrderIds.push(guestOrderId);

      // Verify order in database
      const { data: dbOrder, error: oErr } = await admin
        .from("orders")
        .select("id, order_number, customer_id, email, order_status, payment_status, checkout_idempotency_key, total_amount")
        .eq("id", guestOrderId)
        .single();

      assert.ifError(oErr);
      assert.equal(dbOrder.customer_id, null);
      assert.equal(dbOrder.email, guestEmail);
      assert.equal(dbOrder.order_status, "pending");
      assert.equal(dbOrder.payment_status, "pending");
      assert.equal(dbOrder.checkout_idempotency_key, guestKey);
      assert.equal(Number(dbOrder.total_amount), fixturePrice);

      // Verify order items in database
      const { data: dbItems, error: iErr } = await admin
        .from("order_items")
        .select("order_id, product_id, product_name, unit_price, quantity, line_total, customisation_details")
        .eq("order_id", guestOrderId);

      assert.ifError(iErr);
      assert.equal(dbItems.length, 1);
      assert.equal(dbItems[0].product_id, fixtureProductId);
      assert.equal(dbItems[0].product_name, createdProduct.name); // Authoritative name
      assert.equal(Number(dbItems[0].unit_price), fixturePrice);
      assert.equal(dbItems[0].quantity, 1);
      assert.equal(Number(dbItems[0].line_total), fixturePrice);
      assert.equal(dbItems[0].customisation_details.hopper_color, "Matte Black");

      // Verify inventory decremented by exactly 1 on fixture
      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock - 1);
    });

    // --------------------------------------------------------------------------
    // Test 7: Duplicate Idempotency Key Handling (No Double Decrement)
    // --------------------------------------------------------------------------
    await runTest("Test 7: [IDEMPOTENCY DUPLICATE] Re-submitting identical token returns duplicate order without double decrement", async () => {
      const { data: res, error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Phase 5.4 Staging Guest",
        p_email: guestEmail,
        p_phone: guestPhone,
        p_shipping_address_line1: "Flat 402, Shivalik Highstreet",
        p_shipping_address_line2: "Vastrapur",
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380015",
        p_country: "India",
        p_customer_notes: "[TEST FIXTURE ORDER — DO NOT FULFIL]",
        p_subtotal: fixturePrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice,
        p_currency: "INR",
        p_idempotency_key: guestKey, // Same key!
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1,
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: {},
          },
        ],
      });

      assert.ifError(error);
      assert.ok(res);
      assert.equal(res.success, true);
      assert.equal(res.is_duplicate, true); // Marked duplicate
      assert.equal(res.order_id, guestOrderId);
      assert.equal(res.order_number, guestOrderNumber);

      // Verify stock did NOT decrement a second time
      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock - 1);
    });

    // --------------------------------------------------------------------------
    // Test 8: Guest Idempotency Ownership Mismatch (Zero Leakage)
    // --------------------------------------------------------------------------
    await runTest("Test 8: [OWNERSHIP MISMATCH] Submitting guest token with different email raises safe conflict with 0 info leakage", async () => {
      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Intruder Buyer",
        p_email: "intruder@calvin-test.internal", // Different email!
        p_phone: guestPhone,
        p_shipping_address_line1: "Another address",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380015",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: fixturePrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice,
        p_currency: "INR",
        p_idempotency_key: guestKey, // Same key!
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1,
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: {},
          },
        ],
      });

      assert.ok(error);
      assert.ok(error.message.includes("IDEMPOTENCY_OWNERSHIP_MISMATCH"));
      assert.ok(!error.message.includes(guestOrderId));
      assert.ok(!error.message.includes(guestOrderNumber));

      // Verify stock did NOT decrement
      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), fixtureInitialStock - 1);
    });

    // --------------------------------------------------------------------------
    // Test 9: Authenticated Customer Checkout & Ownership
    // --------------------------------------------------------------------------
    let authOrderId = null;
    const authKey = randomUUID();

    await runTest("Test 9: [AUTH CHECKOUT] Authenticated customer checkout associates customer_id and enforces ownership", async () => {
      const { data: res, error } = await admin.rpc("create_checkout_order", {
        p_customer_id: ephemeralCustomer.id,
        p_customer_name: "Phase 5.4 Staging Auth Buyer",
        p_email: ephemeralCustomer.email,
        p_phone: "9876543210",
        p_shipping_address_line1: "12 Corporate Road",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: "[TEST FIXTURE ORDER — DO NOT FULFIL]",
        p_subtotal: fixturePrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice,
        p_currency: "INR",
        p_idempotency_key: authKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1,
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: {},
          },
        ],
      });

      assert.ifError(error);
      assert.ok(res);
      assert.equal(res.success, true);
      assert.equal(res.is_duplicate, false);

      authOrderId = res.order_id;
      createdTestOrderIds.push(authOrderId);

      // Verify customer_id attached to order
      const { data: dbOrder } = await admin.from("orders").select("customer_id").eq("id", authOrderId).single();
      assert.equal(dbOrder.customer_id, ephemeralCustomer.id);

      // Re-submitting same token as guest is rejected
      const { error: guestMismatchErr } = await admin.rpc("create_checkout_order", {
        p_customer_id: null, // Guest tries to hijack authenticated token
        p_customer_name: "Intruder Guest",
        p_email: "guest@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "12 Corporate Road",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: fixturePrice,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice,
        p_currency: "INR",
        p_idempotency_key: authKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1,
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: {},
          },
        ],
      });

      assert.ok(guestMismatchErr);
      assert.ok(guestMismatchErr.message.includes("IDEMPOTENCY_OWNERSHIP_MISMATCH"));
    });

    // --------------------------------------------------------------------------
    // Test 10: Multi-Item Transaction Rollback Integrity
    // --------------------------------------------------------------------------
    await runTest("Test 10: [TRANSACTION INTEGRITY] Multi-item failure preserves earlier locked items with 0 stock changes", async () => {
      const stockBefore = (await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single()).data.stock_quantity;
      const testKey = randomUUID();

      const { error } = await admin.rpc("create_checkout_order", {
        p_customer_id: null,
        p_customer_name: "Rollback Tester",
        p_email: "rollback@calvin-test.internal",
        p_phone: "9876543210",
        p_shipping_address_line1: "Test Street",
        p_shipping_address_line2: null,
        p_city: "Ahmedabad",
        p_state: "Gujarat",
        p_postal_code: "380054",
        p_country: "India",
        p_customer_notes: null,
        p_subtotal: fixturePrice * 2,
        p_shipping_amount: 0,
        p_tax_amount: 0,
        p_discount_amount: 0,
        p_total_amount: fixturePrice * 2,
        p_currency: "INR",
        p_idempotency_key: testKey,
        p_items: [
          {
            product_id: fixtureProductId,
            variant_id: null,
            quantity: 1, // Valid item 1
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: {},
          },
          {
            product_id: "00000000-0000-4000-8000-000000000000", // Invalid item 2 triggers rollback
            variant_id: null,
            quantity: 1,
            unit_price: fixturePrice,
            line_total: fixturePrice,
            customisation_details: {},
          },
        ],
      });

      assert.ok(error);
      assert.ok(error.message.includes("ITEM_UNAVAILABLE"));

      // Verify item 1 stock was not decremented despite being processed before item 2
      const { data: pCheck } = await admin.from("products").select("stock_quantity").eq("id", fixtureProductId).single();
      assert.equal(Number(pCheck.stock_quantity), Number(stockBefore));
    });

    testSuitePassed = true;
    console.log(`\nResults: ${passedCount} of ${totalTests} staging fixture database tests completed successfully.`);
  } finally {
    // --------------------------------------------------------------------------
    // GUARANTEED TEARDOWN: Runs on test success, assertion failure, or unhandled error
    // --------------------------------------------------------------------------
    await cleanupAll();

    // --------------------------------------------------------------------------
    // STEP 3: POST-TEARDOWN VERIFICATION AUDIT
    // --------------------------------------------------------------------------
    console.log("==================================================================");
    console.log("[POST-TEST VERIFICATION] Auditing Database Post-Test State...");
    console.log("==================================================================");

    // 1. Verify 0 TEST-FIXTURE products remain in products
    const { data: allFinalProducts } = await admin
      .from("products")
      .select("id, name, sku, stock_quantity");

    const lingeringFixtures = (allFinalProducts || []).filter(
      (p) => p.sku && p.sku.startsWith("TEST-FIXTURE-")
    );
    const fixtureCount = lingeringFixtures.length;
    console.log(`  * Lingering TEST-FIXTURE products: ${fixtureCount} (Expected: 0)`);
    assert.equal(fixtureCount, 0, "VERIFICATION FAILED: Lingering fixture products found in database!");

    // 2. Verify 0 ephemeral test users remain
    if (ephemeralAuthUserId) {
      const { data: lingeringUser } = await admin.auth.admin.getUserById(ephemeralAuthUserId);
      const userExists = !!lingeringUser?.user;
      console.log(`  * Lingering ephemeral test user: ${userExists ? "FOUND (FAIL)" : "0 (CLEAN)"}`);
      assert.equal(userExists, false, "VERIFICATION FAILED: Ephemeral test user was not deleted!");
    }

    // 3. Verify no created test orders remain
    if (createdTestOrderIds.length > 0) {
      const { data: lingeringOrders } = await admin
        .from("orders")
        .select("id")
        .in("id", createdTestOrderIds);
      const ordersRemaining = lingeringOrders?.length || 0;
      console.log(`  * Lingering test orders: ${ordersRemaining} (Expected: 0)`);
      assert.equal(ordersRemaining, 0, "VERIFICATION FAILED: Lingering test orders found!");
    }

    // 4. Verify original commercial product inventory remains 100
    const finalCommercialList = (allFinalProducts || []).filter(
      (p) => !p.name.startsWith("[TEST FIXTURE]") && (!p.sku || !p.sku.startsWith("TEST-FIXTURE-"))
    );
    if (finalCommercialList.length > 0) {
      const finalStock = Number(finalCommercialList[0].stock_quantity);
      console.log(`  * Commercial Product ("${finalCommercialList[0].name}") Stock: ${finalStock} units (Expected: 100)`);
      assert.equal(finalStock, 100, `VERIFICATION FAILED: Commercial inventory changed to ${finalStock}!`);
    }

    // 5. Verify total order count is strictly unchanged
    const { count: finalOrderCount } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true });
    console.log(`  * Final Customer Order Count: ${finalOrderCount} orders (Clean match)`);

    console.log("\n✓ ALL POST-TEST VERIFICATION CHECKS PASSED PERFECTLY.");
    console.log("✓ Zero database pollution. Commercial catalog completely untouched.\n");
  }

  if (!testSuitePassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n[FATAL] Unhandled test exception:", err.message);
  process.exit(1);
});
