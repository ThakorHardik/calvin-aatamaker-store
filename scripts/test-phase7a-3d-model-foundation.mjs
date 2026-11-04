/**
 * CALVIN AATAMAKER — Phase 7A: 3D Model Foundation & Canonical Design Test Suite
 * 
 * Verifies:
 * 1. Normalized 2D coordinate space mapping (mm <-> normalized).
 * 2. Protected CALVIN branding box calculation and collision detection.
 * 3. Artwork placement rejection when overlapping the protected brand zone.
 * 4. Safe margin boundary validation.
 * 5. Design history manager (undo/redo stack).
 * 6. Printer-independent manufacturing master generation.
 * 7. Strict export blocking when printing technology/substrate are unapproved.
 */

import {
  mmToNormalized,
  normalizedToMm,
  computeNormalizedBrandingBox,
  doBoxesOverlap,
  isPlacementSafeFromProtectedBranding,
  isWithinSafeMargins,
  DesignHistoryManager,
} from "../lib/3d/canonical-design.ts";

import {
  buildPrinterIndependentMaster,
  validateDesignForArchival,
} from "../lib/3d/manufacturing-master.ts";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

console.log("=== CALVIN AATAMAKER — PHASE 7A UNIT TEST SUITE ===");

// 1. Normalized 2D Coordinate System
console.log("\n[TEST 1] Coordinate Normalization & Denormalization");
const surfaceWidthMm = 380;
const surfaceHeightMm = 620;

const normX = mmToNormalized(190, surfaceWidthMm);
assert(Math.abs(normX - 0.5) < 0.0001, "190mm on 380mm surface normalizes to exactly 0.5");

const denormMm = normalizedToMm(0.5, surfaceWidthMm);
assert(Math.abs(denormMm - 190) < 0.0001, "0.5 normalized value returns 190mm");

// 2. Protected CALVIN Branding Calculation
console.log("\n[TEST 2] Protected CALVIN Branding Envelope");
const testBranding = {
  enabled: true,
  locked: true,
  brand_text: "CALVIN",
  position: "top_center",
  offset_x_mm: 0,
  offset_y_mm: 35,
  width_mm: 120,
  height_mm: 30,
};

const brandBox = computeNormalizedBrandingBox(testBranding, surfaceWidthMm, surfaceHeightMm);
assert(brandBox.width > 0 && brandBox.height > 0, "Branding box has positive normalized dimensions");
assert(doBoxesOverlap(brandBox, brandBox) === true, "doBoxesOverlap correctly detects self-overlap");
assert(brandBox.x > 0.3 && brandBox.x < 0.4, "Top-center 120mm branding is horizontally centered");
assert(Math.abs(brandBox.y - (35 / 620)) < 0.001, "Top offset correctly normalized to ~0.0565");

// 3. Overlap Collision Enforcement (Branding Protection)
console.log("\n[TEST 3] Protected Branding Collision Detection");
// Conflicting artwork layer directly over the brand mark
const conflictingLayer = {
  x: brandBox.x,
  y: brandBox.y,
  width: brandBox.width,
  height: brandBox.height,
};
const conflictCheck = isPlacementSafeFromProtectedBranding(
  conflictingLayer,
  testBranding,
  surfaceWidthMm,
  surfaceHeightMm
);
assert(conflictCheck.isSafe === false, "Artwork overlapping the CALVIN brand mark is strictly rejected");
assert(conflictCheck.conflictReason.includes("protected"), "Conflict reason explains branding protection");

// Safe artwork layer positioned in the lower canvas
const safeLayer = {
  x: 0.2,
  y: 0.4,
  width: 0.6,
  height: 0.3,
};
const safeCheck = isPlacementSafeFromProtectedBranding(
  safeLayer,
  testBranding,
  surfaceWidthMm,
  surfaceHeightMm
);
assert(safeCheck.isSafe === true, "Artwork outside the brand mark is permitted");

// 4. Safe Printable Margin Validation
console.log("\n[TEST 4] Safe Printable Margins");
const testMargins = {
  top: 15,
  bottom: 25,
  left: 15,
  right: 15,
  bleed: 3,
};

const insideSafeLayer = {
  x: 0.1,
  y: 0.1,
  width: 0.4,
  height: 0.4,
};
const insideCheck = isWithinSafeMargins(
  insideSafeLayer,
  testMargins,
  surfaceWidthMm,
  surfaceHeightMm
);
assert(insideCheck.isWithinSafe === true, "Element within safe boundary is approved");

const outsideSafeLayer = {
  x: 0.01, // Too close to left edge (less than 15mm / 380mm = ~0.039)
  y: 0.1,
  width: 0.5,
  height: 0.4,
};
const outsideCheck = isWithinSafeMargins(
  outsideSafeLayer,
  testMargins,
  surfaceWidthMm,
  surfaceHeightMm
);
assert(outsideCheck.isWithinSafe === false, "Element extending past safe margin raises warning");

// 5. Design History Manager (Undo / Redo)
console.log("\n[TEST 5] Design History State Stack");
const history = new DesignHistoryManager([]);
assert(!history.canUndo(), "Initial state cannot undo");
assert(!history.canRedo(), "Initial state cannot redo");

history.pushState([{ id: "layer-1" }]);
assert(history.canUndo(), "Can undo after 1st action");
assert(!history.canRedo(), "Cannot redo after fresh action");

history.pushState([{ id: "layer-1" }, { id: "layer-2" }]);
assert(history.getState().length === 2, "Current state holds 2 layers");

const undone = history.undo();
assert(undone.length === 1, "Undone state restores 1 layer");
assert(history.canRedo(), "Can redo after undo");

const redone = history.redo();
assert(redone.length === 2, "Redone state restores 2 layers");

// 6. Manufacturing Master Generation & Export Blocking
console.log("\n[TEST 6] Manufacturing Master & Strict Export Lock");
const testModel = {
  id: "model-123",
  product_id: "prod-456",
  model_code: "CALVIN-CLASSIC-01",
  name: "CALVIN Classic Domestic Mill",
  version: 1,
  status: "draft", // Unvalidated draft
  is_active: false,
  dimensions_mm: { width: 480, height: 880, depth: 340 },
  glb_storage_path: null,
  thumbnail_path: null,
  front_mesh_name: "Front_Print_Surface",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const testSurface = {
  id: "surf-789",
  model_id: "model-123",
  surface_key: "front_door_panel",
  surface_name: "Front Door Panel",
  mesh_target_name: "Front_Print_Surface",
  material_slot_name: "mat_front_print",
  physical_width_mm: 380,
  physical_height_mm: 620,
  safe_margins_mm: testMargins,
  fixed_branding: testBranding,
  uv_mapping: {
    uv_channel: 0,
    u_min: 0,
    u_max: 1,
    v_min: 0,
    v_max: 1,
    flip_y: false,
    rotation_deg: 0,
  },
  cutout_zones: [],
  status: "draft",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const customerLayers = [
  {
    id: "photo-1",
    type: "photo",
    name: "Family Crest",
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 1,
    x: 0.25,
    y: 0.35,
    width: 0.5,
    height: 0.3,
    rotationDeg: 0,
    imageUrl: "data:image/png;base64,mock",
    sourceWidthPx: 1200,
    sourceHeightPx: 800,
  },
];

const masterDoc = buildPrinterIndependentMaster({
  model: testModel,
  surface: testSurface,
  layers: customerLayers,
  orderReference: "CA-TEST-ORDER-01",
});

assert(masterDoc.schema_version === "1.0.0", "Master document matches schema 1.0.0");
assert(masterDoc.export_status.is_export_enabled === false, "Production export strictly blocked while model is draft / printing specs pending");
assert(masterDoc.export_status.block_reason.includes("disabled"), "Clear block reason logged in master record");

// 7. Validation for Design Archival
console.log("\n[TEST 7] Design Archival Validation");
const emptyCheck = validateDesignForArchival([]);
assert(emptyCheck.isValid === false, "Empty layers array rejected for archival");

const validCheck = validateDesignForArchival(customerLayers);
assert(validCheck.isValid === true, "Valid customer layers approved for archival");

// SUMMARY
console.log("\n========================================================");
console.log(`TOTAL TESTS RUN: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log("========================================================");

if (failed > 0) {
  process.exit(1);
}
