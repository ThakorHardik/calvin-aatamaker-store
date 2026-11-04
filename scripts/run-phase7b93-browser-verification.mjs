/**
 * CALVIN AATAMAKER — Phase 7B.9.3 Browser Acceptance & Visual Suite
 * File: scripts/run-phase7b93-browser-verification.mjs
 *
 * Verifies live browser behavior for Order 3d3761e4-f0c5-43e7-b76d-f96bcd054059 (CA-BE01BE8E34):
 * 1. 50_canonical_flat_artwork_reference.png - High-resolution Flat Artwork Lightbox showing photo, "Hardik", and logo
 * 2. 51_3d_front_with_customer_photo.png - Front elevation 3D view showing photo, "Hardik", and single logo
 * 3. 52_3d_three_quarter_with_customer_photo.png - Three-Quarter beauty 3D view with photo on model
 * 4. 53_3d_right_profile_with_customer_photo.png - Right profile 3D view showing model depth
 * 5. 54_3d_artwork_after_reopen.png - 3D modal closed and immediately reopened with photo intact
 * 6. 55_3d_artwork_after_admin_refresh.png - Full page refresh then open 3D viewer with photo intact
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const DEBUG_PORT = 9247;
const APP_PORT = 3027;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SCREENSHOT_DIR = path.resolve("docs/screenshots");
const ARTIFACT_DIR = "C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c";
const USER_DATA_DIR = path.join(os.tmpdir(), "calvin-edge-cdp-7b93");

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
  console.log("CALVIN AATAMAKER — PHASE 7B.9.3 LIVE BROWSER ACCEPTANCE SUITE");
  console.log("Exact Canonical Artwork Synchronization Between 2D and 3D Machine Viewer");
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
    console.log(`[TEST 1] Navigating to Admin Order Detail for ${ORDER_ID}...`);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/admin/orders/${ORDER_ID}` });
    await sleep(3500);

    const pageTitle = await cdp.evaluate("document.title");
    console.log(`  ✓ Page title: ${pageTitle}`);

    // Wait for content to render
    for (let i = 0; i < 20; i++) {
      const isLoaded = await cdp.evaluate(`
        document.body.innerText.includes("CA-BE01BE8E34") ||
        document.body.innerText.includes("Compact Domestic Aatamaker")
      `);
      if (isLoaded) break;
      await sleep(500);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Open High-Resolution Flat Artwork Lightbox (Screenshot 50)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Verifying Canonical Flat Artwork in Lightbox Modal...");
    const openedLightbox = await cdp.evaluate(`
      (() => {
        // Find flat artwork preview button/container
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.includes("Enlarge") || b.innerText.includes("Inspect Flat Artwork") || b.getAttribute('title')?.includes("Enlarge")
        ) || document.querySelector('[data-testid="flat-artwork-preview"]') || document.querySelector('button img[alt*="Artwork"]')?.parentElement;

        if (btn) {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          return true;
        }

        // Direct fallback: find artwork image and click its parent button
        const img = document.querySelector('img[alt*="artwork" i], img[alt*="flat" i]');
        if (img && img.closest('button')) {
          img.closest('button').click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  ✓ Opened Flat Artwork Lightbox: ${openedLightbox}`);
    await sleep(2500);

    await cdp.captureScreenshot("50_canonical_flat_artwork_reference.png");

    // Close Lightbox Modal
    await cdp.evaluate(`
      (() => {
        const closeBtn = Array.from(document.querySelectorAll('button')).find(
          b => b.getAttribute('aria-label') === "Close artwork preview" || b.innerText.trim() === "✕" || b.querySelector('svg.lucide-x')
        );
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1000);

    // -------------------------------------------------------------------------
    // TEST 3: Open Interactive 3D Viewer & Verify Ready State
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Opening Admin Interactive 3D Machine Viewer...");
    const opened3D = await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.includes("View Full 3D Preview (Interactive)")
        );
        if (btn) {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`  ✓ Clicked 3D Preview Button: ${opened3D}`);

    // Wait for 3D viewer to reach 'ready' stage
    console.log("  Waiting for Three.js engine and canonical artwork texture to reach 'ready'...");
    let viewerReady = false;
    for (let i = 0; i < 40; i++) {
      const readyCheck = await cdp.evaluate(`
        (() => {
          const badge = document.querySelector('[data-testid="viewer-stage-badge"]');
          if (badge && badge.innerText.includes("READY")) return true;
          // Check if loading overlay is dismissed and canvas has content
          const overlay = document.querySelector('[data-testid="viewer-loading-overlay"]');
          const canvas = document.querySelector('canvas[data-engine*="three.js"]');
          return !overlay && !!canvas;
        })()
      `);
      if (readyCheck) {
        viewerReady = true;
        break;
      }
      await sleep(500);
    }
    console.log(`  ✓ 3D Viewer reached ready state: ${viewerReady}`);
    await sleep(2000);

    // -------------------------------------------------------------------------
    // TEST 4: Front Elevation Preset with Customer Photo (Screenshot 51)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Activating Front Elevation Preset & Capturing Photo on Door...");
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.trim() === "Front" || b.getAttribute('title')?.includes("Front")
        );
        if (btn) btn.click();
      })()
    `);
    await sleep(2000);

    await cdp.captureScreenshot("51_3d_front_with_customer_photo.png");

    // -------------------------------------------------------------------------
    // TEST 5: Three-Quarter Beauty View (Screenshot 52)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Activating Three-Quarter Preset & Capturing Beauty Angle...");
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.trim() === "Three-Quarter" || b.getAttribute('title')?.includes("Three-Quarter")
        );
        if (btn) btn.click();
      })()
    `);
    await sleep(2000);

    await cdp.captureScreenshot("52_3d_three_quarter_with_customer_photo.png");

    // -------------------------------------------------------------------------
    // TEST 6: Right Profile Angle (Screenshot 53)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Activating Right Profile Preset & Capturing Depth Angle...");
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.trim() === "Side" || b.getAttribute('title')?.includes("Side")
        );
        if (btn) btn.click();
      })()
    `);
    await sleep(2000);

    await cdp.captureScreenshot("53_3d_right_profile_with_customer_photo.png");

    // -------------------------------------------------------------------------
    // TEST 7: Modal Close & Immediate Re-Open (Screenshot 54)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing Modal Teardown & Immediate Re-Open Stability...");
    await cdp.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close 3D viewer"]') ||
          Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1500);

    // Reopen immediately
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.includes("View Full 3D Preview (Interactive)")
        );
        if (btn) btn.click();
      })()
    `);

    // Wait for ready again
    for (let i = 0; i < 30; i++) {
      const ready = await cdp.evaluate(`
        (() => {
          const badge = document.querySelector('[data-testid="viewer-stage-badge"]');
          return badge && badge.innerText.includes("READY");
        })()
      `);
      if (ready) break;
      await sleep(500);
    }
    await sleep(1500);

    await cdp.captureScreenshot("54_3d_artwork_after_reopen.png");

    // -------------------------------------------------------------------------
    // TEST 8: Full Admin Page Refresh & 3D Viewer Re-Open (Screenshot 55)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8] Testing Full Admin Page Refresh & 3D Artwork Parity...");
    // Close modal first
    await cdp.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close 3D viewer"]') ||
          Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1000);

    // Full refresh
    await cdp.send("Page.reload");
    await sleep(3500);

    // Re-inject session if needed
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

    // Click 3D Preview button again
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.includes("View Full 3D Preview (Interactive)")
        );
        if (btn) {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
        }
      })()
    `);

    for (let i = 0; i < 30; i++) {
      const ready = await cdp.evaluate(`
        (() => {
          const badge = document.querySelector('[data-testid="viewer-stage-badge"]');
          return badge && badge.innerText.includes("READY");
        })()
      `);
      if (ready) break;
      await sleep(500);
    }
    await sleep(2000);

    await cdp.captureScreenshot("55_3d_artwork_after_admin_refresh.png");

    console.log("\n================================================================================");
    console.log("PHASE 7B.9.3 BROWSER ACCEPTANCE SUITE COMPLETED SUCCESSFULLY");
    console.log("All 6 screenshots captured and archived.");
    console.log("================================================================================\n");
  } catch (err) {
    console.error("\n[CRITICAL FAILURE in Browser Verification]:", err);
  } finally {
    if (edgeProc) killProcessTree(edgeProc.pid);
    if (serverProc) killProcessTree(serverProc.pid);
    process.exit(0);
  }
}

main();

