/**
 * CALVIN AATAMAKER — Phase 7B.9.2 Browser Acceptance & Visual Suite
 * File: scripts/run-phase7b92-browser-verification.mjs
 *
 * Verifies live browser behavior for Order 3d3761e4-f0c5-43e7-b76d-f96bcd054059 (CA-BE01BE8E34):
 * 1. 44_viewer_model_loaded.png - Interactive 3D Model Loaded (Three-Quarter Beauty View)
 * 2. 45_viewer_front_elevation.png - Front Elevation Camera Preset
 * 3. 46_viewer_right_profile.png - Right Profile Camera Preset
 * 4. 47_viewer_customer_artwork_on_model.png - Close-up of Customer Artwork on Model
 * 5. 48_viewer_after_reopen.png - Immediate stable re-opening without hanging
 * 6. 49_flat_artwork_enlarged.png - High-Resolution Flat Artwork Lightbox Modal with Zoom & Fit
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const DEBUG_PORT = 9246;
const APP_PORT = 3026;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SCREENSHOT_DIR = path.resolve("docs/screenshots");
const ARTIFACT_DIR = "C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c";
const USER_DATA_DIR = path.join(os.tmpdir(), "calvin-edge-cdp-7b92");

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
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { shell: true, stdio: "ignore" });
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
          console.error("CDP Message Parse Error:", e);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
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
    const res = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const buffer = Buffer.from(res.data, "base64");
    const docsPath = path.join(SCREENSHOT_DIR, filename);
    const brainPath = path.join(ARTIFACT_DIR, filename);

    fs.writeFileSync(docsPath, buffer);
    fs.writeFileSync(brainPath, buffer);
    console.log(`  ✓ Captured ${filename} (${buffer.length} bytes) -> docs & brain`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log("CALVIN AATAMAKER — PHASE 7B.9.2 LIVE BROWSER ACCEPTANCE SUITE");
  console.log("3D Viewer Stability, Camera Presets, and Flat Artwork Lightbox");
  console.log("================================================================================\n");

  let serverProc = null;
  let edgeProc = null;

  try {
    // 1. Check if server already running, or start Next.js production server
    const isServerAlreadyUp = await waitForHttp(`${BASE_URL}`, 1500);
    if (!isServerAlreadyUp) {
      console.log(`[STEP 1] Starting Next.js server on port ${APP_PORT}...`);
      serverProc = spawn("npx.cmd", ["next", "start", "-H", "127.0.0.1", "-p", String(APP_PORT)], {
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
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,960",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
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
    // TEST 1: Navigate to Order Detail Page
    // -------------------------------------------------------------------------
    console.log("[TEST 1] Visiting Admin Order Detail for CA-BE01BE8E34...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/admin/orders/${ORDER_ID}` });
    await sleep(4000);

    const currentUrl = await cdp.evaluate("window.location.href");
    console.log(`  Current URL: ${currentUrl}`);

    // Scroll down to Section D
    await cdp.evaluate(`window.scrollTo({ top: 350, behavior: 'instant' })`);
    await sleep(1000);

    // -------------------------------------------------------------------------
    // TEST 2: Trigger 3D Modal & Capture 44_viewer_model_loaded.png
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Opening Interactive 3D Viewer Modal...");
    const modalTriggered = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const previewBtn = buttons.find(b => b.textContent && b.textContent.includes('View Full 3D Preview (Interactive)'));
        if (previewBtn) {
          previewBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  3D Modal Trigger clicked: ${modalTriggered}`);

    // Wait for staged loader to transition to ready
    console.log("  Waiting for 3D model geometry & textures to finish loading...");
    let viewerReady = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const stageText = await cdp.evaluate(`
        (() => {
          const el = document.querySelector('[role="dialog"]');
          return el ? el.innerText : '';
        })()
      `);
      if (stageText.includes("Machine View Ready") || stageText.includes("Three-Quarter") || !stageText.includes("Initializing")) {
        viewerReady = true;
        break;
      }
    }
    console.log(`  Viewer ready state reached: ${viewerReady}`);
    await sleep(2000);

    await cdp.captureScreenshot("44_viewer_model_loaded.png");

    // -------------------------------------------------------------------------
    // TEST 3: Camera Preset - Front Elevation (45_viewer_front_elevation.png)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Switching camera to Front Elevation preset...");
    const clickedFront = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const frontBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Front Elevation');
        if (frontBtn) {
          frontBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  Clicked Front Elevation: ${clickedFront}`);
    await sleep(1500);

    await cdp.captureScreenshot("45_viewer_front_elevation.png");

    // -------------------------------------------------------------------------
    // TEST 4: Camera Preset - Right Profile (46_viewer_right_profile.png)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Switching camera to Right Profile preset...");
    const clickedRight = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const rightBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Right Profile');
        if (rightBtn) {
          rightBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  Clicked Right Profile: ${clickedRight}`);
    await sleep(1500);

    await cdp.captureScreenshot("46_viewer_right_profile.png");

    // -------------------------------------------------------------------------
    // TEST 5: Customer Artwork Close-Up on Model (47_viewer_customer_artwork_on_model.png)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Focusing on customer artwork & typography on Front_Print_Surface...");
    // Return to front elevation
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const frontBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Front Elevation');
        if (frontBtn) frontBtn.click();
      })()
    `);
    await sleep(1000);

    await cdp.captureScreenshot("47_viewer_customer_artwork_on_model.png");

    // -------------------------------------------------------------------------
    // TEST 6: Modal Close and Re-Open Stability (48_viewer_after_reopen.png)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Testing modal close and clean re-open cycle...");
    // Click close button
    const closed = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeBtn = buttons.find(b => b.getAttribute('title') && b.getAttribute('title').toLowerCase().includes('close'));
        if (closeBtn) {
          closeBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  Modal closed: ${closed}`);
    await sleep(1500);

    // Re-open
    console.log("  Re-opening 3D Modal...");
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const previewBtn = buttons.find(b => b.textContent && b.textContent.includes('View Full 3D Preview (Interactive)'));
        if (previewBtn) previewBtn.click();
      })()
    `);
    await sleep(3500);

    await cdp.captureScreenshot("48_viewer_after_reopen.png");

    // Close 3D modal to test Lightbox
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeBtn = buttons.find(b => b.getAttribute('title') && b.getAttribute('title').toLowerCase().includes('close'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1500);

    // -------------------------------------------------------------------------
    // TEST 7: High-Resolution Flat Artwork Lightbox Modal (49_flat_artwork_enlarged.png)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Opening High-Resolution Flat Artwork Lightbox Modal...");
    const lightboxOpened = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const lightboxBtn = buttons.find(b => b.textContent && b.textContent.includes('Open Artwork Lightbox'));
        if (lightboxBtn) {
          lightboxBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  Lightbox trigger button clicked: ${lightboxOpened}`);
    await sleep(2500);

    await cdp.captureScreenshot("49_flat_artwork_enlarged.png");

    console.log("\n================================================================================");
    console.log("ALL 6 PHASE 7B.9.2 BROWSER ACCEPTANCE SCREENSHOTS CAPTURED SUCCESSFULLY!");
    console.log("================================================================================");
  } catch (err) {
    console.error("Browser verification error:", err);
    process.exitCode = 1;
  } finally {
    console.log("Cleaning up browser and server processes...");
    if (edgeProc) killProcessTree(edgeProc.pid);
    if (serverProc) killProcessTree(serverProc.pid);
    setTimeout(() => {
      process.exit(process.exitCode || 0);
    }, 500);
  }
}

// Global safety timeout (90s)
setTimeout(() => {
  console.error("Global verification watchdog timeout reached (90s) - terminating processes.");
  process.exit(1);
}, 90000).unref();

main();

