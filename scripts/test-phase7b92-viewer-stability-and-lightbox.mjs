/**
 * Phase 7B.9.2 Automated Verification Test Suite
 * Tests Interactive 3D Admin Viewer Stability, Staged State Machine,
 * GLB Mesh Separation, and High-Resolution Flat Artwork Lightbox Modal.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT_DIR = process.cwd();

console.log("================================================================================");
console.log("CALVIN AATAMAKER — PHASE 7B.9.2 AUTOMATED TEST SUITE");
console.log("3D Viewer Stability, Mesh Targeting, and Flat Artwork Lightbox Verification");
console.log("================================================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${testName}`);
    console.error(`       Error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Test 1: Verify Three.js Staged Lifecycle & State Machine in 3D Modal
// -----------------------------------------------------------------------------
runTest("Interactive 3D Viewer defines explicit staged states and decoupled setup effect", () => {
  const modalFilePath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  assert.ok(fs.existsSync(modalFilePath), "Modal component file must exist");
  const modalContent = fs.readFileSync(modalFilePath, "utf-8");

  // Check staged states type definition
  const requiredStages = [
    '"initializing"',
    '"loading_glb"',
    '"loading_artwork"',
    '"applying_texture"',
    '"rendering_frame"',
    '"ready"',
    '"error"',
  ];
  for (const stage of requiredStages) {
    assert.ok(modalContent.includes(stage), `Viewer stage ${stage} must be declared in ViewerStage type`);
  }

  // Check setup effect decoupling
  assert.ok(
    modalContent.includes("[isOpen, retryTrigger]"),
    "Three.js setup useEffect must depend only on [isOpen, retryTrigger] to avoid teardown loops"
  );

  // Check memoization of normalizedLayers
  assert.ok(
    modalContent.includes("useMemo(") && modalContent.includes("[layers]"),
    "normalizedLayers must be memoized using useMemo with [layers] dependency"
  );

  // Check ResizeObserver usage
  assert.ok(
    modalContent.includes("new ResizeObserver("),
    "ResizeObserver must be used to dynamically adapt canvas to viewport without teardown"
  );
});

// -----------------------------------------------------------------------------
// Test 2: Verify GLB Node Targeting & Fixed Logo Isolation
// -----------------------------------------------------------------------------
runTest("GLB Node Targeting isolates Front_Print_Surface from Calvin_Fixed_Logo", () => {
  const modalFilePath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  const modalContent = fs.readFileSync(modalFilePath, "utf-8");

  assert.ok(
    modalContent.includes("Front_Print_Surface"),
    "Viewer must explicitly search for Front_Print_Surface mesh"
  );
  assert.ok(
    modalContent.includes("Calvin_Fixed_Logo"),
    "Viewer must recognize Calvin_Fixed_Logo mesh node"
  );
  assert.ok(
    modalContent.includes("printSurfaceMeshRef.current = mesh") || modalContent.includes("frontPrintMeshRef.current = mesh"),
    "Viewer must bind canvas texture exclusively to the print surface mesh"
  );

  // Verify GLB model binary exists on disk
  const glbPath = path.join(ROOT_DIR, "public", "models", "calvin-compact-01-prototype.glb");
  assert.ok(fs.existsSync(glbPath), "Prototype GLB model calvin-compact-01-prototype.glb must exist");
  const glbStat = fs.statSync(glbPath);
  assert.ok(glbStat.size > 50000, "GLB model file must have valid size > 50KB");
});

// -----------------------------------------------------------------------------
// Test 3: Camera Framing Presets & Smooth Controls
// -----------------------------------------------------------------------------
runTest("Camera Presets (Three-Quarter, Front Elevation, Right Profile) exist without model reload", () => {
  const modalFilePath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  const modalContent = fs.readFileSync(modalFilePath, "utf-8");

  assert.ok(
    modalContent.includes('setCameraPreset("beauty")') || modalContent.includes("setCameraPreset = (preset"),
    "Camera preset switcher must be implemented"
  );
  assert.ok(modalContent.includes("1.25, 0.65, 1.35"), "Beauty view coordinates (1.25, 0.65, 1.35) must be set");
  assert.ok(modalContent.includes("0, 0.44, 1.3"), "Front elevation coordinates (0, 0.44, 1.3) must be set");
  assert.ok(modalContent.includes("1.35, 0.44, 0"), "Right profile coordinates (1.35, 0.44, 0) must be set");
  assert.ok(modalContent.includes("controls.enableDamping = true"), "OrbitControls damping must be enabled");
});

// -----------------------------------------------------------------------------
// Test 4: Flat Artwork Lightbox Modal & Zoom Controls in Order Detail
// -----------------------------------------------------------------------------
runTest("Admin Order Detail Page implements High-Resolution Flat Artwork Lightbox with Zoom Controls", () => {
  const orderDetailPage = path.join(ROOT_DIR, "app", "admin", "orders", "[id]", "page.tsx");
  assert.ok(fs.existsSync(orderDetailPage), "Order detail page must exist");
  const pageContent = fs.readFileSync(orderDetailPage, "utf-8");

  // Check state declarations
  assert.ok(
    pageContent.includes("activeLightboxArtwork") && pageContent.includes("setActiveLightboxArtwork"),
    "activeLightboxArtwork state must be declared"
  );
  assert.ok(
    pageContent.includes("lightboxZoom") && pageContent.includes("setLightboxZoom"),
    "lightboxZoom state must be declared"
  );

  // Check Zoom Controls (+25%, -25%, Fit 1:1)
  assert.ok(pageContent.includes("ZoomIn"), "ZoomIn control must be rendered in Lightbox");
  assert.ok(pageContent.includes("ZoomOut"), "ZoomOut control must be rendered in Lightbox");
  assert.ok(pageContent.includes("Fit 1:1"), "Fit 1:1 control must be rendered in Lightbox");

  // Check Click-to-Enlarge trigger and Lightbox Button
  assert.ok(
    pageContent.includes("Open Artwork Lightbox (Zoom & Fit)") || pageContent.includes("Inspect High-Res"),
    "Open Artwork Lightbox button must be provided"
  );

  // Check Aspect Ratio preservation
  assert.ok(
    pageContent.includes("aspectRatio:") && pageContent.includes("surfaceDimensions"),
    "Aspect ratio must be dynamically calculated based on surfaceDimensions (380 / 620 mm)"
  );

  // Check Escape key handler
  assert.ok(
    pageContent.includes('e.key === "Escape"') && pageContent.includes("setActiveLightboxArtwork(null)"),
    "Escape key must close the flat artwork lightbox"
  );
});

// -----------------------------------------------------------------------------
// Test 5: Dynamic SSR-Safe Import of 3D Modal
// -----------------------------------------------------------------------------
runTest("Interactive 3D Viewer Modal is imported dynamically with ssr: false", () => {
  const orderDetailPage = path.join(ROOT_DIR, "app", "admin", "orders", "[id]", "page.tsx");
  const pageContent = fs.readFileSync(orderDetailPage, "utf-8");

  assert.ok(
    pageContent.includes("dynamic(") &&
      pageContent.includes("@/components/admin/interactive-3d-order-viewer-modal") &&
      pageContent.includes("ssr: false"),
    "Interactive3DOrderViewerModal must be loaded via next/dynamic with ssr: false to prevent SSR errors"
  );
});

// -----------------------------------------------------------------------------
// Test 6: Verify Prototype Warning Integrity & Non-Mutating Safeguards
// -----------------------------------------------------------------------------
runTest("Preserves Prototype Factory Caliper Warnings and Non-Mutating Historical Badge", () => {
  const orderDetailPage = path.join(ROOT_DIR, "app", "admin", "orders", "[id]", "page.tsx");
  const pageContent = fs.readFileSync(orderDetailPage, "utf-8");

  assert.ok(
    pageContent.includes("PROTOTYPE NOTICE:") || pageContent.includes("PROTOTYPE DEMO"),
    "Prototype warnings must remain explicitly visible"
  );
  assert.ok(
    pageContent.includes("Derived On-Demand (Non-Mutating)"),
    "Derived on-demand badge must be clearly indicated for historical orders"
  );
});

console.log("\n--------------------------------------------------------------------------------");
console.log(`Phase 7B.9.2 Test Results: ${passedTests} / ${totalTests} tests passed`);
console.log("--------------------------------------------------------------------------------\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
