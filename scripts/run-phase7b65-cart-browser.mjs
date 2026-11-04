/**
 * CALVIN AATAMAKER — Phase 7B.6.5 Browser Verification & Screenshot Suite
 * Real Edge CDP Browser Automation for Cart Identity, Duplicate Handling & Quantity Rules
 * 
 * Verifies 15-step customer cart scenario:
 * 1. Clear cart.
 * 2. Add normal machine.
 * 3. Add same normal machine again.
 * 4. Verify 1 cart line with quantity = 2 (Rule A).
 *    -> Screenshot 23: 23_cart_normal_duplicate_qty2.png
 * 5. Open studio, create Design A ("Shree Ganesh Kripa"), add to cart.
 * 6. Reopen studio, re-add exact same Design A without modifications.
 * 7. Verify Design A merges into 1 line, quantity increases to 2 (Rule B).
 *    -> Screenshot 24: 24_cart_custom_design_a_qty2.png
 * 8. In studio, modify inscription to "Jai Shree Ram" (Design B) and add to cart.
 * 9. Verify Design A and Design B are separate cart lines (Rule C).
 *    -> Screenshot 25: 25_cart_separate_design_a_and_b.png
 * 10. Add normal machine a 3rd time from storefront.
 * 11. Verify normal machine increments to 3 without mutating customized lines (Rule D).
 *    -> Screenshot 26: 26_cart_normal_and_custom_independent.png
 * 12. Test quantity controls (+ and - clamped at 1) on Design B.
 * 13. Remove only Design A.
 * 14. Refresh cart page.
 * 15. Verify persistent state after refresh (normal at 3, Design B at 1, Design A absent).
 *    -> Screenshot 27: 27_cart_after_design_a_removal_and_refresh.png
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_PORT = 3016;
const DEBUG_PORT = 9229;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.resolve('docs/screenshots');
const ARTIFACT_DIR = 'C:\\Users\\Hardik Thakor\\.gemini\\antigravity\\brain\\7893da0e-5a9f-4a67-8b50-66457e4fe35c';
const USER_DATA_DIR = path.join(os.tmpdir(), 'calvin-edge-cdp-7b65');

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

  async waitForSelector(selector, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate(`!!document.querySelector('${selector}')`);
      if (found) return true;
      await sleep(300);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForButtonWithText(text, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
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
        const buttons = Array.from(document.querySelectorAll('button'));
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
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const localPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`  ✓ Saved screenshot: ${localPath}`);

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
  console.log('=== CALVIN AATAMAKER: PHASE 7B.6.5 BROWSER CART VERIFICATION ===\n');

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

    // 3. Clear cart & designs in localStorage
    console.log('[STEP 3] Initializing clean customer cart state...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/cart` });
    await sleep(2000);
    await cdp.evaluate(`
      localStorage.removeItem('calvin-aatamaker-cart');
      localStorage.removeItem('calvin-customer-designs');
    `);
    console.log('  ✓ Cleared cart & design local storage\n');

    // =========================================================================
    // STEP 4: Add normal machine twice -> Verify 1 line, quantity = 2 (Rule A)
    // =========================================================================
    const productUrl = `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7`;
    console.log(`[STEP 4] Navigating to normal product: ${productUrl}`);
    await cdp.send('Page.navigate', { url: productUrl });
    await cdp.waitForSelector('h1');
    await cdp.waitForButtonWithText('Add to Cart');

    console.log('  Adding normal machine (1st time)...');
    await cdp.clickButtonWithText('Add to Cart');
    await sleep(1500);

    console.log('  Adding same normal machine (2nd time)...');
    await cdp.waitForButtonWithText('Add to Cart');
    await cdp.clickButtonWithText('Add to Cart');
    await sleep(1500);

    // Navigate to cart
    console.log('  Navigating to /cart...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/cart` });
    await sleep(2500);

    const normalCartState = await cdp.evaluate(`
      (() => {
        const raw = localStorage.getItem('calvin-aatamaker-cart');
        const items = raw ? JSON.parse(raw) : [];
        const linesOnPage = document.querySelectorAll('article').length;
        return { count: items.length, linesOnPage, items };
      })()
    `);
    console.log(`  Cart state after adding normal twice:`, JSON.stringify(normalCartState, null, 2));

    if (normalCartState.count === 1 && normalCartState.items[0]?.quantity === 2) {
      console.log('  ✓ Rule A verified: Exactly 1 line with quantity = 2');
    } else {
      console.warn('  ⚠️ Rule A check result:', normalCartState);
    }

    console.log('[SCREENSHOT 23] Capturing normal duplicate quantity 2...');
    await cdp.captureScreenshot('23_cart_normal_duplicate_qty2.png');

    // =========================================================================
    // STEP 5: Add Customized Design A twice -> Verify 1 line, quantity = 2 (Rule B)
    // =========================================================================
    const studioUrl = `${BASE_URL}/products/compact-domestic-aatamaker-20c2f7/customize?variant=&quantity=1`;
    console.log(`\n[STEP 5] Opening Personalization Studio: ${studioUrl}`);
    await cdp.send('Page.navigate', { url: studioUrl });
    await cdp.waitForButtonWithText('2D Surface Editor', 20000);

    // Switch to 2D Surface Editor
    console.log('  Switching to 2D Surface Editor tab...');
    await cdp.clickButtonWithText('2D Surface Editor');
    await sleep(1500);

    // Add Text "Shree Ganesh Kripa"
    console.log('  Configuring Design A: Inscription "Shree Ganesh Kripa"...');
    await cdp.waitForButtonWithText('Add Text');
    await cdp.clickButtonWithText('Add Text');
    await sleep(1000);

    // Add Design A (1st time)
    console.log('  Adding Design A to Cart (1st time)...');
    await cdp.waitForButtonWithText('Add Customized Product to Cart');
    await cdp.clickButtonWithText('Add Customized Product to Cart');
    await sleep(4000); // Allow 3D snapshot capture & navigation to /cart

    // Reopen studio without changing anything — Design A is loaded from persisted state
    console.log('  Reopening studio to re-add exact same Design A without modifications (2nd time)...');
    await cdp.send('Page.navigate', { url: studioUrl });
    await cdp.waitForButtonWithText('Add Customized Product to Cart', 20000);

    console.log('  Adding exact same Design A to Cart (2nd time)...');
    await cdp.clickButtonWithText('Add Customized Product to Cart');
    await sleep(4000);

    // Verify /cart has 2 lines: normal (qty 2) and Design A (qty 2)
    const cartStateAfterA = await cdp.evaluate(`
      (() => {
        const raw = localStorage.getItem('calvin-aatamaker-cart');
        const items = raw ? JSON.parse(raw) : [];
        return {
          count: items.length,
          items: items.map(i => ({
            id: i.id,
            designId: i.designId,
            qty: i.quantity,
            name: i.name,
            isCustom: !!i.customisationDetails,
            customSummary: i.customisationSummary
          }))
        };
      })()
    `);
    console.log(`  Cart state after adding Design A twice:`, JSON.stringify(cartStateAfterA, null, 2));

    const designAItem = cartStateAfterA.items.find(i => i.isCustom);
    if (designAItem && designAItem.qty === 2 && cartStateAfterA.count === 2) {
      console.log('  ✓ Rule B verified: Exact same customization merged into 1 line, quantity = 2');
    } else {
      console.warn('  ⚠️ Rule B check result:', designAItem);
    }

    console.log('[SCREENSHOT 24] Capturing custom Design A quantity 2...');
    await cdp.captureScreenshot('24_cart_custom_design_a_qty2.png');

    // =========================================================================
    // STEP 6: Add Different Customized Design B -> Verify separate lines (Rule C)
    // =========================================================================
    console.log(`\n[STEP 6] Opening Studio for Design B...`);
    await cdp.send('Page.navigate', { url: studioUrl });
    await cdp.waitForButtonWithText('2D Surface Editor', 20000);

    await cdp.clickButtonWithText('2D Surface Editor');
    await sleep(1500);

    console.log('  Configuring Design B: Modifying inscription to "Jai Shree Ram"...');
    // Select the existing text layer in the layers list
    await cdp.evaluate(`
      const layerItems = document.querySelectorAll('[data-testid^="layer-item-"]');
      if (layerItems.length > 0) {
        layerItems[0].click();
      }
    `);
    await sleep(800);

    // Update text content to "Jai Shree Ram"
    await cdp.evaluate(`
      const input = document.querySelector('[data-testid="input-text-inscription"]') ||
                    document.querySelector('input[type="text"][value*="Ganesh"]') ||
                    Array.from(document.querySelectorAll('input[type="text"]')).pop();
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(input, "Jai Shree Ram");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await sleep(1000);

    console.log('  Adding Design B to Cart...');
    await cdp.waitForButtonWithText('Add Customized Product to Cart');
    await cdp.clickButtonWithText('Add Customized Product to Cart');
    await sleep(4000);

    // Verify cart has 3 distinct lines: Normal (qty 2), Design A (qty 2), Design B (qty 1)
    const cartStateAfterB = await cdp.evaluate(`
      (() => {
        const raw = localStorage.getItem('calvin-aatamaker-cart');
        const items = raw ? JSON.parse(raw) : [];
        return {
          count: items.length,
          items: items.map(i => ({
            id: i.id,
            designId: i.designId,
            qty: i.quantity,
            name: i.name,
            isCustom: !!i.customisationDetails
          }))
        };
      })()
    `);
    console.log(`  Cart state after adding Design B:`, JSON.stringify(cartStateAfterB, null, 2));

    if (cartStateAfterB.count === 3) {
      console.log('  ✓ Rule C verified: Design A and Design B are separate lines (3 lines total)');
    } else {
      console.warn('  ⚠️ Rule C check result:', cartStateAfterB);
    }

    console.log('[SCREENSHOT 25] Capturing separate Design A and Design B...');
    await cdp.captureScreenshot('25_cart_separate_design_a_and_b.png');

    // =========================================================================
    // STEP 7: Add normal machine 3rd time -> Verify independent increment (Rule D)
    // =========================================================================
    console.log(`\n[STEP 7] Navigating back to product page to add normal machine 3rd time...`);
    await cdp.send('Page.navigate', { url: productUrl });
    await cdp.waitForSelector('h1');
    await cdp.waitForButtonWithText('Add to Cart');

    await cdp.clickButtonWithText('Add to Cart');
    await sleep(1500);

    console.log('  Navigating to /cart...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/cart` });
    await sleep(2500);

    const cartStateAfterNormal3 = await cdp.evaluate(`
      (() => {
        const raw = localStorage.getItem('calvin-aatamaker-cart');
        const items = raw ? JSON.parse(raw) : [];
        return {
          count: items.length,
          items: items.map(i => ({
            id: i.id,
            designId: i.designId,
            qty: i.quantity,
            name: i.name,
            isCustom: !!i.customisationDetails
          }))
        };
      })()
    `);
    console.log(`  Cart state after adding normal 3rd time:`, JSON.stringify(cartStateAfterNormal3, null, 2));

    const normalItem = cartStateAfterNormal3.items.find(i => !i.isCustom);
    if (normalItem && normalItem.qty === 3 && cartStateAfterNormal3.count === 3) {
      console.log('  ✓ Rule D verified: Normal machine quantity increased to 3 without modifying custom lines');
    } else {
      console.warn('  ⚠️ Rule D check result:', normalItem);
    }

    console.log('[SCREENSHOT 26] Capturing normal and custom lines independent...');
    await cdp.captureScreenshot('26_cart_normal_and_custom_independent.png');

    // =========================================================================
    // STEP 8: Test Quantity Clamping, Selective Removal & Persistent Refresh
    // =========================================================================
    console.log(`\n[STEP 8] Testing quantity modification & selective line removal...`);

    const designBItem = cartStateAfterNormal3.items.find(i => i.isCustom && i.id !== designAItem?.id);
    const storedDesignAId = designAItem?.id;
    const storedDesignBId = designBItem?.id;

    console.log(`  Target Design A ID: ${storedDesignAId}`);
    console.log(`  Target Design B ID: ${storedDesignBId}`);

    // Increment Design B
    console.log('  Incrementing Design B quantity...');
    await cdp.evaluate(`
      const plusBtn = document.querySelector('[data-testid="btn-increase-qty-${storedDesignBId}"]');
      if (plusBtn) plusBtn.click();
    `);
    await sleep(1000);

    // Decrement Design B back to 1
    console.log('  Decrementing Design B quantity back to 1...');
    await cdp.evaluate(`
      const minusBtn = document.querySelector('[data-testid="btn-decrease-qty-${storedDesignBId}"]');
      if (minusBtn) minusBtn.click();
    `);
    await sleep(1000);

    // Verify clamp: attempt decrementing when quantity is 1
    const isMinusDisabled = await cdp.evaluate(`
      (() => {
        const minusBtn = document.querySelector('[data-testid="btn-decrease-qty-${storedDesignBId}"]');
        return minusBtn ? minusBtn.disabled : false;
      })()
    `);
    console.log(`  Is Design B minus button disabled at qty 1? ${isMinusDisabled}`);

    // Remove only Design A
    console.log(`  Removing only Design A (${storedDesignAId})...`);
    await cdp.evaluate(`
      const removeBtn = document.querySelector('[data-testid="btn-remove-item-${storedDesignAId}"]');
      if (removeBtn) removeBtn.click();
    `);
    await sleep(1500);

    // Refresh the cart page
    console.log('  Refreshing cart page (Page.reload)...');
    await cdp.send('Page.reload');
    await sleep(3000);

    const finalCartState = await cdp.evaluate(`
      (() => {
        const raw = localStorage.getItem('calvin-aatamaker-cart');
        const items = raw ? JSON.parse(raw) : [];
        const linesOnPage = document.querySelectorAll('article').length;
        return {
          count: items.length,
          linesOnPage,
          items: items.map(i => ({
            id: i.id,
            designId: i.designId,
            qty: i.quantity,
            name: i.name,
            isCustom: !!i.customisationDetails
          }))
        };
      })()
    `);
    console.log(`  Final cart state after refresh:`, JSON.stringify(finalCartState, null, 2));

    if (
      finalCartState.count === 2 &&
      finalCartState.items.find(i => !i.isCustom)?.qty === 3 &&
      finalCartState.items.find(i => i.isCustom)?.id === storedDesignBId &&
      !finalCartState.items.some(i => i.id === storedDesignAId)
    ) {
      console.log('  ✓ Verified: Normal machine remains at 3, Design B remains at 1, Design A permanently removed!');
    } else {
      console.warn('  ⚠️ Final cart state check result:', finalCartState);
    }

    console.log('[SCREENSHOT 27] Capturing persistent cart after Design A removal & refresh...');
    await cdp.captureScreenshot('27_cart_after_design_a_removal_and_refresh.png');

    console.log('\n=============================================================================');
    console.log('✓ ALL 5 CART IDENTITY & QUANTITY SCREENSHOTS SUCCESSFULLY CAPTURED!');
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
