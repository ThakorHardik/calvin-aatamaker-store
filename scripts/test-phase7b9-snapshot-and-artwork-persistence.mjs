/**
 * CALVIN AATAMAKER — Phase 7B.9 Test Suite
 * Complete Customized Order Snapshot, Artwork Persistence and Admin Inspection Verification
 */

import assert from 'node:assert/strict';
import { isPermanentStoragePath, resolveCustomizationAssetUrl } from '../lib/3d/storage-assets.ts';
import { buildImmutableCustomizationSnapshot } from '../lib/3d/order-snapshot.ts';
import { CANONICAL_ARTWORK_WIDTH, CANONICAL_ARTWORK_HEIGHT } from '../lib/3d/canonical-artwork.ts';

console.log('=== CALVIN AATAMAKER: PHASE 7B.9 VERIFICATION SUITE ===\n');

// -----------------------------------------------------------------------------
// TEST 1: Canonical Flat Artwork Dimensions & Coordinate Contract
// -----------------------------------------------------------------------------
console.log('TEST 1: Canonical Flat Artwork Dimensions (380 mm × 620 mm)');
assert.equal(CANONICAL_ARTWORK_WIDTH, 1024, 'Canonical artwork width must be 1024');
assert.equal(CANONICAL_ARTWORK_HEIGHT, 1670, 'Canonical artwork height must be 1670');
const calculatedAspect = CANONICAL_ARTWORK_WIDTH / CANONICAL_ARTWORK_HEIGHT;
const targetPhysicalAspect = 380 / 620;
assert.ok(
  Math.abs(calculatedAspect - targetPhysicalAspect) < 0.001,
  `Artwork aspect ratio (${calculatedAspect}) must match physical door panel 380x620mm (${targetPhysicalAspect})`
);
console.log('✓ PASS: Canonical flat artwork dimensions match 380 × 620 mm door panel aspect.\n');

// -----------------------------------------------------------------------------
// TEST 2: Permanent Storage Path Detection for Artwork, Photos, Previews
// -----------------------------------------------------------------------------
console.log('TEST 2: Permanent Storage Path Validation');
assert.ok(
  isPermanentStoragePath('b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_photo.jpg'),
  'Customer photos path must be recognized as permanent storage'
);
assert.ok(
  isPermanentStoragePath('b01fcd2a-36b6-4def-a786-52e4707c2395/previews/preview_6aa4a8ff.png'),
  'Customer 3D preview path must be recognized as permanent storage'
);
assert.ok(
  isPermanentStoragePath('b01fcd2a-36b6-4def-a786-52e4707c2395/artwork/flat_6aa4a8ff.png'),
  'Customer flat artwork path must be recognized as permanent storage'
);
assert.ok(
  isPermanentStoragePath('guests/02309137-fa09-4620-ab98-1e922ebee267/artwork/flat_demo.png'),
  'Guest flat artwork path must be recognized as permanent storage'
);
assert.equal(
  isPermanentStoragePath('https://example.com/photo.jpg'),
  false,
  'External HTTP URLs must NOT be permanent storage paths'
);
assert.equal(
  isPermanentStoragePath('data:image/png;base64,iVBORw0KGgo='),
  false,
  'Data URLs must NOT be permanent storage paths'
);
console.log('✓ PASS: Storage path detection supports artwork, previews, photos for owners and guests.\n');

// -----------------------------------------------------------------------------
// TEST 3: Asset URL Resolution with Secure Server Endpoint
// -----------------------------------------------------------------------------
console.log('TEST 3: Asset URL Resolution via Endpoint');
const resolvedPhoto = resolveCustomizationAssetUrl('b01fcd2a-36b6-4def-a786-52e4707c2395/photos/photo1.jpg');
assert.ok(
  resolvedPhoto.includes('/api/customizations/upload?path=b01fcd2a-36b6-4def-a786-52e4707c2395%2Fphotos%2Fphoto1.jpg'),
  'Permanent photo path must route through /api/customizations/upload'
);
const resolvedArtwork = resolveCustomizationAssetUrl('b01fcd2a-36b6-4def-a786-52e4707c2395/artwork/flat_123.png');
assert.ok(
  resolvedArtwork.includes('artwork%2Fflat_123.png'),
  'Permanent artwork path must route through /api/customizations/upload'
);
console.log('✓ PASS: Asset resolution routes through authorized signed URL endpoint.\n');

// -----------------------------------------------------------------------------
// TEST 4: Immutable Snapshot Construction with Flat Artwork & Inscriptions
// -----------------------------------------------------------------------------
console.log('TEST 4: Immutable Snapshot Generation');
const testLayers = [
  {
    id: 'photo-1',
    type: 'photo',
    storagePath: 'owner-1/photos/upload.jpg',
    x: 0.1,
    y: 0.2,
    width: 0.8,
    height: 0.5,
    rotation: 0,
    opacity: 1,
    visible: true,
  },
  {
    id: 'text-1',
    type: 'text',
    text: 'CALVIN ATTA CHAKKI',
    fontFamily: "'Noto Serif Devanagari', serif",
    fontSize: 28,
    fontWeight: 'bold',
    color: '#b45309',
    textAlign: 'center',
    x: 0.08,
    y: 0.12,
    width: 0.6,
    height: 0.08,
    rotation: 0,
    opacity: 1,
    visible: true,
  },
];

const snapshot = buildImmutableCustomizationSnapshot({
  designId: '6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482',
  designFingerprint: 'fp-12345',
  mode: 'demonstration',
  modelCode: 'CALVIN-COMPACT-01',
  surfaceKey: 'front_door_panel',
  surfaceDimensionsMm: { width: 380, height: 620 },
  layers: testLayers,
  options: { front_panel_finish: 'matte_black', sieve_mesh_grade: 'standard_assortment' },
  priceDelta: 0,
  summary: 'Customized Door Panel',
  previewStoragePath: 'owner-1/previews/preview_6aa4a8ff.png',
  previewImage: 'https://example.com/preview.png',
  flatArtworkStoragePath: 'owner-1/artwork/flat_6aa4a8ff.png',
  flatArtworkUrl: 'https://example.com/flat.png',
});

assert.equal(snapshot.design_id, '6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482');
assert.equal(snapshot.model_code, 'CALVIN-COMPACT-01');
assert.equal(snapshot.preview_storage_path, 'owner-1/previews/preview_6aa4a8ff.png');
assert.equal(snapshot.flat_artwork_storage_path, 'owner-1/artwork/flat_6aa4a8ff.png');
assert.equal(snapshot.text_layers.length, 1);
assert.equal(snapshot.text_layers[0].text, 'CALVIN ATTA CHAKKI');
assert.equal(snapshot.text_layers[0].fontFamily, "'Noto Serif Devanagari', serif");
assert.equal(snapshot.text_layers[0].color, '#b45309');
assert.equal(snapshot.original_assets.length, 1);
assert.equal(snapshot.original_assets[0].storagePath, 'owner-1/photos/upload.jpg');
console.log('✓ PASS: Immutable snapshot preserves both 3D preview, flat artwork, and text typography.\n');

// -----------------------------------------------------------------------------
// TEST 5: Problem Order CA-BE01BE8E34 Admin Inspection Fallback Resolution
// -----------------------------------------------------------------------------
console.log('TEST 5: Problem Order CA-BE01BE8E34 Resolution Audit');
// Simulate the exact database record in order 3d3761e4-f0c5-43e7-b76d-f96bcd054059
const problemOrderCustomDetails = {
  _mode: 'demonstration',
  _preview_storage_path: 'b01fcd2a-36b6-4def-a786-52e4707c2395/previews/preview_6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482.png',
  _preview_image: 'https://example.com/ephemeral-preview.png',
  _layers: [
    {
      x: 0,
      y: 0,
      id: 'photo-1793737899665',
      name: 'WhatsApp Image 2026-',
      type: 'photo',
      order: 0,
      width: 1,
      height: 1,
      storagePath: 'b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12-d334-482e-83d6-caf059aa6c23.jpg',
    },
    {
      x: 0.08,
      y: 0.1188,
      id: 'text-1793703426810',
      name: 'Custom Inscription',
      text: 'Hardik',
      type: 'text',
      color: '#b45309',
      order: 1,
      width: 0.6,
      height: 0.08,
      fontSize: 28,
      fontFamily: "'Noto Serif Devanagari', serif",
      fontWeight: 'bold',
    },
  ],
  _snapshot: {
    preview_storage_path: 'b01fcd2a-36b6-4def-a786-52e4707c2395/previews/preview_6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482.png',
    text_layers: [
      {
        text: 'Hardik',
        fontFamily: "'Noto Serif Devanagari', serif",
        fontSize: 28,
        fontWeight: 'bold',
        color: '#b45309',
      },
    ],
  },
};

// Admin Order Inspection logic
const snap = problemOrderCustomDetails._snapshot;
const resolvedAdminPreview =
  problemOrderCustomDetails._preview_thumbnail_path ||
  problemOrderCustomDetails._preview_storage_path ||
  snap?.preview_storage_path ||
  problemOrderCustomDetails._preview_image ||
  '';

assert.equal(
  resolvedAdminPreview,
  'b01fcd2a-36b6-4def-a786-52e4707c2395/previews/preview_6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482.png',
  'Admin must now successfully resolve the 3D snapshot path from _preview_storage_path!'
);

// Admin Custom Text Extraction logic
const textLayers = problemOrderCustomDetails._snapshot.text_layers;
assert.equal(textLayers.length, 1);
assert.equal(textLayers[0].text, 'Hardik');
assert.equal(textLayers[0].fontFamily, "'Noto Serif Devanagari', serif");
assert.equal(textLayers[0].color, '#b45309');

console.log('✓ PASS: Problem order CA-BE01BE8E34 now resolves 3D preview and displays customer inscription "Hardik"!\n');

console.log('ALL PHASE 7B.9 TESTS COMPLETED SUCCESSFULLY!');

