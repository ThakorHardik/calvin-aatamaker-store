import assert from 'node:assert';
import {
  evaluateModelReadiness,
  encodeChecklistInNotes,
  parseChecklistFromNotes,
} from '../lib/3d/model-readiness.ts';

console.log('=== CALVIN AATAMAKER — PHASE 7B MODEL READINESS SUITE ===\n');

// 1. Incomplete Draft Model (0 / 7 Criteria)
const draftResult = evaluateModelReadiness({
  glb_storage_path: null,
  front_mesh_name: '',
  dimensions_mm: null,
  surface: null,
  validation_notes: '',
});

assert.strictEqual(draftResult.isReadyForPublishing, false, 'Draft model must not be ready for publishing');
assert.strictEqual(draftResult.completedCount, 0, 'Draft model should have 0 completed items');
assert.strictEqual(draftResult.missingItems.length, 7, 'All 7 criteria must be reported missing');
console.log('[TEST 1] Incomplete Draft Model: Properly blocked from publishing (0/7 criteria met)');

// 2. Partial Model (GLB uploaded and front mesh identified, but no measurements or factory sign-off)
const partialResult = evaluateModelReadiness({
  glb_storage_path: 'models/calvin-classic-v1.glb',
  front_mesh_name: 'Front_Print_Surface',
  dimensions_mm: { width: 480, height: 880, depth: 340 },
  surface: {
    physical_width_mm: 380,
    physical_height_mm: 620,
    safe_margin_top_mm: 15,
    safe_margin_bottom_mm: 25,
    fixed_branding_overlay: {
      enabled: true,
      locked: true,
      brand_text: 'CALVIN',
      width_mm: 120,
      height_mm: 30,
    },
  },
  validation_notes: '',
  manual_checks: {
    measurements_verified: false,
    uv_mapping_checked: false,
    factory_validation_completed: false,
  },
});

assert.strictEqual(partialResult.isReadyForPublishing, false, 'Partial model must not be ready for publishing');
assert.strictEqual(partialResult.checklist.glb_uploaded, true, 'GLB must be detected as uploaded');
assert.strictEqual(partialResult.checklist.front_mesh_identified, true, 'Front mesh must be detected as identified');
assert.strictEqual(partialResult.checklist.printable_boundaries_verified, true, 'Printable boundaries must be verified');
assert.strictEqual(partialResult.checklist.calvin_branding_approved, true, 'CALVIN branding must be approved');
assert.strictEqual(partialResult.checklist.measurements_verified, false, 'Unverified measurements must fail');
assert.strictEqual(partialResult.checklist.uv_mapping_checked, false, 'Unchecked UV mapping must fail');
assert.strictEqual(partialResult.checklist.factory_validation_completed, false, 'Missing factory sign-off must fail');
assert.strictEqual(partialResult.completedCount, 4, 'Should have exactly 4 automated criteria satisfied');
console.log('[TEST 2] Partial Model: Auto-detects 4 criteria, strictly blocks publishing without manual sign-offs (4/7)');

// 3. Fully Verified Model (7 / 7 Criteria Satisfied)
const completeResult = evaluateModelReadiness({
  glb_storage_path: 'models/calvin-classic-v1.glb',
  front_mesh_name: 'Front_Print_Surface',
  dimensions_mm: { width: 480, height: 880, depth: 340 },
  surface: {
    physical_width_mm: 380,
    physical_height_mm: 620,
    safe_margin_top_mm: 15,
    safe_margin_bottom_mm: 25,
    fixed_branding_overlay: {
      enabled: true,
      locked: true,
      brand_text: 'CALVIN',
      width_mm: 120,
      height_mm: 30,
    },
  },
  validation_notes: 'Physical dimensions verified on 2026-11-03 with caliper. Factory batch sign-off complete.',
  manual_checks: {
    measurements_verified: true,
    uv_mapping_checked: true,
    factory_validation_completed: true,
  },
});

assert.strictEqual(completeResult.isReadyForPublishing, true, 'Complete model must be ready for publishing');
assert.strictEqual(completeResult.completedCount, 7, 'All 7 criteria must be satisfied');
assert.strictEqual(completeResult.missingItems.length, 0, 'No missing items should remain');
console.log('[TEST 3] Fully Verified Model: Approved for storefront publishing (7/7 criteria satisfied)');

// 4. Checklist Encoding & Parsing in Validation Notes
const originalNotes = 'Batch 101 sample inspection passed.';
const encoded = encodeChecklistInNotes(originalNotes, {
  measurements_verified: true,
  uv_mapping_checked: true,
  factory_validation_completed: true,
});

assert(encoded.includes('Batch 101 sample inspection passed.'), 'Original human notes preserved');
assert(encoded.includes('[CHECKLIST:'), 'Checklist tag present');

const parsed = parseChecklistFromNotes(encoded);
assert.strictEqual(parsed.measurements_verified, true, 'Parsed measurements_verified');
assert.strictEqual(parsed.uv_mapping_checked, true, 'Parsed uv_mapping_checked');
assert.strictEqual(parsed.factory_validation_completed, true, 'Parsed factory_validation_completed');
console.log('[TEST 4] Notes Encoding/Parsing: Lossless serialization and deserialization in validation_notes');

// 5. Invalid File Extension Blocked
const invalidGlb = evaluateModelReadiness({
  glb_storage_path: 'models/something.obj',
  front_mesh_name: 'Front_Print_Surface',
  dimensions_mm: { width: 480, height: 880, depth: 340 },
});
assert.strictEqual(invalidGlb.checklist.glb_uploaded, false, 'Non-GLB asset must be rejected');
console.log('[TEST 5] Asset Integrity: Non-GLB file format rejected');

console.log('\n========================================================');
console.log('ALL PHASE 7B MODEL READINESS UNIT TESTS PASSED CLEANLY!');
console.log('========================================================');
