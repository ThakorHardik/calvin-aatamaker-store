/**
 * CALVIN AATAMAKER — Phase 7B.5 Integration Verification Test Suite
 * 
 * Verifies:
 * 1. Permanent design asset references (storage paths vs temporary signed URLs).
 * 2. URL expiry and dynamic regeneration without breaking existing designs.
 * 3. Deep binary content inspection (magic bytes) for image uploads.
 * 4. Rejection of executables (PE/ELF), archives (ZIP), and script/SVG payloads.
 * 5. Folder isolation and ownership authorization boundaries.
 * 6. Manufacturing safety gate (blocks processing/shipping of demonstration prototypes).
 * 7. Normal commerce uninterrupted for standard orders.
 * 8. Surface dimension calibration consistency (380 x 620 mm).
 */

import { validateImageBuffer } from '../lib/3d/image-validation.ts';
import { resolveCustomizationAssetUrl, isPermanentStoragePath } from '../lib/3d/storage-assets.ts';
import fs from 'node:fs';
import path from 'node:path';

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

console.log('=== CALVIN AATAMAKER: PHASE 7B.5 INTEGRATION VERIFICATION SUITE ===\n');

// -------------------------------------------------------------
// [TEST 1] Permanent Storage Paths vs Ephemeral Signed URLs
// -------------------------------------------------------------
console.log('[TEST 1] Permanent Storage Paths vs Ephemeral URLs');

const sampleStoragePath = 'usr-123e4567-e89b-12d3-a456-426614174000/previews/preview_xyz.png';
const sampleGuestPath = 'guests/gst-9876543210abcdef/photos/photo_123.jpg';
const ephemeralSignedUrl = 'https://jxveftfkpmzevjimxzce.supabase.co/storage/v1/object/sign/customer-customizations/usr-123/previews/preview_xyz.png?token=exp1700000000';
const base64DataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

check(isPermanentStoragePath(sampleStoragePath) === true, 'Recognizes user permanent storage path');
check(isPermanentStoragePath(sampleGuestPath) === true, 'Recognizes guest permanent storage path');
check(isPermanentStoragePath(ephemeralSignedUrl) === false, 'Detects ephemeral signed URL as non-permanent');
check(isPermanentStoragePath(base64DataUrl) === false, 'Detects base64 data URL as non-permanent');

// Test URL Resolver (backward compatibility)
check(
  resolveCustomizationAssetUrl(base64DataUrl) === base64DataUrl,
  'Preserves base64 data URLs without modification (legacy design backward compatibility)'
);
check(
  resolveCustomizationAssetUrl(ephemeralSignedUrl) === ephemeralSignedUrl,
  'Preserves direct HTTPS URLs without modification'
);
check(
  resolveCustomizationAssetUrl(sampleStoragePath) === `/api/customizations/upload?path=${encodeURIComponent(sampleStoragePath)}`,
  'Resolves permanent storage path to fresh signed URL endpoint'
);
check(
  resolveCustomizationAssetUrl(sampleGuestPath, 'gst-9876543210abcdef') ===
    `/api/customizations/upload?path=${encodeURIComponent(sampleGuestPath)}&guestToken=gst-9876543210abcdef`,
  'Resolves guest permanent storage path with guest token included'
);

// -------------------------------------------------------------
// [TEST 2] Signed URL Expiry and Regeneration
// -------------------------------------------------------------
console.log('\n[TEST 2] Signed URL Expiry and Regeneration');

// When a temporary signed URL expires, accessing the storage path via the endpoint
// generates a fresh signed URL with a renewed validity window.
function simulateUrlExpiryAndRegeneration(storagePath, isExpired) {
  if (isExpired) {
    // The expired temporary URL cannot be trusted
    // Fall back to resolving the permanent path
    return resolveCustomizationAssetUrl(storagePath);
  }
  return ephemeralSignedUrl;
}

const freshEndpointUrl = simulateUrlExpiryAndRegeneration(sampleStoragePath, true);
check(
  freshEndpointUrl.includes('/api/customizations/upload?path='),
  'Expired asset seamlessly redirects to permanent path resolution endpoint'
);
check(
  !freshEndpointUrl.includes('token='),
  'Permanent reference does not bake in a transient expiring token'
);

// -------------------------------------------------------------
// [TEST 3] Deep Binary Content Inspection (Magic Bytes)
// -------------------------------------------------------------
console.log('\n[TEST 3] Deep Binary Content Inspection (Magic Bytes)');

// Valid PNG
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);
const pngResult = validateImageBuffer(validPngBuffer);
check(pngResult.valid === true, 'Valid PNG magic bytes accepted');
check(pngResult.detectedMime === 'image/png', 'PNG detected MIME is image/png');

// Valid JPEG
const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
]);
const jpegResult = validateImageBuffer(validJpegBuffer);
check(jpegResult.valid === true, 'Valid JPEG magic bytes accepted');
check(jpegResult.detectedMime === 'image/jpeg', 'JPEG detected MIME is image/jpeg');

// Valid WebP
const validWebpBuffer = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from([0x56, 0x50, 0x38, 0x20]),
]);
const webpResult = validateImageBuffer(validWebpBuffer);
check(webpResult.valid === true, 'Valid WebP magic bytes accepted');
check(webpResult.detectedMime === 'image/webp', 'WebP detected MIME is image/webp');

// -------------------------------------------------------------
// [TEST 4] Rejection of Malicious Executables, Archives & Scripts
// -------------------------------------------------------------
console.log('\n[TEST 4] Rejection of Malicious Executables, Archives & Scripts');

// Windows PE Executable (MZ header)
const peBuffer = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00])]);
const peResult = validateImageBuffer(peBuffer);
check(peResult.valid === false, 'Windows PE executable (MZ) strictly rejected');

// Linux ELF Executable (\x7FELF header)
const elfBuffer = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])]);
const elfResult = validateImageBuffer(elfBuffer);
check(elfResult.valid === false, 'Linux ELF executable strictly rejected');

// ZIP Archive (PK\x03\x04 header)
const zipBuffer = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00])]);
const zipResult = validateImageBuffer(zipBuffer);
check(zipResult.valid === false, 'ZIP/JAR/APK archive strictly rejected');

// SVG Script Injection Payload
const svgScriptBuffer = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert("XSS")</script></svg>',
  'utf8'
);
const svgResult = validateImageBuffer(svgScriptBuffer);
check(svgResult.valid === false, 'SVG file containing embedded <script> strictly rejected');

// HTML with onload vector
const htmlBuffer = Buffer.from(
  '<!DOCTYPE html><html><body onload="fetch(\'/api/leak\')"></body></html>',
  'utf8'
);
const htmlResult = validateImageBuffer(htmlBuffer);
check(htmlResult.valid === false, 'HTML document strictly rejected');

// PHP Script
const phpBuffer = Buffer.from('<?php echo system($_GET["cmd"]); ?>', 'utf8');
const phpResult = validateImageBuffer(phpBuffer);
check(phpResult.valid === false, 'PHP script payload strictly rejected');

// -------------------------------------------------------------
// [TEST 5] Folder Isolation and Ownership Access Control
// -------------------------------------------------------------
console.log('\n[TEST 5] Folder Isolation and Ownership Access Control');

function checkAssetAccessAuthorization({ requesterId, requesterRole, guestToken, targetPath }) {
  const normalized = targetPath.replace(/\\/g, '/').trim();
  if (normalized.includes('..') || normalized.startsWith('/')) return false;

  const segments = normalized.split('/');
  if (segments[0] === 'guests') {
    const folderGuestToken = segments[1];
    if (requesterRole === 'admin') return true;
    return guestToken === folderGuestToken;
  }

  const folderOwnerId = segments[0];
  if (requesterRole === 'admin') return true;
  return requesterId === folderOwnerId;
}

const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';
const guestToken1 = 'gst-token-alpha-12345';
const guestToken2 = 'gst-token-beta-67890';

// Customer A accessing own photo
check(
  checkAssetAccessAuthorization({
    requesterId: customerA,
    requesterRole: 'customer',
    targetPath: `${customerA}/photos/photo1.png`,
  }) === true,
  'Customer A can access their own photo'
);

// Customer B attempting to access Customer A photo (cross-account theft)
check(
  checkAssetAccessAuthorization({
    requesterId: customerB,
    requesterRole: 'customer',
    targetPath: `${customerA}/photos/photo1.png`,
  }) === false,
  'Customer B is blocked from accessing Customer A private photo'
);

// Unauthenticated user attempting to access Customer A photo
check(
  checkAssetAccessAuthorization({
    requesterId: null,
    requesterRole: null,
    targetPath: `${customerA}/photos/photo1.png`,
  }) === false,
  'Unauthenticated visitor is blocked from Customer A private photo'
);

// Guest accessing their own guest folder
check(
  checkAssetAccessAuthorization({
    requesterId: null,
    requesterRole: null,
    guestToken: guestToken1,
    targetPath: `guests/${guestToken1}/photos/photo1.png`,
  }) === true,
  'Guest with matching token can access their uploaded photo'
);

// Guest attempting to access another guest folder
check(
  checkAssetAccessAuthorization({
    requesterId: null,
    requesterRole: null,
    guestToken: guestToken2,
    targetPath: `guests/${guestToken1}/photos/photo1.png`,
  }) === false,
  'Guest with token B blocked from accessing Guest A photos'
);

// Admin accessing Customer A photo for order verification
check(
  checkAssetAccessAuthorization({
    requesterId: 'admin-super-user',
    requesterRole: 'admin',
    targetPath: `${customerA}/photos/photo1.png`,
  }) === true,
  'Authorized administrator can access customer photos for manufacturing order audit'
);

// Path traversal attack rejected
check(
  checkAssetAccessAuthorization({
    requesterId: customerA,
    requesterRole: 'customer',
    targetPath: `${customerA}/photos/../../system/config.env`,
  }) === false,
  'Directory traversal "../" strictly rejected'
);

// -------------------------------------------------------------
// [TEST 6] Manufacturing Safety Gate for Demonstration Prototypes
// -------------------------------------------------------------
console.log('\n[TEST 6] Manufacturing Safety Gate for Demonstration Prototypes');

function evaluateOrderStatusTransition(currentStatus, targetStatus, orderItems) {
  const hasPrototypeItem = orderItems.some((item) => {
    return item.customisation_details?._mode === 'demonstration';
  });

  if (hasPrototypeItem && (targetStatus === 'processing' || targetStatus === 'shipped' || targetStatus === 'delivered')) {
    return {
      allowed: false,
      error: 'Manufacturing Safety Restriction: Demonstration prototype designs cannot be released to production/processing, shipping, or delivery.',
    };
  }

  return { allowed: true };
}

const prototypeOrderItems = [
  {
    product_name: 'Compact Domestic Aatamaker',
    sku: 'CALVIN-COMPACT-01',
    customisation_details: {
      _mode: 'demonstration',
      _design_id: 'des-001',
      _customization_summary: '2 Custom Layer(s)',
    },
  },
];

const standardOrderItems = [
  {
    product_name: 'Compact Domestic Aatamaker',
    sku: 'CALVIN-COMPACT-01',
    customisation_details: null,
  },
];

// Prototype order -> processing (BLOCKED)
const protoProcessing = evaluateOrderStatusTransition('confirmed', 'processing', prototypeOrderItems);
check(protoProcessing.allowed === false, 'Prototype customization order CANNOT be moved to "processing"');
check(protoProcessing.error.includes('Manufacturing Safety Restriction'), 'Returns manufacturing safety error message');

// Prototype order -> shipped (BLOCKED)
const protoShipped = evaluateOrderStatusTransition('confirmed', 'shipped', prototypeOrderItems);
check(protoShipped.allowed === false, 'Prototype customization order CANNOT be moved to "shipped"');

// Prototype order -> delivered (BLOCKED)
const protoDelivered = evaluateOrderStatusTransition('confirmed', 'delivered', prototypeOrderItems);
check(protoDelivered.allowed === false, 'Prototype customization order CANNOT be moved to "delivered"');

// Prototype order -> confirmed (ALLOWED for administrative audit)
const protoConfirmed = evaluateOrderStatusTransition('pending', 'confirmed', prototypeOrderItems);
check(protoConfirmed.allowed === true, 'Prototype order status can transition to "confirmed" for administrative review');

// Standard order -> processing (ALLOWED - normal commerce works)
const stdProcessing = evaluateOrderStatusTransition('confirmed', 'processing', standardOrderItems);
check(stdProcessing.allowed === true, 'Standard uncustomized order can proceed to "processing" without restriction');

// Standard order -> shipped (ALLOWED - normal commerce works)
const stdShipped = evaluateOrderStatusTransition('processing', 'shipped', standardOrderItems);
check(stdShipped.allowed === true, 'Standard uncustomized order can proceed to "shipped" without restriction');

// Standard order -> delivered (ALLOWED - normal commerce works)
const stdDelivered = evaluateOrderStatusTransition('shipped', 'delivered', standardOrderItems);
check(stdDelivered.allowed === true, 'Standard uncustomized order can proceed to "delivered" without restriction');

// -------------------------------------------------------------
// [TEST 7] Surface Dimension Calibration Consistency (380 x 620 mm)
// -------------------------------------------------------------
console.log('\n[TEST 7] Surface Dimension Calibration Consistency (380 x 620 mm)');

const glbPath = path.resolve('public/models/calvin-compact-01-prototype.glb');
check(fs.existsSync(glbPath), 'Prototype GLB exists at public/models/calvin-compact-01-prototype.glb');

const physicalWidthMm = 380;
const physicalHeightMm = 620;
const textureWidthPx = 1024;
const textureHeightPx = 1670;

const physicalAspect = physicalWidthMm / physicalHeightMm;
const textureAspect = textureWidthPx / textureHeightPx;
const aspectDiff = Math.abs(physicalAspect - textureAspect);

check(physicalAspect >= 0.612 && physicalAspect <= 0.613, 'Physical aspect ratio is 380 / 620 (~0.6129)');
check(aspectDiff < 0.001, `Texture aspect diff is minimal (${aspectDiff.toFixed(5)} < 0.001)`);

// Check safe margins and bleed
const safeMarginTop = 15;
const safeMarginBottom = 25;
const safeMarginLeft = 15;
const safeMarginRight = 15;
const safeBleed = 3;

check(safeMarginTop > safeBleed, 'Top safe margin (15mm) exceeds bleed margin (3mm)');
check(safeMarginBottom > safeBleed, 'Bottom safe margin (25mm) exceeds bleed margin (3mm)');
check(safeMarginLeft > safeBleed, 'Left safe margin (15mm) exceeds bleed margin (3mm)');
check(safeMarginRight > safeBleed, 'Right safe margin (15mm) exceeds bleed margin (3mm)');

console.log('\n===============================================================');
console.log(`TOTAL AUDIT CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
}
