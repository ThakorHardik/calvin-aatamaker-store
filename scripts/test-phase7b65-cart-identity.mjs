/**
 * CALVIN AATAMAKER — Phase 7B.6.5 Verification Test Suite
 * Cart Identity, Duplicate Handling and Quantity Verification
 * 
 * Verifies:
 * 1. Rule A: Same normal product + variant added twice merges into 1 line, quantity 1 -> 2.
 * 2. Rule B: Same saved customization added again merges into 1 line, quantity increases, retains snapshot.
 * 3. Rule C: Different customizations (photos, text, crops, options) create separate lines at quantity 1.
 * 4. Rule D: Normal vs. Customized of the same product & variant are separate lines, never merged.
 * 5. Rule E: Different variants of the same product are separate lines, never merged.
 * 6. Stable Identity Contract: productId:variantId:standard vs productId:variantId:design-designId.
 * 7. Quantity (+ / - with >= 1 clamp) and selective removal without affecting sibling lines.
 * 8. Checkout serialization preserving separate independent lines.
 */

import {
  generateCartItemId,
  computeDesignFingerprint,
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

console.log('=== CALVIN AATAMAKER: PHASE 7B.6.5 CART IDENTITY & DUPLICATE SUITE ===\n');

// =============================================================================
// [SUITE 1] Stable Item Identity Contract
// =============================================================================
console.log('[SUITE 1] Stable Item Identity Contract');

const normalIdDefault = generateCartItemId('prod-compact-01', null, null);
check(
  normalIdDefault === 'prod-compact-01:default:standard',
  'Normal product with null variant generates "prod-id:default:standard"'
);

const normalIdEmpty = generateCartItemId('prod-compact-01', '', null);
check(
  normalIdEmpty === 'prod-compact-01:default:standard',
  'Normal product with empty variant string generates "prod-id:default:standard"'
);

const normalIdVariant = generateCartItemId('prod-compact-01', 'var-1hp', null);
check(
  normalIdVariant === 'prod-compact-01:var-1hp:standard',
  'Normal product with variant generates "prod-id:variant-id:standard"'
);

const customId = generateCartItemId('prod-compact-01', 'var-1hp', { _design_id: 'design-abc-123' });
check(
  customId === 'prod-compact-01:var-1hp:design-design-abc-123',
  'Customized product generates "prod-id:variant-id:design-designId"'
);

const customIdExplicit = generateCartItemId('prod-compact-01', 'var-1hp', null, 'design-abc-123');
check(
  customIdExplicit === 'prod-compact-01:var-1hp:design-design-abc-123',
  'Explicit designId parameter generates "prod-id:variant-id:design-designId"'
);

check(
  !normalIdVariant.includes(':design-'),
  'Normal product ID never contains ":design-"'
);

check(
  !customId.includes(':standard'),
  'Customized product ID never contains ":standard"'
);

// =============================================================================
// [SUITE 2] Rule A: Same Normal Product Duplicate Handling
// =============================================================================
console.log('\n[SUITE 2] Rule A: Same Normal Product Duplicate Handling');

function simulateAddNormal(cart, product, variantId, qtyToAdd) {
  const itemId = generateCartItemId(product.id, variantId, null);
  const existingIndex = cart.findIndex((it) => it.id === itemId);
  const currentQty = existingIndex >= 0 ? cart[existingIndex].quantity : 0;
  const unitPrice = variantId === 'var-125hp' ? product.price + 2500 : product.price;

  const item = {
    id: itemId,
    productId: product.id,
    slug: product.slug,
    name: product.name,
    image: '/images/test-product.png',
    unitPrice,
    quantity: currentQty + qtyToAdd,
    variantId: variantId || null,
    variantName: variantId === 'var-125hp' ? '1.25 HP' : '1.0 HP',
    sku: variantId ? `${product.sku}-${variantId}` : product.sku,
    customisationDetails: null,
    isCustomized: false,
  };

  if (existingIndex >= 0) {
    cart[existingIndex] = item;
  } else {
    cart.push(item);
  }
  return cart;
}

const mockProduct = {
  id: 'prod-compact-01',
  name: 'Calvin Compact Domestic Flour Mill',
  slug: 'compact-domestic-aatamaker-20c2f7',
  sku: 'CALVIN-COMPACT-01',
  price: 24999,
};

let testCart = [];
testCart = simulateAddNormal(testCart, mockProduct, 'var-1hp', 1);
check(testCart.length === 1, 'First add of normal product creates 1 line');
check(testCart[0].quantity === 1, 'First add quantity is 1');
check(testCart[0].unitPrice === 24999, 'Line unit price is 24,999');

// Add the same normal product + same variant again
testCart = simulateAddNormal(testCart, mockProduct, 'var-1hp', 1);
check(testCart.length === 1, 'Second add of same normal product does NOT create a second line');
check(testCart[0].quantity === 2, 'Second add increments quantity from 1 to 2');
check(testCart[0].unitPrice * testCart[0].quantity === 49998, 'Subtotal updates correctly to 49,998');

// =============================================================================
// [SUITE 3] Rule B: Same Saved Customization Duplicate Handling
// =============================================================================
console.log('\n[SUITE 3] Rule B: Same Saved Customization Duplicate Handling');

const layersA = [
  {
    type: 'photo',
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.35,
    rotationDeg: 0,
    imageUrl: 'https://example.com/customer-photo-1.png',
    visible: true,
  },
  {
    type: 'text',
    x: 0.2,
    y: 0.65,
    width: 0.6,
    height: 0.08,
    rotationDeg: 0,
    text: 'Shree Ganesh Kripa',
    fontFamily: 'serif',
    fillColorHex: '#B45309',
    fontSizePt: 28,
    visible: true,
  },
];

const optionsA = {
  door_finish_style: 'matte_graphite',
  sieve_mesh_grade: 'standard_assortment',
};

const fpA1 = computeDesignFingerprint(mockProduct.id, 'var-1hp', layersA, optionsA);
const fpA2 = computeDesignFingerprint(mockProduct.id, 'var-1hp', layersA, optionsA);
check(fpA1 === fpA2, 'Identical customization artwork & options produce identical fingerprint');

function simulateAddCustomized(cart, product, variantId, layers, options, previewUrl) {
  const cleanVariantId = variantId || null;
  const fp = computeDesignFingerprint(product.id, cleanVariantId, layers, options);

  // Rule B / C: Check if exact design fingerprint exists in cart
  const existingMatchingItem = cart.find(
    (it) =>
      it.isCustomized &&
      it.productId === product.id &&
      (it.variantId ?? null) === cleanVariantId &&
      it.customisationDetails?._design_fingerprint === fp
  );

  const designId = existingMatchingItem?.designId || `design-${Math.random().toString(36).slice(2, 10)}`;

  const cleanDetails = {
    ...options,
    _design_id: designId,
    _design_fingerprint: fp,
    _preview_image: previewUrl,
    _customization_summary: '2 Custom Layer(s)',
  };

  const itemId = generateCartItemId(product.id, cleanVariantId, cleanDetails, designId);
  const existingIndex = cart.findIndex((it) => it.id === itemId);

  const unitPrice = 24999;

  if (existingIndex >= 0) {
    cart[existingIndex] = {
      ...cart[existingIndex],
      quantity: cart[existingIndex].quantity + 1,
    };
  } else {
    cart.push({
      id: itemId,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: previewUrl,
      customPreviewUrl: previewUrl,
      unitPrice,
      quantity: 1,
      variantId: cleanVariantId,
      variantName: '1.0 HP',
      sku: 'CALVIN-COMPACT-01-var-1hp',
      customisationDetails: cleanDetails,
      isCustomized: true,
      designId,
    });
  }
  return cart;
}

// Add Design A to cart
testCart = simulateAddCustomized(testCart, mockProduct, 'var-1hp', layersA, optionsA, 'https://example.com/preview-A.png');
const customItemA = testCart.find((it) => it.customisationDetails?._design_fingerprint === fpA1);
check(Boolean(customItemA), 'Design A added to cart');
check(customItemA.quantity === 1, 'Design A initial quantity is 1');
check(customItemA.customPreviewUrl === 'https://example.com/preview-A.png', 'Design A retains its own 3D preview URL');

// Add the EXACT SAME Design A again
const initialCartLen = testCart.length;
testCart = simulateAddCustomized(testCart, mockProduct, 'var-1hp', layersA, optionsA, 'https://example.com/preview-A.png');
check(testCart.length === initialCartLen, 'Adding exact same Design A does NOT create an extra line item');
const customItemAUpdated = testCart.find((it) => it.customisationDetails?._design_fingerprint === fpA1);
check(customItemAUpdated.quantity === 2, 'Adding exact same Design A increments quantity from 1 to 2');
check(customItemAUpdated.designId === customItemA.designId, 'Retains exact same design ID');

// =============================================================================
// [SUITE 4] Rule C: Different Customizations Separation
// =============================================================================
console.log('\n[SUITE 4] Rule C: Different Customizations Separation');

// Design B: Different photograph & different inscription
const layersB = [
  {
    type: 'photo',
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.35,
    rotationDeg: 15, // Rotated 15 deg
    imageUrl: 'https://example.com/customer-photo-2.png', // Different photo
    crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, // Custom crop
    visible: true,
  },
  {
    type: 'text',
    x: 0.2,
    y: 0.65,
    width: 0.6,
    height: 0.08,
    rotationDeg: 0,
    text: 'Jai Shree Ram', // Different text
    fontFamily: 'serif',
    fillColorHex: '#D97706',
    fontSizePt: 28,
    visible: true,
  },
];

const optionsB = {
  door_finish_style: 'brushed_brass', // Different option
  sieve_mesh_grade: 'micro_flour_sieve',
};

const fpB = computeDesignFingerprint(mockProduct.id, 'var-1hp', layersB, optionsB);
check(fpA1 !== fpB, 'Design A and Design B produce distinct fingerprints');

const countBeforeB = testCart.length;
testCart = simulateAddCustomized(testCart, mockProduct, 'var-1hp', layersB, optionsB, 'https://example.com/preview-B.png');
check(testCart.length === countBeforeB + 1, 'Adding Design B creates a separate cart line');

const itemAInCart = testCart.find((it) => it.customisationDetails?._design_fingerprint === fpA1);
const itemBInCart = testCart.find((it) => it.customisationDetails?._design_fingerprint === fpB);

check(Boolean(itemAInCart) && Boolean(itemBInCart), 'Both Design A and Design B exist simultaneously in the cart');
check(itemAInCart.id !== itemBInCart.id, 'Design A and Design B have distinct cart line item IDs');
check(itemAInCart.designId !== itemBInCart.designId, 'Design A and Design B have distinct design IDs');
check(itemBInCart.quantity === 1, 'Design B line starts at quantity 1');
check(itemAInCart.quantity === 2, 'Design A line maintains its quantity of 2');
check(itemBInCart.customPreviewUrl === 'https://example.com/preview-B.png', 'Design B displays its own preview');
check(itemAInCart.customPreviewUrl === 'https://example.com/preview-A.png', 'Design A displays its own preview');

// =============================================================================
// [SUITE 5] Rule D: Normal versus Customized Separation
// =============================================================================
console.log('\n[SUITE 5] Rule D: Normal versus Customized Separation');

const normalLine = testCart.find((it) => !it.isCustomized);
check(Boolean(normalLine), 'Cart contains normal uncustomized machine');
check(normalLine.id.endsWith(':standard'), 'Normal machine ID has :standard suffix');
check(itemAInCart.id.includes(':design-'), 'Customized machine A has :design- suffix');
check(itemBInCart.id.includes(':design-'), 'Customized machine B has :design- suffix');
check(normalLine.id !== itemAInCart.id && normalLine.id !== itemBInCart.id, 'Normal machine is strictly separated from customized machines');

// Add normal machine again
testCart = simulateAddNormal(testCart, mockProduct, 'var-1hp', 1);
const normalLineUpdated = testCart.find((it) => !it.isCustomized);
check(normalLineUpdated.quantity === 3, 'Adding normal machine again increments normal line to 3');
check(itemAInCart.quantity === 2, 'Design A quantity remains unchanged at 2');
check(itemBInCart.quantity === 1, 'Design B quantity remains unchanged at 1');

// =============================================================================
// [SUITE 6] Rule E: Different Product Variants Separation
// =============================================================================
console.log('\n[SUITE 6] Rule E: Different Product Variants Separation');

// Add normal machine with Variant 2 (Heavy Duty 1.25 HP)
testCart = simulateAddNormal(testCart, mockProduct, 'var-125hp', 1);
const normalVar2Line = testCart.find((it) => it.variantId === 'var-125hp');
check(Boolean(normalVar2Line), 'Normal Variant 2 added to cart');
check(normalVar2Line.id.includes(':var-125hp:standard'), 'Variant 2 ID includes ":var-125hp:"');
check(normalVar2Line.id !== normalLineUpdated.id, 'Variant 1 and Variant 2 are distinct cart lines');
check(normalVar2Line.quantity === 1, 'Variant 2 starts at quantity 1');
check(normalLineUpdated.quantity === 3, 'Variant 1 remains at quantity 3');

// =============================================================================
// [SUITE 7] Task 4: Quantity & Removal Logic
// =============================================================================
console.log('\n[SUITE 7] Task 4: Quantity & Removal Operations');

function simulateChangeQty(cart, itemId, newQty) {
  if (newQty < 1) return cart;
  return cart.map((it) => (it.id === itemId ? { ...it, quantity: newQty } : it));
}

function simulateRemoveItem(cart, itemId) {
  return cart.filter((it) => it.id !== itemId);
}

// Increment Design B from 1 to 2
testCart = simulateChangeQty(testCart, itemBInCart.id, 2);
const bAfterInc = testCart.find((it) => it.id === itemBInCart.id);
check(bAfterInc.quantity === 2, 'Design B quantity incremented to 2');
check(testCart.find((it) => it.id === itemAInCart.id).quantity === 2, 'Design A quantity remains 2');
check(testCart.find((it) => it.id === normalLineUpdated.id).quantity === 3, 'Normal line quantity remains 3');

// Decrement Design B back to 1
testCart = simulateChangeQty(testCart, itemBInCart.id, 1);
const bAfterDec = testCart.find((it) => it.id === itemBInCart.id);
check(bAfterDec.quantity === 1, 'Design B quantity decremented back to 1');

// Decrement clamp: cannot go below 1
testCart = simulateChangeQty(testCart, itemBInCart.id, 0);
const bClamped = testCart.find((it) => it.id === itemBInCart.id);
check(bClamped.quantity === 1, 'Decrement below 1 is rejected and clamped at 1');

// Remove ONLY Design A
testCart = simulateRemoveItem(testCart, itemAInCart.id);
check(!testCart.some((it) => it.id === itemAInCart.id), 'Design A removed from cart');
check(testCart.some((it) => it.id === itemBInCart.id), 'Design B remains in cart');
check(testCart.some((it) => it.id === normalLineUpdated.id), 'Normal Variant 1 remains in cart');
check(testCart.some((it) => it.id === normalVar2Line.id), 'Normal Variant 2 remains in cart');

// Verify reactive subtotal calculation
const expectedSubtotal =
  normalLineUpdated.unitPrice * 3 + // 24999 * 3 = 74997
  normalVar2Line.unitPrice * 1 +   // (24999 + 2500) * 1 = 27499
  itemBInCart.unitPrice * 1;       // 24999 * 1 = 24999
const actualSubtotal = testCart.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
check(actualSubtotal === expectedSubtotal, `Subtotal reactive calculation correct: ₹${actualSubtotal}`);

// =============================================================================
// [SUITE 8] Task 5: Checkout Serialization & Verification
// =============================================================================
console.log('\n[SUITE 8] Task 5: Checkout Line Items Serialization');

const checkoutPayload = {
  customerName: 'Test Customer',
  email: 'test@example.com',
  phone: '9876543210',
  address1: '123 Test Street',
  city: 'Ahmedabad',
  state: 'Gujarat',
  postalCode: '380015',
  items: testCart.map((it) => ({
    productId: it.productId,
    variantId: it.variantId,
    quantity: it.quantity,
    customisationDetails: it.customisationDetails ?? {},
  })),
};

check(checkoutPayload.items.length === 3, 'Checkout preserves all 3 independent lines');
check(
  checkoutPayload.items.filter((it) => !it.customisationDetails._design_id).length === 2,
  'Checkout has 2 normal lines (Var 1 and Var 2)'
);
check(
  checkoutPayload.items.filter((it) => Boolean(it.customisationDetails._design_id)).length === 1,
  'Checkout has 1 customized line (Design B)'
);

// Summary output
console.log(`\n=============================================================================`);
console.log(`PHASE 7B.6.5 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`=============================================================================`);

if (failed > 0) {
  process.exit(1);
}
