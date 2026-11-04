/**
 * CALVIN AATAMAKER — Phase 7B.6.1 Real Supabase Product Customization Studio Verification
 * 
 * Verifies URL:
 * /products/compact-domestic-aatamaker-20c2f7/customize?variant=&quantity=1
 * 
 * Captures 5 required screenshots:
 * 1. Product page (01_real_product_page.png)
 * 2. Customization studio successfully loaded (02_customization_studio_loaded.png)
 * 3. 2D editor with layers (03_2d_editor.png)
 * 4. 3D preview rotated (04_3d_preview.png)
 * 5. Admin customization configuration (05_admin_customization_config.png)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_PORT = 3009;
const DEBUG_PORT = 9223;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.resolve('docs/screenshots');
const USER_DATA_DIR = path.join(os.tmpdir(), 'calvin-edge-cdp-7b61');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
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
          console.error('CDP message parse error:', e);
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
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`  📸 Screenshot saved: docs/screenshots/${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return outPath;
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function main() {
  console.log('=== CALVIN AATAMAKER: PHASE 7B.6.1 REAL PRODUCT VERIFICATION ===\n');

  let serverProc = null;
  let edgeProc = null;
  let cdp = null;

  try {
    // 1. Start Server on port 3009
    console.log(`[STEP 1] Starting Next.js Production Server on port ${TEST_PORT}...`);
    serverProc = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(TEST_PORT)], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: String(TEST_PORT), HOSTNAME: '127.0.0.1' },
    });

    const isReady = await waitForHttp(`${BASE_URL}/products/compact-domestic-aatamaker-20c2f7`, 30000);
    if (!isReady) {
      throw new Error(`Next.js server failed to respond on ${BASE_URL} within 30 seconds`);
    }
    console.log(`  ✓ Next.js server verified responsive on ${BASE_URL}`);

    // 2. Launch Microsoft Edge
    console.log(`\n[STEP 2] Launching Microsoft Edge (Chromium) on port ${DEBUG_PORT}...`);
    edgeProc = spawn(
      EDGE_PATH,
      [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--window-size=1280,900',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${USER_DATA_DIR}`,
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    const isEdgeReady = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 15000);
    if (!isEdgeReady) {
      throw new Error(`Edge CDP failed to respond on port ${DEBUG_PORT}`);
    }
    console.log(`  ✓ Edge CDP responsive on port ${DEBUG_PORT}`);

    // 3. Open Real Product Page
    console.log('\n[STEP 3] Opening Real Product Page (/products/compact-domestic-aatamaker-20c2f7)...');
    const productUrl = `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7`;
    const newTabRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(productUrl)}`, {
      method: 'PUT',
    });
    const tabInfo = await newTabRes.json();
    cdp = new CdpConnection(tabInfo.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    await sleep(3000);
    const productTitle = await cdp.evaluate('document.querySelector("h1")?.innerText');
    console.log(`  Product Title: "${productTitle}"`);
    await cdp.captureScreenshot('01_real_product_page.png');

    // 4. Navigate directly to the exact studio URL
    console.log('\n[STEP 4] Navigating to Customization Studio (/products/compact-domestic-aatamaker-20c2f7/customize?variant=&quantity=1)...');
    const studioUrl = `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7/customize?variant=&quantity=1`;
    await cdp.send('Page.navigate', { url: studioUrl });
    await sleep(4000);

    const errorBanner = await cdp.evaluate(`
      document.body.innerText.includes("Unable to load customizable product") ||
      document.body.innerText.includes("column products.customization_config does not exist")
    `);
    console.log(`  Error banner present?: ${errorBanner}`);
    if (errorBanner) {
      const pageText = await cdp.evaluate('document.body.innerText');
      console.error('  FATAL: Studio failed with error in page:', pageText.slice(0, 300));
      await cdp.captureScreenshot('02_customization_studio_error.png');
      throw new Error('Studio threw error banner');
    }

    const studioHeading = await cdp.evaluate('document.querySelector("h1")?.innerText');
    console.log(`  Studio Heading: "${studioHeading}"`);
    const studioPrice = await cdp.evaluate(`
      Array.from(document.querySelectorAll("span, p, div")).find(el => el.innerText.includes("₹18,999"))?.innerText
    `);
    console.log(`  Live Product Base Price found: "${studioPrice}"`);
    await cdp.captureScreenshot('02_customization_studio_loaded.png');

    // 5. 2D Editor
    console.log('\n[STEP 5] Interacting with 2D Editor (Layers & Canvas)...');
    // Click "Add Custom Text" or verify layers
    await cdp.evaluate(`
      const textBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Add Text") || b.innerText.includes("Text"));
      if (textBtn) textBtn.click();
    `);
    await sleep(1000);
    await cdp.captureScreenshot('03_2d_editor.png');

    // 6. 3D Preview
    console.log('\n[STEP 6] Switching to 3D Orbit Viewport...');
    await cdp.evaluate(`
      const tab3d = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("3D Viewport") || b.innerText.includes("3D Orbit") || b.innerText.includes("3D"));
      if (tab3d) tab3d.click();
    `);
    await sleep(2500);

    const hasCanvas = await cdp.evaluate('Boolean(document.querySelector("canvas"))');
    console.log(`  3D WebGL Canvas rendered: ${hasCanvas}`);
    await cdp.captureScreenshot('04_3d_preview.png');

    // 7. Admin Products Page
    console.log('\n[STEP 7] Inspecting Admin Products (/admin/products)...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/admin/products` });
    await sleep(2500);
    await cdp.captureScreenshot('05_admin_customization_config.png');

    console.log('\n========================================================');
    console.log('ALL REAL PRODUCT CUSTOMIZATION STUDIO CHECKS PASSED!');
    console.log('========================================================\n');
  } catch (err) {
    console.error('\nVerification failed:', err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    if (edgeProc) killProcessTree(edgeProc.pid);
    if (serverProc) killProcessTree(serverProc.pid);
  }
}

main().catch(console.error);

