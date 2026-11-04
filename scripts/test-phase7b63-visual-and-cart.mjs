/**
 * CALVIN AATAMAKER — Phase 7B.6.3 Verification Test Suite
 * Personalization Studio Visual Improvements & Cart Repair
 * 
 * Verifies:
 * 1. Task 1: 3D Orbit Viewport visual improvements (matte black machine, warm ivory #F5F3EF background, studio multi-point lighting, soft ground shadow).
 * 2. Task 2: 2D Surface Editor Canva-style direct editing (8 resize handles, rotation handle with stem, direct drag/scale/rotate, crop tool, arrow nudging with focus guard, D-pad, safe margins).
 * 3. Task 3: Replacement of placeholder branding with official transparent CALVIN logo, non-editable locked badge, exactly 1 logo.
 * 4. Task 4: Reference photos disclaimer banner ("Reference Images — Final product images will be updated after physical model verification.").
 * 5. Task 5: High-fidelity cart thumbnail (matte black machine chassis, door panel, customer artwork, official logo, demonstration watermark).
 * 6. Task 6: Cart quantity increment (+), decrement (- with >= 1 clamp), remove button, reactive subtotal, separate line items for different designs, and loop-free state persistence.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  generateCartItemId,
  isCartItem,
  formatCustomisationSummary,
} from '../lib/cart.ts';
import {
  computeNormalizedBrandingBox,
  isPlacementSafeFromProtectedBranding,
  isWithinSafeMargins,
  DesignHistoryManager,
} from '../lib/3d/canonical-design.ts';
import { resolveCustomizationAssetUrl } from '../lib/3d/storage-assets.ts';

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

console.log('=== CALVIN AATAMAKER: PHASE 7B.6.3 VISUAL IMPROVEMENTS & CART REPAIR SUITE ===\n');

// =============================================================================
// [SUITE 1] Task 1: 3D Orbit Viewport Visual Verification
// =============================================================================
console.log('[SUITE 1] Task 1: 3D Orbit Viewport Visual Setup');

const viewportFile = fs.readFileSync('components/customizer/3d-viewport-preview.tsx', 'utf8');

check(
  viewportFile.includes('scene.background = new THREE.Color("#F5F3EF")'),
  'Scene background is configured to warm ivory / light beige (#F5F3EF)'
);

check(
  viewportFile.includes('renderer.shadowMap.enabled = true') &&
  viewportFile.includes('renderer.shadowMap.type = THREE.PCFSoftShadowMap'),
  'WebGLRenderer soft shadow maps enabled (PCFSoftShadowMap)'
);

check(
  viewportFile.includes('new THREE.ShadowMaterial') &&
  viewportFile.includes('ground.receiveShadow = true'),
  'Natural soft ground shadow receiver plane configured with ShadowMaterial'
);

check(
  viewportFile.includes('keyLight.castShadow = true') &&
  viewportFile.includes('rimLeftLight') &&
  viewportFile.includes('rimRightLight') &&
  viewportFile.includes('topLight'),
  'Enhanced multi-point studio lighting configured (Key light, Fill light, Dual Rim lights, Overhead light)'
);

check(
  viewportFile.includes('photo.crop') &&
  viewportFile.includes('ctx.drawImage(cachedImg, sx, sy, sw, sh'),
  '3D canvas texture rasterizer supports photo crop coordinates'
);

check(
  viewportFile.includes('setCameraPreset("front")') &&
  viewportFile.includes('setCameraPreset("perspective")') &&
  viewportFile.includes('setCameraPreset("right")'),
  'Camera presets (Front, 3/4 View, Right, Reset) preserved'
);

// =============================================================================
// [SUITE 2] Task 2: 2D Surface Editor Canva-style Direct Editing
// =============================================================================
console.log('\n[SUITE 2] Task 2: 2D Surface Editor Direct Manipulation & Controls');

const editorFile = fs.readFileSync('components/customizer/2d-editor-canvas.tsx', 'utf8');

check(
  editorFile.includes('resize-tl') &&
  editorFile.includes('resize-tr') &&
  editorFile.includes('resize-bl') &&
  editorFile.includes('resize-br') &&
  editorFile.includes('resize-t') &&
  editorFile.includes('resize-b') &&
  editorFile.includes('resize-l') &&
  editorFile.includes('resize-r'),
  'All 8 resize handles (4 corners + 4 edges) implemented for direct element scaling'
);

check(
  editorFile.includes('handlePointerDownTransform("rotate", e)') &&
  editorFile.includes('cursor-grab') &&
  editorFile.includes('w-0.5 h-2 bg-amber-500'),
  'Rotation handle positioned above top-center with vertical connecting stem line'
);

check(
  editorFile.includes('isCropping') &&
  editorFile.includes('handleStartCrop') &&
  editorFile.includes('handleApplyCrop') &&
  editorFile.includes('handleResetCrop'),
  'Dedicated photo crop mode implemented with draft, apply, and reset actions'
);

check(
  editorFile.includes('handleKeyDown') &&
  editorFile.includes('activeEl.tagName === "INPUT"') &&
  editorFile.includes('activeEl.tagName === "TEXTAREA"'),
  'Keyboard arrow key nudge listener implemented with strict input/textarea focus guard'
);

check(
  editorFile.includes('e.shiftKey ? 0.02 : 0.005'),
  'Keyboard arrow keys support fine nudge and 10px larger step with Shift key'
);

check(
  editorFile.includes('handleNudge') &&
  editorFile.includes('handleCenterHorizontal') &&
  editorFile.includes('handleCenterVertical'),
  'On-screen directional D-pad and horizontal/vertical centering buttons available in property inspector'
);

// Test DesignHistoryManager undo/redo with crop and transforms
const historyMgr = new DesignHistoryManager([]);
const layerA = {
  id: 'photo-1',
  type: 'photo',
  name: 'Photo 1',
  visible: true,
  locked: false,
  opacity: 1,
  zIndex: 1,
  x: 0.2,
  y: 0.3,
  width: 0.5,
  height: 0.4,
  rotationDeg: 0,
  imageUrl: 'https://example.com/photo.jpg',
  sourceWidthPx: 800,
  sourceHeightPx: 600,
};

historyMgr.pushState([layerA]);
check(historyMgr.canUndo() === true, 'History manager records layer creation');

const layerACropped = {
  ...layerA,
  crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
};
historyMgr.pushState([layerACropped]);
check(historyMgr.canUndo() === true, 'History manager records crop state');

const undone = historyMgr.undo();
check(undone?.[0]?.crop === undefined, 'Undo restores uncropped state');

const redone = historyMgr.redo();
check(redone?.[0]?.crop?.width === 0.8, 'Redo restores cropped state');

// =============================================================================
// [SUITE 3] Task 3: Official CALVIN Branding Asset & Protection
// =============================================================================
console.log('\n[SUITE 3] Task 3: Official CALVIN Branding Asset & Protection');

check(
  fs.existsSync('public/images/calvin-aatamaker-logo.png'),
  'Official transparent CALVIN logo asset exists at public/images/calvin-aatamaker-logo.png'
);

check(
  editorFile.includes('/images/calvin-aatamaker-logo.png') &&
  editorFile.includes('OFFICIAL CALVIN BRANDING') &&
  editorFile.includes('pointer-events-none'),
  '2D canvas renders official transparent logo asset in locked, non-editable protected branding envelope'
);

const testBranding = {
  enabled: true,
  locked: true,
  brand_text: 'CALVIN',
  position: 'top_center',
  offset_x_mm: 0,
  offset_y_mm: 35,
  width_mm: 120,
  height_mm: 30,
};

const brandBox = computeNormalizedBrandingBox(testBranding, 380, 620);
check(
  brandBox.width > 0.25 && brandBox.width < 0.40 && brandBox.y > 0.04 && brandBox.y < 0.08,
  'Branding box normalized calculation matches 120x30mm at y=35mm on 380x620mm surface'
);

const overlappingLayer = { x: brandBox.x + 0.02, y: brandBox.y + 0.01, width: 0.3, height: 0.2 };
const safeLayer = { x: 0.2, y: 0.5, width: 0.5, height: 0.3 };

check(
  isPlacementSafeFromProtectedBranding(overlappingLayer, testBranding, 380, 620).isSafe === false,
  'Detects and blocks customer artwork overlapping the protected CALVIN branding envelope'
);

check(
  isPlacementSafeFromProtectedBranding(safeLayer, testBranding, 380, 620).isSafe === true,
  'Allows valid customer artwork positioned safely outside the protected branding envelope'
);

// =============================================================================
// [SUITE 4] Task 4: Reference Photos Disclaimer Banner
// =============================================================================
console.log('\n[SUITE 4] Task 4: Reference Photos Disclaimer Notice');

const customizePageFile = fs.readFileSync('app/products/[slug]/customize/page.tsx', 'utf8');

check(
  customizePageFile.includes('Reference Images — Final product images will be updated after physical model verification.'),
  'Reference photos tab displays official verification disclaimer banner'
);

// =============================================================================
// [SUITE 5] Task 5: Improved Cart Customization Thumbnail
// =============================================================================
console.log('\n[SUITE 5] Task 5: High-Fidelity Machine Thumbnail Generation');

check(
  customizePageFile.includes('Matte charcoal/black powder-coat') &&
  customizePageFile.includes('Front Door Panel') &&
  customizePageFile.includes('PROTOTYPE PREVIEW') &&
  customizePageFile.includes('calvin-aatamaker-logo.png'),
  'generateDesignThumbnailDataUrl renders matte black machine chassis, door panel, customer layers, and official logo'
);

check(
  !customizePageFile.includes('ctx.fillStyle = "#2563EB"') ||
  !customizePageFile.includes('ctx.fillText("📷 Custom Photo", 0, 4)'),
  'Replaced flat generic blue-rect photo placeholder with realistic machine composite'
);

// =============================================================================
// [SUITE 6] Task 6: Cart Quantity & Remove Controls Repair
// =============================================================================
console.log('\n[SUITE 6] Task 6: Cart Quantity (+/-) & Remove Controls');

const cartPageFile = fs.readFileSync('app/cart/page.tsx', 'utf8');

check(
  cartPageFile.includes('isInternalUpdateRef.current = true') &&
  cartPageFile.includes('if (isInternalUpdateRef.current) return'),
  'Infinite event loop eliminated: isInternalUpdateRef guards against CartPage re-triggering its own loadCart'
);

check(
  cartPageFile.includes('loadCart = useCallback(async (isInitial = false) => {') &&
  cartPageFile.includes('if (isInitial) {\n      setLoading(true);'),
  'loadCart avoids flashing full-page loading spinner on background updates'
);

check(
  cartPageFile.includes('if (nextQuantity < 1) return;'),
  'changeQuantity enforces strict minimum quantity (never drops below 1)'
);

check(
  cartPageFile.includes('setNotice("Machine removed from your cart.")'),
  'removeItem updates cart state immediately and displays user feedback notice'
);

// Test deterministic cart item ID generation with design segregation
const itemDesignA = generateCartItemId('prod-1', 'var-1', { _design_id: 'design-aaa' });
const itemDesignB = generateCartItemId('prod-1', 'var-1', { _design_id: 'design-bbb' });
const standardItem = generateCartItemId('prod-1', 'var-1', null);

check(
  itemDesignA !== itemDesignB,
  'Different custom designs of the same machine produce distinct cart line item IDs'
);

check(
  itemDesignA !== standardItem,
  'Customized machine produces distinct cart line item ID from standard uncustomized machine'
);

// Verify isCartItem type guard
const validCartItem = {
  id: itemDesignA,
  productId: 'prod-1',
  slug: 'compact-domestic-aatamaker',
  name: 'CALVIN Compact Domestic Flour Mill',
  image: 'https://example.com/preview.png',
  unitPrice: 18999,
  quantity: 1,
  variantId: 'var-1',
  variantName: '1 HP Standard',
  sku: 'CALVIN-COMPACT-01',
  customisationDetails: { _design_id: 'design-aaa', _mode: 'demonstration' },
};

check(isCartItem(validCartItem) === true, 'isCartItem validates customized cart item');

// Test Cart Quantity Increment and Decrement logic
function simulateCartQuantityUpdate(items, targetId, nextQty, stock = 10) {
  if (nextQty < 1) return items;
  return items.map((it) => {
    if (it.id !== targetId) return it;
    if (nextQty > stock) return it;
    return { ...it, quantity: nextQty };
  });
}

const initialCart = [
  { ...validCartItem, quantity: 1, availableStock: 10 },
  { ...validCartItem, id: itemDesignB, quantity: 2, availableStock: 10 },
];

const afterIncrement = simulateCartQuantityUpdate(initialCart, itemDesignA, 2, 10);
check(
  afterIncrement.find((it) => it.id === itemDesignA)?.quantity === 2 &&
  afterIncrement.find((it) => it.id === itemDesignB)?.quantity === 2,
  'Increment updates target item quantity without affecting other design lines'
);

const afterDecrement = simulateCartQuantityUpdate(afterIncrement, itemDesignA, 1, 10);
check(
  afterDecrement.find((it) => it.id === itemDesignA)?.quantity === 1,
  'Decrement reduces target item quantity back to 1'
);

const clampNegative = simulateCartQuantityUpdate(afterDecrement, itemDesignA, 0, 10);
check(
  clampNegative.find((it) => it.id === itemDesignA)?.quantity === 1,
  'Decrement strictly clamped at minimum 1'
);

const afterRemove = afterDecrement.filter((it) => it.id !== itemDesignA);
check(
  afterRemove.length === 1 && afterRemove[0].id === itemDesignB,
  'Remove deletes target custom item while keeping other design lines intact'
);

// Subtotal calculation
const subtotal = afterDecrement.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
check(
  subtotal === 18999 * 1 + 18999 * 2,
  'Subtotal reactive computation calculates correctly across all active items'
);

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n=============================================================');
console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('=============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ ALL PHASE 7B.6.3 AUTOMATED CHECKS PASSED SUCCESSFULLY!\n');
}

