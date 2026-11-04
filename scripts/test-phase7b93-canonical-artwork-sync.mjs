/**
 * Phase 7B.9.3 Automated Verification Test Suite
 * Tests Exact Canonical Artwork Synchronization Between 2D Flat Artwork and 3D Machine Model,
 * Storage Path Token Expiration Immunity, CORS Preflight Configuration, and Brand Mesh Alignment.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT_DIR = process.cwd();

console.log("================================================================================");
console.log("CALVIN AATAMAKER — PHASE 7B.9.3 AUTOMATED TEST SUITE");
console.log("Canonical Artwork to 3D Synchronization & Asset Resiliency Verification");
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

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${testName}`);
    console.error(`       Error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Test 1: Storage Assets Dynamic Signed URL Extraction & Expiration Immunity
// -----------------------------------------------------------------------------
await runAsyncTest("resolveCustomizationAssetUrl extracts permanent path from expired signed URLs", async () => {
  const { resolveCustomizationAssetUrl, isPermanentStoragePath } = await import("../lib/3d/storage-assets.ts");

  // Sample expired signed URL from Supabase Storage
  const expiredSignedUrl =
    "https://mshjafebtbbhsmotnvdq.supabase.co/storage/v1/object/sign/customer-customizations/b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJjdXN0b21lci1jdXN0b21pemF0aW9ucy9iMDFmY2QyYS0zNmI2LTRkZWYtYTg2Yi01MmU0NzA3YzIzOTUvcGhvdG9zLzE3OTM3Mzc5MDIwMDBfOGJjZDNhMTIuanBnIiwiaWF0IjoxNzkzNzM3OTA2LCJleHAiOjE3OTM3NDE1MDZ9.signature";

  const resolved = resolveCustomizationAssetUrl(expiredSignedUrl);
  assert.equal(
    resolved,
    "/api/customizations/upload?path=b01fcd2a-36b6-4def-a786-52e4707c2395%2Fphotos%2F1793737902000_8bcd3a12.jpg",
    "Expired signed URL must be translated into fresh server endpoint query with clean relative path"
  );

  // Raw storage path
  const rawPath = "b01fcd2a-36b6-4def-a786-52e4707c2395/photos/photo.jpg";
  const resolvedRaw = resolveCustomizationAssetUrl(rawPath);
  assert.equal(
    resolvedRaw,
    "/api/customizations/upload?path=b01fcd2a-36b6-4def-a786-52e4707c2395%2Fphotos%2Fphoto.jpg"
  );

  // Guest token inclusion
  const guestResolved = resolveCustomizationAssetUrl(rawPath, "guest-tok-123");
  assert.ok(guestResolved.includes("guestToken=guest-tok-123"));

  // Preserves inline data URIs and external non-Supabase URLs
  assert.equal(resolveCustomizationAssetUrl("data:image/png;base64,abc"), "data:image/png;base64,abc");
  assert.equal(resolveCustomizationAssetUrl("https://example.com/art.png"), "https://example.com/art.png");

  // isPermanentStoragePath validation
  assert.equal(isPermanentStoragePath("b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg"), true);
  assert.equal(isPermanentStoragePath("guests/guest-123/previews/preview.jpg"), true);
  assert.equal(isPermanentStoragePath("https://some.domain/test.jpg"), false);
  assert.equal(isPermanentStoragePath("data:image/png;base64,..."), false);
});

// -----------------------------------------------------------------------------
// Test 2: Customization Upload API CORS Preflight & Redirect Headers
// -----------------------------------------------------------------------------
runTest("Upload API route provides OPTIONS preflight and CORS headers for cross-origin assets", () => {
  const uploadRoutePath = path.join(ROOT_DIR, "app", "api", "customizations", "upload", "route.ts");
  assert.ok(fs.existsSync(uploadRoutePath), "Upload route file must exist");
  const content = fs.readFileSync(uploadRoutePath, "utf-8");

  assert.ok(content.includes("export async function OPTIONS()"), "OPTIONS preflight handler must be exported");
  assert.ok(
    content.includes('"Access-Control-Allow-Origin": "*"'),
    "Access-Control-Allow-Origin must be set on preflight and redirect responses"
  );
  assert.ok(
    content.includes('"Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS"'),
    "CORS allowed methods must include GET, HEAD, POST, OPTIONS"
  );
  assert.ok(
    content.includes("createAdminClient"),
    "Upload route must use createAdminClient for secure signing of private customization assets"
  );
});

// -----------------------------------------------------------------------------
// Test 3: Admin 3D Viewer Single Canonical Artwork Source Architecture
// -----------------------------------------------------------------------------
runTest("Admin 3D Viewer accepts artworkUrl prop and prioritizes canonical flat artwork", () => {
  const modalPath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  assert.ok(fs.existsSync(modalPath), "Modal component file must exist");
  const content = fs.readFileSync(modalPath, "utf-8");

  // Accepts artworkUrl prop
  assert.ok(content.includes("artworkUrl?: string;"), "Interactive3DOrderViewerModalProps must define artworkUrl");

  // Uses artworkUrl as canonicalDataUrl
  assert.ok(
    content.includes("let canonicalDataUrl = artworkUrl || \"\";"),
    "renderDoorTexture must prioritize artworkUrl as canonicalDataUrl"
  );

  // Draws canonical flat artwork to offscreen canvas
  assert.ok(
    content.includes("ctx.drawImage(img, 0, 0, CANVAS_TEX_W, CANVAS_TEX_H)"),
    "Canonical flat artwork must be drawn directly onto the offscreen canvas texture"
  );

  // CrossOrigin set for canvas texture decode
  assert.ok(
    content.includes('img.crossOrigin = "anonymous"'),
    "Cross-origin handling must be configured for image decode"
  );
});

// -----------------------------------------------------------------------------
// Test 4: Logo Mesh Hiding to Prevent Brand Duplication
// -----------------------------------------------------------------------------
runTest("Admin 3D Viewer hides physical Calvin_Fixed_Logo mesh when canonical artwork is active", () => {
  const modalPath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  const content = fs.readFileSync(modalPath, "utf-8");

  assert.ok(
    content.includes('mesh.name === "Calvin_Fixed_Logo"') &&
    content.includes("mesh.visible = false;"),
    "Calvin_Fixed_Logo mesh node must be hidden so the canonical flat artwork provides single brand logo"
  );

  assert.ok(
    content.includes('mesh.name === "Front_Print_Surface"') &&
    content.includes("map: printTexture"),
    "Front_Print_Surface must receive the offscreen CanvasTexture"
  );
});

// -----------------------------------------------------------------------------
// Test 5: Layer Normalization Storage Path Priority
// -----------------------------------------------------------------------------
runTest("Layer normalization prioritizes permanent storagePath over ephemeral imageUrl", () => {
  const modalPath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  const content = fs.readFileSync(modalPath, "utf-8");

  assert.ok(
    content.includes("storagePath && isPermanentStoragePath(storagePath)"),
    "normalizedLayers must verify isPermanentStoragePath before falling back to imageUrl"
  );
  assert.ok(
    content.includes("resolveCustomizationAssetUrl(rawUrl)"),
    "normalizedLayers must run rawUrl through resolveCustomizationAssetUrl"
  );
});

// -----------------------------------------------------------------------------
// Test 6: Admin Order Detail Integration Passes Canonical Artwork
// -----------------------------------------------------------------------------
runTest("Admin Order Detail page connects derived canonical artwork to 3D modal", () => {
  const orderDetailPage = path.join(ROOT_DIR, "app", "admin", "orders", "[id]", "page.tsx");
  assert.ok(fs.existsSync(orderDetailPage), "Order detail page must exist");
  const content = fs.readFileSync(orderDetailPage, "utf-8");

  assert.ok(
    content.includes("artworkUrl={") && content.includes("derivedArtworkMap[active3DModalItem.id]"),
    "OrderDetailPage must supply derived artworkUrl to Interactive3DOrderViewerModal"
  );
  assert.ok(
    content.includes("deriveFlatArtworkForItem"),
    "OrderDetailPage must use deriveFlatArtworkForItem to generate high-fidelity artwork data URL"
  );
});

// -----------------------------------------------------------------------------
// Test 7: Canonical Artwork Module Geometry & Aspect Parity
// -----------------------------------------------------------------------------
runTest("Canonical artwork renderer maintains 1024x1670 canvas aspect ratio (0.613)", () => {
  const canonicalArtPath = path.join(ROOT_DIR, "lib", "3d", "canonical-artwork.ts");
  assert.ok(fs.existsSync(canonicalArtPath), "Canonical artwork generator must exist");
  const content = fs.readFileSync(canonicalArtPath, "utf-8");

  assert.ok(
    content.includes("CANONICAL_ARTWORK_WIDTH = 1024") &&
    content.includes("CANONICAL_ARTWORK_HEIGHT = 1670"),
    "Canonical dimensions must be 1024x1670 matching the physical 380x620mm front panel ratio"
  );
  assert.ok(
    content.includes("renderCanonicalFlatArtworkDataUrl"),
    "renderCanonicalFlatArtworkDataUrl function must be exported"
  );
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`PHASE 7B.9.3 TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
console.log("================================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log("All Phase 7B.9.3 tests PASSED successfully.");
}
