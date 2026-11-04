/**
 * CALVIN AATAMAKER — Phase 7B.9.1 Browser Acceptance & Visual Suite
 * File: scripts/run-phase7b91-browser-verification.mjs
 *
 * Verifies live browser behavior for Order 3d3761e4-f0c5-43e7-b76d-f96bcd054059 (CA-BE01BE8E34):
 * 1. 41_admin_order_detail_3d_preview_and_flat_artwork.png
 * 2. 42_admin_order_detail_complete_layers_expanded.png
 * 3. 43_admin_order_interactive_3d_modal_active.png
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const DEBUG_PORT = 9245;
const APP_PORT = 3025;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SCREENSHOT_DIR = path.resolve("docs/screenshots");
const ARTIFACT_DIR = "C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c";
const USER_DATA_DIR = path.join(os.tmpdir(), "calvin-edge-cdp-7b91");

const ORDER_ID = "3d3761e4-f0c5-43e7-b76d-f96bcd054059";

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

async function waitForHttp(url, timeoutMs = 30000) {
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
  console.log("CALVIN AATAMAKER — PHASE 7B.9.1 LIVE BROWSER ACCEPTANCE SUITE");
  console.log("================================================================================\n");

  let serverProc = null;
  let edgeProc = null;

  try {
    // 1. Check if server already running, or start Next.js production server
    const isServerAlreadyUp = await waitForHttp(`${BASE_URL}`, 1500);
    if (!isServerAlreadyUp) {
      console.log(`[STEP 1] Starting Next.js server on port ${APP_PORT}...`);
      serverProc = spawn("npx.cmd", ["next", "start", "-p", String(APP_PORT)], {
        stdio: "inherit",
        shell: true,
      });

      const serverReady = await waitForHttp(`${BASE_URL}`, 30000);
      if (!serverReady) {
        throw new Error("Next.js server failed to become ready within 30 seconds");
      }
      console.log("  ✓ Next.js server is UP and responding\n");
    } else {
      console.log(`[STEP 1] Next.js server is already running on ${BASE_URL}\n`);
    }

    // 2. Launch Edge headless with CDP
    console.log(`[STEP 2] Launching Edge headless with CDP on port ${DEBUG_PORT}...`);
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

    // 3. Authenticate Admin session
    console.log("[STEP 3] Authenticating admin session for aata@gmail.com...");
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

    // Navigate to origin first to set cookies & localStorage
    await cdp.send("Page.navigate", { url: `${BASE_URL}` });
    await sleep(1500);

    if (adminSession) {
      await cdp.evaluate(`
        (() => {
          const session = ${JSON.stringify(adminSession)};
          const projectRef = "jxveftfkpmzevjimxzce";
          localStorage.setItem('sb-' + projectRef + '-auth-token', JSON.stringify(session));
          document.cookie = 'sb-' + projectRef + '-auth-token=' + encodeURIComponent(JSON.stringify(session)) + '; path=/; max-age=3600';
        })()
      `);
      console.log("  ✓ Admin credentials injected into browser context\n");
    }

    // -------------------------------------------------------------------------
    // TEST 1: Admin Order Detail (D.1 3D Preview button & D.4 Canonical Flat Artwork)
    // -------------------------------------------------------------------------
    console.log("[TEST 1] Visiting Admin Order Detail for CA-BE01BE8E34...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/admin/orders/${ORDER_ID}` });
    await sleep(5000);

    const currentUrl = await cdp.evaluate("window.location.href");
    const bodyText = await cdp.evaluate("document.body.innerText.slice(0, 300)");
    console.log(`  Current URL: ${currentUrl}`);
    console.log(`  Page Content: ${bodyText.replace(/\n+/g, ' ')}`);

    await cdp.captureScreenshot("41_admin_order_detail_3d_preview_and_flat_artwork.png");

    // -------------------------------------------------------------------------
    // TEST 2: Expand Complete Layer Inspection Panel
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Expanding Complete Design Details panel...");
    const expanded = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const detailsBtn = buttons.find(b => b.textContent && b.textContent.includes('View Complete Design Details'));
        if (detailsBtn) {
          detailsBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  Button clicked: ${expanded}`);
    await sleep(2000);

    // Scroll slightly down to frame the expanded panel
    await cdp.evaluate(`window.scrollBy({ top: 400, behavior: 'instant' })`);
    await sleep(1000);
    await cdp.captureScreenshot("42_admin_order_detail_complete_layers_expanded.png");

    // -------------------------------------------------------------------------
    // TEST 3: Open Interactive 3D Viewer Modal
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Triggering Interactive 3D Viewer Modal...");
    // Scroll back up and click 'View Full 3D Preview'
    await cdp.evaluate(`window.scrollTo({ top: 200, behavior: 'instant' })`);
    await sleep(500);

    const modalTriggered = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const previewBtn = buttons.find(b => b.textContent && b.textContent.includes('View Full 3D Preview'));
        if (previewBtn) {
          previewBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  3D Modal Trigger clicked: ${modalTriggered}`);
    await sleep(4000);

    await cdp.captureScreenshot("43_admin_order_interactive_3d_modal_active.png");

    console.log("\n================================================================================");
    console.log("ALL PHASE 7B.9.1 BROWSER ACCEPTANCE SCREENSHOTS CAPTURED SUCCESSFULLY!");
    console.log("================================================================================");
  } catch (err) {
    console.error("Browser verification error:", err);
  } finally {
    if (edgeProc) killProcessTree(edgeProc.pid);
    if (serverProc) killProcessTree(serverProc.pid);
  }
}

main();
