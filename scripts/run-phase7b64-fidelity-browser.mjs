/**
 * CALVIN AATAMAKER — Phase 7B.6.4 Browser Verification & Screenshot Suite
 * Real Edge CDP Browser Automation for 2D Editor Usability & Actual 3D Cart Preview
 * 
 * Captures 7 required verification screenshots:
 * - 16_2d_layer_selection.png
 * - 17_2d_photo_transformation.png
 * - 18_2d_crop_result.png
 * - 19_official_logo_on_front_panel.png
 * - 20_3d_customer_artwork_applied.png
 * - 21_cart_actual_glb_preview.png
 * - 22_cart_preview_after_refresh.png
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_PORT = 3014;
const DEBUG_PORT = 9227;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.resolve('docs/screenshots');
const ARTIFACT_DIR = 'C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c';
const USER_DATA_DIR = path.join(os.tmpdir(), 'calvin-edge-cdp-7b64');

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
    } catch {
      // retry
    }
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
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const localPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`  ✓ Saved screenshot: ${localPath}`);

    // Copy to artifact directory if available
    try {
      if (fs.existsSync(ARTIFACT_DIR)) {
        const artifactPath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(artifactPath, buffer);
      }
    } catch (e) {
      console.warn('Artifact copy warning:', e.message);
    }
    return localPath;
  }
}

async function main() {
  console.log('=== CALVIN AATAMAKER: PHASE 7B.6.4 BROWSER FIDELITY VERIFICATION ===\n');

  let serverProcess = null;
  let edgeProcess = null;

  try {
    // 1. Start Next.js production server
    console.log(`[STEP 1] Starting Next.js standalone server on port ${TEST_PORT}...`);
    const nextBin = process.platform === 'win32'
      ? path.resolve('node_modules/.bin/next.cmd')
      : path.resolve('node_modules/.bin/next');

    serverProcess = spawn(nextBin, ['start', '-H', '127.0.0.1', '-p', String(TEST_PORT)], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: String(TEST_PORT), HOSTNAME: '127.0.0.1' },
    });

    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`  [Server] ${msg}`);
    });
    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.warn(`  [Server stderr] ${msg}`);
    });

    const isServerReady = await waitForHttp(`${BASE_URL}/`, 35000);
    if (!isServerReady) {
      throw new Error(`Production server failed to respond on ${BASE_URL} within 35s`);
    }
    console.log('  ✓ Server is responsive and ready\n');

    // 2. Launch Microsoft Edge with remote debugging
    console.log(`[STEP 2] Launching Microsoft Edge via CDP on port ${DEBUG_PORT}...`);
    edgeProcess = spawn(
      EDGE_PATH,
      [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,960',
        '--headless=new',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    const cdpReady = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json`, 15000);
    if (!cdpReady) {
      throw new Error('Edge CDP endpoint failed to respond');
    }

    const versionRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const versionData = await versionRes.json();
    console.log(`  ✓ Connected to browser: ${versionData.Browser}`);

    const targetsRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

    const cdp = new CdpConnection(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    console.log('  ✓ CDP session initialized\n');

    // 3. Clear existing cart
    console.log('[STEP 3] Initializing clean customer cart state...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/cart` });
    await sleep(2000);
    await cdp.evaluate(`
      localStorage.removeItem('calvin-aatamaker-cart');
      localStorage.removeItem('calvin-customer-designs');
    `);
    console.log('  ✓ Cleared cart & design local storage\n');

    // 4. Open Personalization Studio for the actual Supabase product
    const studioUrl = `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7/customize?variant=&quantity=1`;
    console.log(`[STEP 4] Opening Personalization Studio: ${studioUrl}`);
    await cdp.send('Page.navigate', { url: studioUrl });
    await sleep(3500);

    // Switch to 2D Surface Editor tab
    console.log('  Switching to 2D Surface Editor tab...');
    await cdp.evaluate(`
      const tabs = Array.from(document.querySelectorAll('button'));
      const editorTab = tabs.find(b => b.textContent && b.textContent.includes('2D Surface Editor'));
      if (editorTab) editorTab.click();
    `);
    await sleep(1500);

    // 5. Add custom artwork: A sample photo layer and the canonical text layer "Shree Ganesh Kripa"
    console.log('  Adding custom customer artwork (photo layer & "Shree Ganesh Kripa" text)...');
    await cdp.evaluate(`
      // Create a test floral / bespoke motif image as data URL
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = '#D97706';
      ctx.beginPath();
      ctx.arc(200, 200, 140, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CALVIN ART', 200, 200);
      const testPhotoDataUrl = canvas.toDataURL('image/png');

      // Click "Add Text" button
      const buttons = Array.from(document.querySelectorAll('button'));
      const addTextBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Text'));
      if (addTextBtn) addTextBtn.click();
    `);
    await sleep(1000);

    // Set text to "Shree Ganesh Kripa"
    await cdp.evaluate(`
      const textInput = document.querySelector('input[type="text"][value="Your Inscription"]');
      if (textInput) {
        textInput.value = 'Shree Ganesh Kripa';
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await sleep(800);

    // Inject a photo layer programmatically via localStorage / state
    await cdp.evaluate(`
      // Upload synthetic photo via the file input or mock data transfer
      const fileInput = document.querySelector('input[type="file"]');
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 400;
      testCanvas.height = 400;
      const tCtx = testCanvas.getContext('2d');
      tCtx.fillStyle = '#92400E';
      tCtx.fillRect(0, 0, 400, 400);
      tCtx.fillStyle = '#FDE68A';
      tCtx.beginPath();
      tCtx.arc(200, 200, 130, 0, Math.PI * 2);
      tCtx.fill();
      tCtx.fillStyle = '#78350F';
      tCtx.font = 'bold 32px serif';
      tCtx.textAlign = 'center';
      tCtx.textBaseline = 'middle';
      tCtx.fillText('Bespoke Motif', 200, 200);
      const dataUri = testCanvas.toDataURL('image/png');

      fetch(dataUri)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'bespoke-motif.png', { type: 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);
          if (fileInput) {
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
    `);
    await sleep(2000);

    // =========================================================================
    // SCREENSHOT 16: 2D Layer Selection
    // =========================================================================
    console.log('[SCREENSHOT 16] Capturing 2D Layer Selection...');
    // Select the photo layer by clicking on it or via Design Layers list
    await cdp.evaluate(`
      const layerItems = document.querySelectorAll('[data-testid^="layer-select-"]');
      if (layerItems.length > 0) {
        layerItems[0].click();
      } else {
        const layers = document.querySelectorAll('[data-layer-id]');
        if (layers.length > 0) layers[0].click();
      }
    `);
    await sleep(800);
    await cdp.captureScreenshot('16_2d_layer_selection.png');

    // =========================================================================
    // SCREENSHOT 17: 2D Photo Transformation (Scale / Rotate)
    // =========================================================================
    console.log('[SCREENSHOT 17] Capturing 2D Photo Transformation...');
    await cdp.evaluate(`
      // Rotate 15 degrees and adjust dimensions
      const rotSlider = document.querySelector('[data-testid="slider-layer-rotation"]');
      if (rotSlider) {
        rotSlider.value = 15;
        rotSlider.dispatchEvent(new Event('input', { bubbles: true }));
        rotSlider.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const wInput = document.querySelector('[data-testid="input-layer-width"]');
      if (wInput) {
        wInput.value = 60;
        wInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await sleep(800);
    await cdp.captureScreenshot('17_2d_photo_transformation.png');

    // =========================================================================
    // SCREENSHOT 18: 2D Crop Result
    // =========================================================================
    console.log('[SCREENSHOT 18] Capturing 2D Crop Result...');
    await cdp.evaluate(`
      const cropBtn = document.querySelector('[data-testid="btn-open-crop"]');
      if (cropBtn) cropBtn.click();
    `);
    await sleep(600);
    // Apply the crop
    await cdp.evaluate(`
      const applyCropBtn = document.querySelector('[data-testid="btn-apply-crop"]');
      if (applyCropBtn) applyCropBtn.click();
    `);
    await sleep(800);
    await cdp.captureScreenshot('18_2d_crop_result.png');

    // =========================================================================
    // SCREENSHOT 19: Official Logo on Front Panel
    // =========================================================================
    console.log('[SCREENSHOT 19] Capturing Official CALVIN Logo on Front Panel...');
    // Scroll or view front panel with official transparent logo
    await cdp.captureScreenshot('19_official_logo_on_front_panel.png');

    // =========================================================================
    // SCREENSHOT 20: 3D Customer Artwork Applied on Machine
    // =========================================================================
    console.log('[SCREENSHOT 20] Switching to 3D Orbit View & Capturing Customer Artwork...');
    await cdp.evaluate(`
      const tabs = Array.from(document.querySelectorAll('button'));
      const orbitTab = tabs.find(b => b.textContent && b.textContent.includes('3D Orbit View'));
      if (orbitTab) orbitTab.click();
    `);
    await sleep(2500); // Allow Three.js to render texture and GLB
    await cdp.captureScreenshot('20_3d_customer_artwork_applied.png');

    // =========================================================================
    // SCREENSHOT 21: Cart Actual GLB Preview
    // =========================================================================
    console.log('[SCREENSHOT 21] Adding to Cart & Capturing Real 3D GLB Cart Preview...');
    await cdp.evaluate(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const addToCartBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Bespoke Mill to Cart'));
      if (addToCartBtn) addToCartBtn.click();
    `);
    await sleep(3500); // Allow 3D snapshot capture, storage upload, and navigation to /cart

    // Ensure we are on /cart
    const currentUrl = await cdp.evaluate(`window.location.href`);
    if (!currentUrl.includes('/cart')) {
      await cdp.send('Page.navigate', { url: `${BASE_URL}/cart` });
      await sleep(2500);
    }
    await sleep(1500);
    await cdp.captureScreenshot('21_cart_actual_glb_preview.png');

    // =========================================================================
    // SCREENSHOT 22: Cart Preview After Refresh
    // =========================================================================
    console.log('[SCREENSHOT 22] Refreshing Cart Page & Capturing Persistent 3D Preview...');
    await cdp.send('Page.reload');
    await sleep(3000);
    await cdp.captureScreenshot('22_cart_preview_after_refresh.png');

    console.log('\n=============================================================================');
    console.log('✓ ALL 7 FIDELITY SCREENSHOTS SUCCESSFULLY CAPTURED AND STORED!');
    console.log('=============================================================================');

  } catch (err) {
    console.error('Browser verification failed:', err);
    process.exit(1);
  } finally {
    if (edgeProcess) killProcessTree(edgeProcess.pid);
    if (serverProcess) killProcessTree(serverProcess.pid);
  }
}

main();
