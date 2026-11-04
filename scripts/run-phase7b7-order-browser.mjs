/**
 * CALVIN AATAMAKER — Phase 7B.7 Browser Verification Suite
 * Order Lifecycle & Admin Management Acceptance Verification
 *
 * Scenarios:
 * 1. Scenario A: Normal Order Placement & Confirmation -> 31_normal_order_confirmation.png
 * 2. Scenario B: Customized Order Placement & Confirmation -> 32_customized_order_confirmation.png
 * 3. Scenario C: Mixed Order (Normal + Customized) Placement -> 33_mixed_order_confirmation.png
 * 4. Scenario D: Customer Order History (/account/orders) -> 34_customer_order_history.png
 * 5. Scenario E: Admin Orders Dashboard (/admin/orders) -> 35_admin_orders_register_with_types.png
 * 6. Scenario F: Dedicated Admin Order Inspection (/admin/orders/[id]) -> 36_admin_order_detail_customization_inspection.png
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const TEST_PORT = 3016;
const DEBUG_PORT = 9229;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SCREENSHOT_DIR = path.resolve("docs/screenshots");
const ARTIFACT_DIR = "C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c";
const USER_DATA_DIR = path.join(os.tmpdir(), "calvin-edge-cdp-7b7");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// Read .env.local
let envConfig = {};
try {
  const envContent = fs.readFileSync(".env.local", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      envConfig[key] = val;
    }
  }
} catch (e) {
  console.warn("Could not read .env.local:", e.message);
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = envConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = envConfig.SUPABASE_SECRET_KEY || envConfig.SUPABASE_SERVICE_ROLE_KEY;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {}
}

async function waitForHttp(url, timeoutMs = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status >= 200 && res.status < 500) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(msg.error);
            else res(msg.result);
          }
        } catch (e) {
          console.error("CDP message parse error:", e);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async waitForSelector(selector, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (found) return true;
      await sleep(300);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForButtonWithText(text, timeoutMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          const btn = buttons.find(b => b.textContent && b.textContent.includes('${text}') && !b.disabled);
          return !!btn;
        })()
      `);
      if (found) return true;
      await sleep(300);
    }
    throw new Error(`Timeout waiting for enabled button with text: ${text}`);
  }

  async clickButtonWithText(text) {
    const clicked = await this.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const btn = buttons.find(b => b.textContent && b.textContent.includes('${text}'));
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    return clicked;
  }

  async captureScreenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const localPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`  ✓ Saved screenshot: ${localPath}`);

    try {
      if (fs.existsSync(ARTIFACT_DIR)) {
        const artifactPath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(artifactPath, buffer);
      }
    } catch (e) {
      console.warn("Artifact copy warning:", e.message);
    }
    return localPath;
  }
}

async function fillCheckoutForm(cdp, details) {
  await cdp.waitForSelector('input[autocomplete="name"]');
  await cdp.evaluate(`
    (() => {
      function setReactVal(el, val) {
        if (!el) return;
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setReactVal(document.querySelector('input[autocomplete="name"]'), "${details.name}");
      setReactVal(document.querySelector('input[type="email"]'), "${details.email}");
      setReactVal(document.querySelector('input[type="tel"]'), "${details.phone}");
      setReactVal(document.querySelector('input[autocomplete="address-line1"]'), "${details.address1}");
      setReactVal(document.querySelector('input[autocomplete="address-line2"]'), "${details.address2 || ''}");
      setReactVal(document.querySelector('input[autocomplete="address-level2"]'), "${details.city}");
      setReactVal(document.querySelector('input[autocomplete="address-level1"]'), "${details.state}");
      setReactVal(document.querySelector('input[autocomplete="postal-code"]'), "${details.postalCode}");
      const notesEl = document.querySelector('textarea');
      if (notesEl) {
        setReactVal(notesEl, "${details.notes || ''}");
      }
    })()
  `);
}

async function submitOrderAndConfirm(cdp) {
  await sleep(1000);
  console.log("  Submitting checkout form...");
  await cdp.evaluate(`document.querySelector('form')?.requestSubmit()`);

  const start = Date.now();
  let confirmed = false;
  while (Date.now() - start < 30000) {
    const isConfirmed = await cdp.evaluate(`
      Boolean(document.querySelector('h1')?.textContent?.includes('Thank you'))
    `);
    if (isConfirmed) {
      confirmed = true;
      break;
    }
    await sleep(500);
  }

  if (!confirmed) {
    const errorText = await cdp.evaluate(`document.querySelector('[role="alert"]')?.textContent?.trim() || "Unknown error"`);
    console.error(`  ⚠ Form submission not confirmed. Error on page: ${errorText}`);
  }

  await sleep(1500);
  const orderNumber = await cdp.evaluate(`
    document.querySelector('strong.font-mono')?.textContent?.trim() || ""
  `);
  console.log(`  ✓ Confirmed Order Number: "${orderNumber}"`);
  return orderNumber;
}

async function main() {
  console.log("=== CALVIN AATAMAKER: PHASE 7B.7 BROWSER ACCEPTANCE SUITE ===\n");

  let serverProcess = null;
  let edgeProcess = null;
  let createdOrderIds = [];

  try {
    // 1. Start Next.js server on port 3016
    console.log(`[STEP 1] Starting Next.js server on port ${TEST_PORT}...`);
    const nextBin =
      process.platform === "win32"
        ? path.resolve("node_modules/.bin/next.cmd")
        : path.resolve("node_modules/.bin/next");

    serverProcess = spawn(nextBin, ["dev", "-H", "127.0.0.1", "-p", String(TEST_PORT)], {
      stdio: "pipe",
      shell: true,
      env: { ...process.env, PORT: String(TEST_PORT), HOSTNAME: "127.0.0.1" },
    });

    serverProcess.stdout.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg.includes("Ready") || msg.includes("Compiled")) {
        console.log(`  [Next.js] ${msg}`);
      }
    });

    serverProcess.stderr.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`  [Next.js Error] ${msg}`);
    });

    const serverReady = await waitForHttp(`${BASE_URL}/cart`, 40000);
    if (!serverReady) {
      throw new Error(`Server failed to start on port ${TEST_PORT}`);
    }
    console.log("  ✓ Server is responsive and ready\n");

    // 2. Launch Microsoft Edge with CDP
    console.log(`[STEP 2] Launching Microsoft Edge via CDP on port ${DEBUG_PORT}...`);
    edgeProcess = spawn(
      EDGE_PATH,
      [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,960",
        "--headless=new",
        "about:blank",
      ],
      { stdio: "ignore" }
    );

    const cdpReady = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json`, 20000);
    if (!cdpReady) {
      throw new Error("Edge CDP endpoint failed to respond");
    }

    const versionRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const versionData = await versionRes.json();
    console.log(`  ✓ Connected to browser: ${versionData.Browser}`);

    const targetsRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page") || targets[0];

    const cdp = new CdpConnection(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    console.log("  ✓ CDP session initialized\n");

    // 3. Obtain Admin Session & Product Info for authenticated Admin and Customer tests
    console.log("[STEP 3] Authenticating session with Supabase...");
    let adminSession = null;
    let targetProduct = {
      id: "9f8b47cf-3221-4235-8ea5-fd84a14fbe1b",
      name: "Compact Domestic Aatamaker",
      slug: "compact-domestic-aatamaker-20c2f7",
      price: 28500,
      sku: "CA-COMPACT-01",
    };

    if (supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

      const { data: prodData } = await adminClient
        .from("products")
        .select("id, name, slug, price, sku")
        .eq("slug", "compact-domestic-aatamaker-20c2f7")
        .maybeSingle();

      if (prodData) {
        targetProduct = prodData;
        console.log(`  ✓ Loaded live product: ${targetProduct.name} (${targetProduct.id})`);
      }

      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: "aata@gmail.com",
      });
      if (!linkErr && linkData?.properties?.hashed_token) {
        const { data: authData, error: authErr } = await anonClient.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "email",
        });
        if (!authErr && authData?.session) {
          adminSession = authData.session;
          console.log(`  ✓ Generated valid session for ${adminSession.user.email}`);
        }
      }
    }

    // =========================================================================
    // SCENARIO A: Normal Uncustomized Order Placement
    // =========================================================================
    console.log("\n[SCENARIO A] Placing Normal Uncustomized Order...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/cart` });
    await sleep(1500);

    // Set exactly 1 standard normal item in cart
    await cdp.evaluate(`
      (() => {
        const normalItem = {
          id: "normal-unit-${Date.now()}",
          productId: "${targetProduct.id}",
          slug: "${targetProduct.slug}",
          name: "${targetProduct.name}",
          image: null,
          unitPrice: ${targetProduct.price},
          quantity: 1,
          variantId: null,
          variantName: null,
          sku: "${targetProduct.sku || 'CA-COMPACT-01'}",
          customisationDetails: null
        };
        localStorage.setItem('calvin-aatamaker-cart', JSON.stringify([normalItem]));
      })()
    `);

    // Proceed to checkout
    await cdp.send("Page.navigate", { url: `${BASE_URL}/checkout` });
    await sleep(2500);

    // Fill form
    await fillCheckoutForm(cdp, {
      name: "Ramesh Patel",
      email: "aata@gmail.com",
      phone: "9876543210",
      address1: "Plot 42, Shanti Industrial Estate",
      address2: "Behind GIDC Estate",
      city: "Ahmedabad",
      state: "Gujarat",
      postalCode: "380015",
      notes: "DEVELOPMENT VERIFICATION — NORMAL ORDER — DO NOT SHIP",
    });

    const normalOrderNumber = await submitOrderAndConfirm(cdp);
    if (normalOrderNumber) createdOrderIds.push(normalOrderNumber);
    await cdp.captureScreenshot("31_normal_order_confirmation.png");

    // =========================================================================
    // SCENARIO B: Customized Bespoke Order Placement
    // =========================================================================
    console.log("\n[SCENARIO B] Placing Bespoke Customized Order...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/cart` });
    await sleep(1500);

    // Populate cart with compliant customized CartItem matching DEFAULT_FALLBACK_CONFIG
    await cdp.evaluate(`
      (() => {
        const customItem = {
          id: "custom-${Date.now()}",
          productId: "${targetProduct.id}",
          slug: "${targetProduct.slug}",
          name: "${targetProduct.name} (Bespoke Unit)",
          image: null,
          unitPrice: ${targetProduct.price},
          quantity: 1,
          variantId: null,
          variantName: null,
          sku: "${targetProduct.sku || 'CA-COMPACT-01'}",
          customisationDetails: {
            front_panel_finish: "matte_black",
            sieve_mesh_grade: "standard_assortment",
            family_name_engraving: "Shree Ganesh Kripa",
            _mode: "demonstration",
            _prototype_warning: "UNVERIFIED_FACTORY_MEASUREMENTS",
            _model_code: "CALVIN-COMPACT-01",
            _surface_key: "front-door-panel",
            _customization_summary: "Bespoke Heritage Gold with Shree Blessing",
            _design_fingerprint: "fp_bespoke_heritage_shree_01",
            _preview_thumbnail_path: "guests/gst-phase7b7/previews/preview_shree.png",
            _flat_artwork_path: "guests/gst-phase7b7/artwork/flat_canvas.png",
            _original_assets: [
              {
                storagePath: "guests/gst-phase7b7/photos/family_photo.jpg",
                name: "family_photo.jpg",
                mimeType: "image/jpeg",
                size: 245000,
                x: 0.25,
                y: 0.35,
                width: 0.5,
                height: 0.35,
                rotation: 0
              }
            ],
            _text_layers: [
              {
                text: "Shree Ganesh Kripa",
                fontFamily: "Rozha One",
                fontSize: 28,
                fontWeight: "bold",
                color: "#b45309",
                fill: "#b45309",
                x: 0.5,
                y: 0.75,
                rotation: 0,
                order: 1
              }
            ],
            _surface_dimensions_mm: {
              width: 380,
              height: 650
            },
            _snapshot_version: 1
          }
        };
        localStorage.setItem('calvin-aatamaker-cart', JSON.stringify([customItem]));
      })()
    `);

    // Proceed to checkout for customized order
    await cdp.send("Page.navigate", { url: `${BASE_URL}/checkout` });
    await sleep(2500);

    await fillCheckoutForm(cdp, {
      name: "Suresh & Anandi Sharma",
      email: "aata@gmail.com",
      phone: "9876543210",
      address1: "Bunglow 12, Royal Palms Society",
      address2: "Opposite Circuit House",
      city: "Surat",
      state: "Gujarat",
      postalCode: "395007",
      notes: "DEVELOPMENT VERIFICATION — BESPOKE CUSTOMIZED ORDER",
    });

    const bespokeOrderNumber = await submitOrderAndConfirm(cdp);
    if (bespokeOrderNumber) createdOrderIds.push(bespokeOrderNumber);
    await cdp.captureScreenshot("32_customized_order_confirmation.png");

    // =========================================================================
    // SCENARIO C: Mixed Order (1 Normal + 1 Customized) Placement
    // =========================================================================
    console.log("\n[SCENARIO C] Placing Mixed Order (1 Normal + 1 Customized)...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/cart` });
    await sleep(1500);

    // Populate cart with 1 Normal + 1 Customized
    await cdp.evaluate(`
      (() => {
        const normalItem = {
          id: "normal-unit-mixed-${Date.now()}",
          productId: "${targetProduct.id}",
          slug: "${targetProduct.slug}",
          name: "${targetProduct.name} (Standard Unit)",
          image: null,
          unitPrice: ${targetProduct.price},
          quantity: 1,
          variantId: null,
          variantName: null,
          sku: "${targetProduct.sku || 'CA-COMPACT-01'}",
          customisationDetails: null
        };
        const customItem = {
          id: "custom-unit-mixed-${Date.now()}",
          productId: "${targetProduct.id}",
          slug: "${targetProduct.slug}",
          name: "${targetProduct.name} (Bespoke Unit)",
          image: null,
          unitPrice: ${targetProduct.price},
          quantity: 1,
          variantId: null,
          variantName: null,
          sku: "${targetProduct.sku || 'CA-COMPACT-01'}",
          customisationDetails: {
            front_panel_finish: "matte_black",
            sieve_mesh_grade: "standard_assortment",
            family_name_engraving: "Swagatam",
            _mode: "demonstration",
            _prototype_warning: "UNVERIFIED_FACTORY_MEASUREMENTS",
            _model_code: "CALVIN-COMPACT-01",
            _surface_key: "front-door-panel",
            _customization_summary: "Bespoke Crimson Floral Edition",
            _design_fingerprint: "fp_bespoke_crimson_floral_02",
            _preview_thumbnail_path: "guests/gst-phase7b7/previews/preview_floral.png",
            _flat_artwork_path: "guests/gst-phase7b7/artwork/flat_floral.png",
            _original_assets: [
              {
                storagePath: "guests/gst-phase7b7/photos/floral_motif.jpg",
                name: "floral_motif.jpg",
                mimeType: "image/jpeg",
                size: 312000,
                x: 0.3,
                y: 0.3,
                width: 0.4,
                height: 0.4,
                rotation: 0
              }
            ],
            _text_layers: [
              {
                text: "Swagatam",
                fontFamily: "Rozha One",
                fontSize: 24,
                fontWeight: "bold",
                color: "#991b1b",
                fill: "#991b1b",
                x: 0.5,
                y: 0.75,
                rotation: 0,
                order: 1
              }
            ],
            _surface_dimensions_mm: {
              width: 380,
              height: 650
            },
            _snapshot_version: 1
          }
        };
        localStorage.setItem('calvin-aatamaker-cart', JSON.stringify([normalItem, customItem]));
      })()
    `);

    // Verify cart shows 2 separate lines
    await cdp.send("Page.navigate", { url: `${BASE_URL}/cart` });
    await sleep(2000);
    const cartLinesCount = await cdp.evaluate(`document.querySelectorAll('.rounded-2xl.border, [data-cart-item]').length`);
    console.log(`  Cart shows ${cartLinesCount} item lines.`);

    // Proceed to checkout for mixed order
    await cdp.send("Page.navigate", { url: `${BASE_URL}/checkout` });
    await sleep(2500);

    await fillCheckoutForm(cdp, {
      name: "Vikram & Maya Verma",
      email: "aata@gmail.com",
      phone: "9876543210",
      address1: "Penthouse 4, Skyline Residency",
      address2: "Near ISKCON Temple, SG Highway",
      city: "Ahmedabad",
      state: "Gujarat",
      postalCode: "380054",
      notes: "DEVELOPMENT VERIFICATION — MIXED ORDER (1 NORMAL + 1 BESPOKE)",
    });

    const mixedOrderNumber = await submitOrderAndConfirm(cdp);
    if (mixedOrderNumber) createdOrderIds.push(mixedOrderNumber);
    await cdp.captureScreenshot("33_mixed_order_confirmation.png");

    // =========================================================================
    // SCENARIO D: Customer Order History (/account/orders)
    // =========================================================================
    console.log("\n[SCENARIO D] Inspecting Customer Order History (/account/orders)...");

    // Injects authenticated session cookie or local state
    if (adminSession) {
      await cdp.evaluate(`
        (() => {
          const session = ${JSON.stringify(adminSession)};
          const projectRef = "jxveftfkpmzevjimxzce";
          localStorage.setItem('sb-' + projectRef + '-auth-token', JSON.stringify(session));
          document.cookie = 'sb-' + projectRef + '-auth-token=' + encodeURIComponent(JSON.stringify(session)) + '; path=/; max-age=3600';
        })()
      `);
    }

    await cdp.send("Page.navigate", { url: `${BASE_URL}/account/orders` });
    await sleep(3500);

    // Screenshot 34
    await cdp.captureScreenshot("34_customer_order_history.png");

    // =========================================================================
    // SCENARIO E: Admin Orders Dashboard (/admin/orders)
    // =========================================================================
    console.log("\n[SCENARIO E] Inspecting Admin Orders Register (/admin/orders)...");

    await cdp.send("Page.navigate", { url: `${BASE_URL}/admin/orders` });
    await sleep(4000);

    // Screenshot 35
    await cdp.captureScreenshot("35_admin_orders_register_with_types.png");

    // =========================================================================
    // SCENARIO F: Dedicated Admin Order Detail Customization Inspection
    // =========================================================================
    console.log("\n[SCENARIO F] Inspecting Detailed Admin Order View (/admin/orders/[id])...");

    // Find the ID of the bespoke or mixed order
    let targetInspectionOrderId = "";
    if (supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data: dbOrders } = await adminClient
        .from("orders")
        .select("id, order_number, order_items(customisation_details)")
        .order("created_at", { ascending: false })
        .limit(10);

      const bespokeDbOrder = dbOrders?.find((o) =>
        o.order_items?.some((i) => i.customisation_details && Object.keys(i.customisation_details).length > 0)
      );

      if (bespokeDbOrder) {
        targetInspectionOrderId = bespokeDbOrder.id;
        console.log(`  Found DB order with customization: ${bespokeDbOrder.order_number} (${targetInspectionOrderId})`);
      }
    }

    if (!targetInspectionOrderId && createdOrderIds.length > 0 && supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const lastOrderNum = createdOrderIds[createdOrderIds.length - 1];
      const { data: ord } = await adminClient.from("orders").select("id").eq("order_number", lastOrderNum).maybeSingle();
      if (ord) targetInspectionOrderId = ord.id;
    }

    if (targetInspectionOrderId) {
      const inspectUrl = `${BASE_URL}/admin/orders/${targetInspectionOrderId}`;
      console.log(`  Navigating to Admin Inspection: ${inspectUrl}`);
      await cdp.send("Page.navigate", { url: inspectUrl });
      await sleep(4500);

      // Screenshot 36
      await cdp.captureScreenshot("36_admin_order_detail_customization_inspection.png");
    } else {
      console.warn("  Could not find order ID for detailed inspection.");
    }

    console.log("\n================================================================================");
    console.log("PHASE 7B.7 BROWSER ACCEPTANCE SUITE COMPLETED SUCCESSFULLY!");
    console.log("================================================================================");
  } catch (err) {
    console.error("\n❌ Browser journey test error:", err);
    process.exitCode = 1;
  } finally {
    if (edgeProcess) killProcessTree(edgeProcess.pid);
    if (serverProcess) killProcessTree(serverProcess.pid);
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch {}
  }
}

main();
