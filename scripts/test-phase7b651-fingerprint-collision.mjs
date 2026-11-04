/**
 * CALVIN AATAMAKER — Phase 7B.6.5.1 Fingerprint & Cart Collision Audit Suite
 * 
 * Verifies:
 * 1. Photo-Aware Identity: Different photos at identical (X, Y, W, H, Rot) produce different fingerprints.
 * 2. Transform Sensitivity: Same photo with different crop, rotation, or scale produces different fingerprints.
 * 3. Layer Order Sensitivity: Same layers with different z-order/stacking order produce different fingerprints.
 * 4. Typography & Styling Sensitivity: Different text, font, weight, color, or filter produce different fingerprints.
 * 5. Option & Variant Sensitivity: Different finish/sieve options or machine variants produce different fingerprints.
 * 6. Repeated Add to Cart (Rule B): Exact same saved design produces identical fingerprint & merges line item.
 * 7. Invariance Rules:
 *    - Temporary signed tokens (?token=...) are stripped and do NOT cause spurious collisions or mismatches.
 *    - Ephemeral timestamps and volatile layer IDs (Date.now()) do NOT cause mismatches.
 *    - Internal private metadata (_design_id, _preview_image) do NOT cause mismatches.
 */

import {
  computeDesignFingerprint,
  extractStablePhotoIdentity,
  generateCartItemId,
} from '../lib/cart.ts';

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

console.log('=== CALVIN AATAMAKER: PHASE 7B.6.5.1 FINGERPRINT & COLLISION AUDIT ===\n');

// =============================================================================
// [SUITE 1] Stable Photo Identity Extraction & Token Stripping
// =============================================================================
console.log('[SUITE 1] Stable Photo Identity Extraction & Token Stripping');

// 1. Permanent storage path
const id1 = extractStablePhotoIdentity({ storagePath: 'guests/tok1/photos/photo_a.jpg' });
check(id1 === 'storage:guests/tok1/photos/photo_a.jpg', 'Direct storagePath returns storage:<path>');

// 2. Pre-signed URL with expiring query tokens
const signedUrl1 = 'https://jxveftfkpmzevjimxzce.supabase.co/storage/v1/object/sign/customer-customizations/guests/tok1/photos/photo_a.jpg?token=eyJhbGciOi...&expires=1730000000';
const signedUrl2 = 'https://jxveftfkpmzevjimxzce.supabase.co/storage/v1/object/sign/customer-customizations/guests/tok1/photos/photo_a.jpg?token=DIFFERENT_EXPIRING_TOKEN&expires=1730099999';

const idSigned1 = extractStablePhotoIdentity({ imageUrl: signedUrl1 });
const idSigned2 = extractStablePhotoIdentity({ imageUrl: signedUrl2 });
check(idSigned1 === 'storage:guests/tok1/photos/photo_a.jpg', 'Signed URL correctly extracts storage bucket path');
check(idSigned1 === idSigned2, 'Different expiring tokens for the same asset produce IDENTICAL photo identity');

// 3. Different photos in storage produce different identities
const signedUrlB = 'https://jxveftfkpmzevjimxzce.supabase.co/storage/v1/object/sign/customer-customizations/guests/tok1/photos/photo_b.jpg?token=eyJhbGciOi...';
const idSignedB = extractStablePhotoIdentity({ imageUrl: signedUrlB });
check(idSigned1 !== idSignedB, 'Different photos in storage produce DIFFERENT photo identities');

// 4. API proxy route URL
const apiUrl = '/api/customizations/upload?path=guests/tok1/photos/photo_c.png&guestToken=xyz';
const idApi = extractStablePhotoIdentity({ imageUrl: apiUrl });
check(idApi === 'storage:guests/tok1/photos/photo_c.png', 'API upload route URL extracts canonical storage path');

// 5. Data URI hashing
const dataUriA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const dataUriB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const idDataA = extractStablePhotoIdentity({ imageUrl: dataUriA });
const idDataB = extractStablePhotoIdentity({ imageUrl: dataUriB });
check(idDataA.startsWith('data:'), 'Data URI returns data:<hash>_len<len>');
check(idDataA !== idDataB, 'Different base64 photographs produce DIFFERENT content hashes');

// =============================================================================
// [SUITE 2] Task 2: Photo Collision Verification (Identical Layout, Different Photos)
// =============================================================================
console.log('\n[SUITE 2] Task 2: Photo Collision Verification (Identical Layout, Different Photos)');

const commonOptions = {
  door_finish_style: 'matte_graphite',
  sieve_mesh_grade: 'standard_assortment',
};

// Design A: Photo A at (X=0.20, Y=0.30, W=0.40, H=0.40, Rot=0)
const designA_layers = [
  {
    id: 'photo-layer-1',
    type: 'photo',
    x: 0.20,
    y: 0.30,
    width: 0.40,
    height: 0.40,
    rotationDeg: 0,
    storagePath: 'guests/customer123/photos/family_photo_a.jpg',
    visible: true,
  },
  {
    id: 'text-layer-1',
    type: 'text',
    x: 0.20,
    y: 0.75,
    width: 0.60,
    height: 0.08,
    rotationDeg: 0,
    text: 'Calvin Heritage Chakki',
    fontFamily: 'serif',
    fillColorHex: '#B45309',
    fontSizePt: 28,
    visible: true,
  },
];

// Design B: Photo B at the EXACT SAME (X=0.20, Y=0.30, W=0.40, H=0.40, Rot=0)
const designB_layers = [
  {
    id: 'photo-layer-2',
    type: 'photo',
    x: 0.20,
    y: 0.30,
    width: 0.40,
    height: 0.40,
    rotationDeg: 0,
    storagePath: 'guests/customer123/photos/anniversary_photo_b.jpg', // DIFFERENT PHOTO!
    visible: true,
  },
  {
    id: 'text-layer-1',
    type: 'text',
    x: 0.20,
    y: 0.75,
    width: 0.60,
    height: 0.08,
    rotationDeg: 0,
    text: 'Calvin Heritage Chakki',
    fontFamily: 'serif',
    fillColorHex: '#B45309',
    fontSizePt: 28,
    visible: true,
  },
];

const fpDesignA = computeDesignFingerprint('prod-compact-01', null, designA_layers, commonOptions);
const fpDesignB = computeDesignFingerprint('prod-compact-01', null, designB_layers, commonOptions);

check(fpDesignA !== fpDesignB, 'Design A and Design B produce DIFFERENT fingerprints despite identical layout & coordinates');

// Simulate adding both to cart
let cart = [];

function addToCartSimulation(cartState, productId, variantId, layers, options) {
  const fp = computeDesignFingerprint(productId, variantId, layers, options);
  const existing = cartState.find(
    (it) => it.productId === productId && it.isCustomized && it.customisationDetails?._design_fingerprint === fp
  );

  if (existing) {
    return cartState.map((it) =>
      it.id === existing.id ? { ...it, quantity: it.quantity + 1 } : it
    );
  }

  const designId = `design-${Math.random().toString(36).slice(2, 10)}`;
  const details = {
    ...options,
    _design_id: designId,
    _design_fingerprint: fp,
  };
  const itemId = generateCartItemId(productId, variantId, details, designId);

  return [
    ...cartState,
    {
      id: itemId,
      productId,
      variantId,
      designId,
      isCustomized: true,
      quantity: 1,
      customisationDetails: details,
    },
  ];
}

cart = addToCartSimulation(cart, 'prod-compact-01', null, designA_layers, commonOptions);
check(cart.length === 1, 'Design A added as 1st cart line');

cart = addToCartSimulation(cart, 'prod-compact-01', null, designB_layers, commonOptions);
check(cart.length === 2, 'Design B added as 2nd SEPARATE cart line (NO COLLISION!)');
check(cart[0].id !== cart[1].id, 'Design A and Design B have distinct cart line item IDs');
check(cart[0].designId !== cart[1].designId, 'Design A and Design B have distinct design IDs');

// =============================================================================
// [SUITE 3] Material Variations Sensitivity
// =============================================================================
console.log('\n[SUITE 3] Material Variations Sensitivity');

// 1. Same photo with different crop
const designA_crop1 = [
  { ...designA_layers[0], crop: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 } },
  designA_layers[1],
];
const designA_crop2 = [
  { ...designA_layers[0], crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 } },
  designA_layers[1],
];
const fpCrop1 = computeDesignFingerprint('prod-compact-01', null, designA_crop1, commonOptions);
const fpCrop2 = computeDesignFingerprint('prod-compact-01', null, designA_crop2, commonOptions);
check(fpCrop1 !== fpCrop2, 'Different crop of same photo produces DIFFERENT fingerprint');

// 2. Same photo with different rotation
const designA_rot0 = designA_layers;
const designA_rot15 = [
  { ...designA_layers[0], rotationDeg: 15 },
  designA_layers[1],
];
const fpRot0 = computeDesignFingerprint('prod-compact-01', null, designA_rot0, commonOptions);
const fpRot15 = computeDesignFingerprint('prod-compact-01', null, designA_rot15, commonOptions);
check(fpRot0 !== fpRot15, 'Different rotation of same photo (0° vs 15°) produces DIFFERENT fingerprint');

// 3. Same photo with different scale
const designA_scale1 = designA_layers;
const designA_scale2 = [
  { ...designA_layers[0], width: 0.50, height: 0.50 },
  designA_layers[1],
];
const fpScale1 = computeDesignFingerprint('prod-compact-01', null, designA_scale1, commonOptions);
const fpScale2 = computeDesignFingerprint('prod-compact-01', null, designA_scale2, commonOptions);
check(fpScale1 !== fpScale2, 'Different scale of same photo produces DIFFERENT fingerprint');

// 4. Same photo with different layer order (z-index)
const designA_order1 = [designA_layers[0], designA_layers[1]]; // Photo then Text
const designA_order2 = [designA_layers[1], designA_layers[0]]; // Text then Photo
const fpOrder1 = computeDesignFingerprint('prod-compact-01', null, designA_order1, commonOptions);
const fpOrder2 = computeDesignFingerprint('prod-compact-01', null, designA_order2, commonOptions);
check(fpOrder1 !== fpOrder2, 'Reordering layers (stacking order) produces DIFFERENT fingerprint');

// 5. Different text
const designA_text1 = designA_layers;
const designA_text2 = [
  designA_layers[0],
  { ...designA_layers[1], text: 'Ganesh Kripa Atta Chakki' },
];
const fpText1 = computeDesignFingerprint('prod-compact-01', null, designA_text1, commonOptions);
const fpText2 = computeDesignFingerprint('prod-compact-01', null, designA_text2, commonOptions);
check(fpText1 !== fpText2, 'Different text inscription produces DIFFERENT fingerprint');

// 6. Different typography (font, weight, color)
const designA_font1 = designA_layers;
const designA_font2 = [
  designA_layers[0],
  { ...designA_layers[1], fontFamily: 'sans-serif', fontWeight: 'normal' },
];
const fpFont1 = computeDesignFingerprint('prod-compact-01', null, designA_font1, commonOptions);
const fpFont2 = computeDesignFingerprint('prod-compact-01', null, designA_font2, commonOptions);
check(fpFont1 !== fpFont2, 'Different typography (font family & weight) produces DIFFERENT fingerprint');

// 7. Different product option (finish)
const optionsMatte = { door_finish_style: 'matte_graphite' };
const optionsGold = { door_finish_style: 'champagne_gold' };
const fpOpt1 = computeDesignFingerprint('prod-compact-01', null, designA_layers, optionsMatte);
const fpOpt2 = computeDesignFingerprint('prod-compact-01', null, designA_layers, optionsGold);
check(fpOpt1 !== fpOpt2, 'Different finish option produces DIFFERENT fingerprint');

// 8. Different product variant
const fpVar1 = computeDesignFingerprint('prod-compact-01', 'var-1hp', designA_layers, commonOptions);
const fpVar2 = computeDesignFingerprint('prod-compact-01', 'var-125hp', designA_layers, commonOptions);
check(fpVar1 !== fpVar2, 'Different machine variant produces DIFFERENT fingerprint');

// =============================================================================
// [SUITE 4] Task 3: Repeated Identical Saved Design Behavior (Rule B)
// =============================================================================
console.log('\n[SUITE 4] Task 3: Repeated Identical Saved Design Behavior (Rule B)');

const initialCartCount = cart.length; // Currently 2 (Design A & Design B)
const initialDesignAQty = cart[0].quantity; // 1
const initialDesignAId = cart[0].id;
const initialDesignADesignId = cart[0].designId;

// Add Design A a second time (exact same photo & options)
cart = addToCartSimulation(cart, 'prod-compact-01', null, designA_layers, commonOptions);

check(cart.length === initialCartCount, 'Re-adding exact same Design A does NOT create an extra cart line');
check(cart[0].quantity === initialDesignAQty + 1, 'Re-adding exact same Design A increments quantity from 1 to 2');
check(cart[0].id === initialDesignAId, 'Retains exact same cart line item ID');
check(cart[0].designId === initialDesignADesignId, 'Retains exact same immutable designId');
check(cart[1].quantity === 1, 'Design B quantity remains unaffected at 1');

// =============================================================================
// [SUITE 5] Invariance Tests (Things that MUST NOT alter identity)
// =============================================================================
console.log('\n[SUITE 5] Invariance Tests (Exclusions from Fingerprint)');

// 1. Refreshing signed URL token must produce identical fingerprint
const layerWithToken1 = [
  {
    ...designA_layers[0],
    imageUrl: 'https://jxveftfkpmzevjimxzce.supabase.co/storage/v1/object/sign/customer-customizations/guests/c1/photos/pic.jpg?token=FIRST_SIGNATURE&expires=1000',
  },
  designA_layers[1],
];
const layerWithToken2 = [
  {
    ...designA_layers[0],
    imageUrl: 'https://jxveftfkpmzevjimxzce.supabase.co/storage/v1/object/sign/customer-customizations/guests/c1/photos/pic.jpg?token=REFRESHED_SIGNATURE&expires=9999',
  },
  designA_layers[1],
];
const fpToken1 = computeDesignFingerprint('prod-compact-01', null, layerWithToken1, commonOptions);
const fpToken2 = computeDesignFingerprint('prod-compact-01', null, layerWithToken2, commonOptions);
check(fpToken1 === fpToken2, 'Refreshed signed URL tokens produce IDENTICAL fingerprint (token stripped)');

// 2. Client runtime timestamps and volatile layer IDs must produce identical fingerprint
const layerWithTs1 = [
  { ...designA_layers[0], id: 'photo-1730000000000' },
  { ...designA_layers[1], id: 'text-1730000000001' },
];
const layerWithTs2 = [
  { ...designA_layers[0], id: 'photo-1730999999999' },
  { ...designA_layers[1], id: 'text-1730999999999' },
];
const fpTs1 = computeDesignFingerprint('prod-compact-01', null, layerWithTs1, commonOptions);
const fpTs2 = computeDesignFingerprint('prod-compact-01', null, layerWithTs2, commonOptions);
check(fpTs1 === fpTs2, 'Recreated layers with different Date.now() IDs produce IDENTICAL fingerprint');

// 3. Private internal metadata keys (_*) must produce identical fingerprint
const optsWithMeta1 = { ...commonOptions, _preview_image: 'url1', _design_id: 'd1', _mode: 'demonstration' };
const optsWithMeta2 = { ...commonOptions, _preview_image: 'url2', _design_id: 'd2', _mode: 'demonstration' };
const fpMeta1 = computeDesignFingerprint('prod-compact-01', null, designA_layers, optsWithMeta1);
const fpMeta2 = computeDesignFingerprint('prod-compact-01', null, designA_layers, optsWithMeta2);
check(fpMeta1 === fpMeta2, 'Private system metadata keys (_*) are ignored and produce IDENTICAL fingerprint');

// 4. Hidden layers (visible: false) must be excluded
const layerHidden = [
  designA_layers[0],
  designA_layers[1],
  { id: 'hidden-trash', type: 'text', text: 'Draft Note', visible: false, x: 0, y: 0, width: 1, height: 1 },
];
const fpHidden = computeDesignFingerprint('prod-compact-01', null, layerHidden, commonOptions);
const fpVisibleOnly = computeDesignFingerprint('prod-compact-01', null, designA_layers, commonOptions);
check(fpHidden === fpVisibleOnly, 'Hidden layers (visible: false) do not pollute the physical fingerprint');

console.log('\n=============================================================================');
console.log(`PHASE 7B.6.5.1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================================================');

if (failed > 0) {
  process.exit(1);
}

