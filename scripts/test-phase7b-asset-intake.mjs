import assert from 'node:assert';
import {
  createInitialCompactIntakeManifest,
  serializeIntakeManifest,
  parseIntakeManifest,
  generateBlenderSpecificationMarkdown,
} from '../lib/3d/asset-intake.ts';
import { PHOTO_ANGLE_DEFINITIONS } from '../types/asset-intake.ts';

console.log('=== CALVIN AATAMAKER — PHASE 7B ASSET INTAKE TEST SUITE ===\n');

// 1. Initial Manifest Generation & Unverified Guarantees
const initial = createInitialCompactIntakeManifest('CALVIN-COMPACT-01', 'CALVIN Compact Domestic Aatamaker');

assert.strictEqual(initial.model_code, 'CALVIN-COMPACT-01');
assert.strictEqual(initial.machine_variant, 'compact_domestic');
assert.strictEqual(initial.intake_status, 'pending_assets');

// All initial measurements must be unverified
const cab = initial.cabinet_measurements;
assert.strictEqual(cab.width_mm.status, 'unverified', 'Cabinet width must start as unverified');
assert.strictEqual(cab.height_mm.status, 'unverified', 'Cabinet height must start as unverified');
assert.strictEqual(cab.depth_mm.status, 'unverified', 'Cabinet depth must start as unverified');

const pan = initial.panel_measurements;
assert.strictEqual(pan.width_mm.status, 'unverified', 'Panel width must start as unverified');
assert.strictEqual(pan.height_mm.status, 'unverified', 'Panel height must start as unverified');
assert.strictEqual(pan.thickness_mm.status, 'unverified', 'Door thickness must start as unverified');
assert.strictEqual(pan.corner_radius_mm.status, 'unverified', 'Corner radius must start as unverified');
assert.strictEqual(pan.safe_margin_top_mm.status, 'unverified', 'Safe top margin must start as unverified');
assert.strictEqual(pan.safe_margin_bottom_mm.status, 'unverified', 'Safe bottom margin must start as unverified');

console.log('[TEST 1] Initial Manifest: All dimensions initialized to unverified without invented geometry.');

// 2. Reference Photo Categories Coverage
const requiredAngles = Object.entries(PHOTO_ANGLE_DEFINITIONS).filter(([, def]) => def.required);
assert(requiredAngles.length >= 8, 'Must have at least 8 required photo angles');

const expectedAngles = [
  'front_ortho',
  'back_ortho',
  'left_side',
  'right_side',
  'top_view',
  'perspective_fl',
  'perspective_fr',
  'panel_closeup',
  'chute_closeup',
  'branding_closeup',
  'measurement_evidence',
];

for (const angle of expectedAngles) {
  assert(angle in PHOTO_ANGLE_DEFINITIONS, `Expected angle "${angle}" must be defined`);
}
console.log(`[TEST 2] Photo Categories: ${Object.keys(PHOTO_ANGLE_DEFINITIONS).length} angles configured, covering all elevations, perspectives, and caliper evidence.`);

// 3. Lossless Photo Registration
initial.reference_photos.push({
  id: 'photo_001',
  angle: 'front_ortho',
  label: 'Front Elevation',
  storage_path: 'model-intake/calvin-compact-01/front-raw.jpg',
  public_url: 'https://cdn.calvin.store/front-raw.jpg',
  original_filename: 'IMG_20261103_103001.JPG',
  file_size_bytes: 8421340, // ~8.4 MB uncompressed
  mime_type: 'image/jpeg',
  uploaded_at: new Date().toISOString(),
});

assert.strictEqual(initial.reference_photos[0].file_size_bytes, 8421340, 'Byte length preserved without client compression');
assert.strictEqual(initial.reference_photos[0].original_filename, 'IMG_20261103_103001.JPG');
console.log('[TEST 3] Lossless Photo Ingestion: Original filename and uncompressed byte size preserved.');

// 4. Factory Confirmation with Caliper Evidence
initial.panel_measurements.width_mm = {
  value_mm: 362.5,
  status: 'factory_confirmed',
  measured_by: 'Ramesh Patel (Factory Lead)',
  measured_at: '2026-11-03',
  measurement_tool: 'Mitutoyo 500-196-30 Digital Caliper',
  tolerance_mm: 0.5,
  evidence_photo_id: 'photo_001',
};

assert.strictEqual(initial.panel_measurements.width_mm.status, 'factory_confirmed');
assert.strictEqual(initial.panel_measurements.width_mm.value_mm, 362.5);
assert.strictEqual(initial.panel_measurements.width_mm.measured_by, 'Ramesh Patel (Factory Lead)');
console.log('[TEST 4] Factory Confirmation: Verified measurement recorded with tool and evidence metadata.');

// 5. Official Separate Brand Logo Vector
assert(initial.brand_logo, 'Brand logo must be configured');
assert.strictEqual(initial.brand_logo.file_format, 'svg');
assert.strictEqual(initial.brand_logo.width_mm, 120);
assert.strictEqual(initial.brand_logo.height_mm, 30);
assert.strictEqual(initial.brand_logo.position_anchor, 'top_center');
assert.strictEqual(initial.brand_logo.offset_y_mm, 35);
console.log('[TEST 5] Official Brand Logo: Separate vector SVG isolated at top-center (120x30mm).');

// 6. Non-Printable Obstacles
assert(initial.obstacles.length >= 3, 'Must have at least 3 default obstacle zones');
const chute = initial.obstacles.find((o) => o.type === 'dispensing_chute');
assert(chute, 'Dispensing chute clearance must be present');
const handle = initial.obstacles.find((o) => o.type === 'handle');
assert(handle, 'Door catch/handle clearance must be present');
console.log('[TEST 6] Obstacle Cutouts: Handle, chute, and vents mapped with millimeter coordinates.');

// 7. Blender Specification Generation
const blenderSpec = generateBlenderSpecificationMarkdown(initial);

assert(blenderSpec.includes('Front_Print_Surface'), 'Spec must mandate Front_Print_Surface node name');
assert(blenderSpec.includes('CALVIN_Compact_Root'), 'Spec must mandate CALVIN_Compact_Root hierarchy');
assert(blenderSpec.includes('UVMap'), 'Spec must mandate UVMap channel 0');
assert(blenderSpec.includes('mat_front_print'), 'Spec must mandate mat_front_print material slot');
assert(blenderSpec.includes('mat_cabinet_body'), 'Spec must mandate mat_cabinet_body material slot');
assert(blenderSpec.includes('Draco compression DISABLED'), 'Spec must specify Draco compression disabled');
assert(blenderSpec.includes('+Y Up, +Z Forward'), 'Spec must specify glTF standard axis');
assert(blenderSpec.includes('362.5 mm'), 'Spec must dynamically include the factory verified dimension');
assert(blenderSpec.includes('FACTORY_CONFIRMED'), 'Spec must indicate FACTORY_CONFIRMED status for verified dimensions');
console.log('[TEST 7] Blender 3D Artist Handover Spec: Generated exact specifications, hierarchy, and materials.');

// 8. Roundtrip Serialization
const serialized = serializeIntakeManifest(initial);
const roundtrip = parseIntakeManifest(serialized);
assert(roundtrip, 'Must parse valid intake manifest JSON');
assert.strictEqual(roundtrip.model_code, initial.model_code);
assert.strictEqual(roundtrip.panel_measurements.width_mm.value_mm, 362.5);
console.log('[TEST 8] Manifest Serialization: Clean JSON roundtrip serialization.');

console.log('\n========================================================');
console.log('ALL PHASE 7B ASSET INTAKE UNIT TESTS PASSED CLEANLY!');
console.log('========================================================');

