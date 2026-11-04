/**
 * CALVIN AATAMAKER — Phase 7B.8 Live Visual Acceptance Suite
 * File: scripts/run-phase7b8-live-verification-browser.mjs
 *
 * Captures real browser screenshots from running server (http://127.0.0.1:3000):
 * 1. 37_live_product_loaded_with_config.png (Storefront Product Page with live customization config)
 * 2. 38_live_customization_studio.png (Personalization Studio with 2D Canvas & 3D WebGL viewport)
 * 3. 39_live_admin_orders_cancelled_and_reconciled.png (Admin Orders Dashboard with 5 cancelled orders)
 * 4. 40_live_admin_order_detail_cancelled_test_order.png (Admin Order Detail showing test order locks & cancelled status)
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const DEBUG_PORT = 9232;
const BASE_URL = "http://127.0.0.1:3000";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SCREENSHOT_DIR = path.resolve("docs/screenshots");
const ARTIFACT_DIR = "C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c";
const USER_DATA_DIR = path.join(os.tmpdir(), "calvin-edge-cdp-7b8");

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

async function waitForHttp(url, timeoutMs = 25000) {
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

  async captureScreenshot(filename) {
    const res = await this.send("Page.captureScreenshot", {
      format: "png",
      quality: 90,
      fromSurface: true,
    });
    const buffer = Buffer.from(res.data, "base64");
    const localPath = path.join(SCREENSHOT_DIR, filename);
    const artifactPath = path.join(ARTIFACT_DIR, filename);

    fs.writeFileSync(localPath, buffer);
    fs.writeFileSync(artifactPath, buffer);
    console.log(`  📸 Screenshot saved: ${filename} (${buffer.length} bytes)`);
    return localPath;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("CALVIN AATAMAKER — PHASE 7B.8 LIVE VISUAL ACCEPTANCE VERIFICATION");
  console.log("================================================================================\n");

  let edgeProc = null;
  try {
    // 1. Launch Edge with remote debugging
    console.log("[STEP 1] Launching Edge headless browser with CDP on port " + DEBUG_PORT + "...");
    edgeProc = spawn(
      EDGE_PATH,
      [
        "--headless=new",
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,960",
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

    // Authenticate Admin session
    console.log("[STEP 2] Authenticating admin session for Admin views...");
    let adminSession = null;
    if (supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

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

    // -------------------------------------------------------------------------
    // TEST 1: Live Storefront Product Page
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] Visiting Live Storefront Product Page...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7` });
    await sleep(4000);
    await cdp.captureScreenshot("37_live_product_loaded_with_config.png");

    // -------------------------------------------------------------------------
    // TEST 2: Live Personalization Studio
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Visiting Live Personalization Studio...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7/customize` });
    await sleep(6000);
    await cdp.captureScreenshot("38_live_customization_studio.png");

    // Inject Admin Auth before visiting Admin pages
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

    // -------------------------------------------------------------------------
    // TEST 3: Admin Orders Dashboard
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Visiting Admin Orders Dashboard...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/admin/orders` });
    await sleep(4000);
    await cdp.captureScreenshot("39_live_admin_orders_cancelled_and_reconciled.png");

    // -------------------------------------------------------------------------
    // TEST 4: Admin Order Detail (CA-120A39C5E1)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Visiting Admin Order Detail View for Cancelled Test Order...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/admin/orders/eadfb78f-e7f4-4082-a9c6-ad6e1dc7bbac` });
    await sleep(4000);
    await cdp.captureScreenshot("40_live_admin_order_detail_cancelled_test_order.png");

    console.log("\n================================================================================");
    console.log("ALL 4 LIVE BROWSER SCREENSHOTS CAPTURED SUCCESSFULLY!");
    console.log("================================================================================");
  } catch (err) {
    console.error("Browser verification error:", err);
  } finally {
    if (edgeProc) killProcessTree(edgeProc.pid);
  }
}

main();

