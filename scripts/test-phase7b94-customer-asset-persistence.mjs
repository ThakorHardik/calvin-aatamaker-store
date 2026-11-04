/**
 * Phase 7B.9.4 Automated Verification Test Suite
 * Tests Persistent Customer Asset Restoration, Bucket-Aware Path Parsing,
 * Guest Token Scoping & Authorization, and Admin 3D Viewer Runtime Repair.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT_DIR = process.cwd();

console.log("================================================================================");
console.log("CALVIN AATAMAKER — PHASE 7B.9.4 AUTOMATED TEST SUITE");
console.log("Customer Image Persistence & 3D Viewer Runtime Repair Verification");
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
// Test 1: Bucket-Aware Storage Path Extractor (extractStoragePath)
// -----------------------------------------------------------------------------
await runAsyncTest("extractStoragePath extracts permanent relative paths from various URL formats", async () => {
  const { extractStoragePath, isPermanentStoragePath } = await import("../lib/3d/storage-assets.ts");

  // 1. Supabase signed URL with expired token
  const signedUrl =
    "https://mshjafebtbbhsmotnvdq.supabase.co/storage/v1/object/sign/customer-customizations/b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg?token=eyJhbGciOiJIUzI1NiJ9.expired";
  assert.equal(
    extractStoragePath(signedUrl),
    "b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg",
    "Must extract clean relative path from Supabase signed URL"
  );

  // 2. Supabase public URL
  const publicUrl =
    "https://mshjafebtbbhsmotnvdq.supabase.co/storage/v1/object/public/customer-customizations/guests/gst-alpha12345/photos/sample.png";
  assert.equal(
    extractStoragePath(publicUrl),
    "guests/gst-alpha12345/photos/sample.png",
    "Must extract clean relative path from Supabase public URL"
  );

  // 3. API proxy URL
  const apiUrl =
    "/api/customizations/upload?path=guests%2Fgst-alpha12345%2Fphotos%2Fsample.png&guestToken=gst-alpha12345";
  assert.equal(
    extractStoragePath(apiUrl),
    "guests/gst-alpha12345/photos/sample.png",
    "Must extract clean relative path from /api/customizations/upload proxy query"
  );

  // 4. Raw storage path
  const rawPath = "b01fcd2a-36b6-4def-a786-52e4707c2395/photos/image.jpg";
  assert.equal(extractStoragePath(rawPath), rawPath, "Must pass through already-valid storage paths");

  // 5. Non-storage URLs (data URI, blob URI, external URL)
  assert.equal(extractStoragePath("data:image/png;base64,abc"), null);
  assert.equal(extractStoragePath("blob:http://localhost:3000/123-456"), null);
  assert.equal(extractStoragePath("https://external-cdn.com/asset.png"), null);
  assert.equal(extractStoragePath(""), null);
  assert.equal(extractStoragePath(null), null);

  // 6. isPermanentStoragePath verification
  assert.equal(isPermanentStoragePath("guests/gst-9876543210abcdef/photos/photo.webp"), true);
  assert.equal(isPermanentStoragePath("b01fcd2a-36b6-4def-a786-52e4707c2395/previews/preview.png"), true);
  assert.equal(isPermanentStoragePath("b01fcd2a-36b6-4def-a786-52e4707c2395/artwork/flat.png"), true);
  assert.equal(isPermanentStoragePath("malicious/folder/path.exe"), false);
});

// -----------------------------------------------------------------------------
// Test 2: Fresh Authorized URL Resolution & Guest Token Embedding
// -----------------------------------------------------------------------------
await runAsyncTest("resolveCustomizationAssetUrl translates expired URLs and embeds guest token", async () => {
  const { resolveCustomizationAssetUrl } = await import("../lib/3d/storage-assets.ts");

  // Expired guest photo URL
  const expiredGuestUrl =
    "https://mshjafebtbbhsmotnvdq.supabase.co/storage/v1/object/sign/customer-customizations/guests/gst-user12345678/photos/photo.jpg?token=expired";
  const resolvedGuest = resolveCustomizationAssetUrl(expiredGuestUrl);
  assert.equal(
    resolvedGuest,
    "/api/customizations/upload?path=guests%2Fgst-user12345678%2Fphotos%2Fphoto.jpg&guestToken=gst-user12345678",
    "Must automatically extract guest token from guests/<token>/... path segment"
  );

  // Authenticated customer photo path with explicit guest token override
  const authPath = "b01fcd2a-36b6-4def-a786-52e4707c2395/photos/custom.jpg";
  const resolvedAuth = resolveCustomizationAssetUrl(authPath);
  assert.equal(
    resolvedAuth,
    "/api/customizations/upload?path=b01fcd2a-36b6-4def-a786-52e4707c2395%2Fphotos%2Fcustom.jpg"
  );

  // Preserves active local data/blob URIs for immediate UI rendering
  assert.equal(resolveCustomizationAssetUrl("blob:http://localhost:3000/temp"), "blob:http://localhost:3000/temp");
  assert.equal(resolveCustomizationAssetUrl("data:image/png;base64,data"), "data:image/png;base64,data");
});

// -----------------------------------------------------------------------------
// Test 3: Admin 3D Viewer ReferenceError Fix (targetCenter repaired)
// -----------------------------------------------------------------------------
runTest("Admin 3D Viewer defines TARGET_CENTER and eliminates undefined targetCenter references", () => {
  const modalPath = path.join(ROOT_DIR, "components", "admin", "interactive-3d-order-viewer-modal.tsx");
  assert.ok(fs.existsSync(modalPath), "Viewer modal component file must exist");
  const content = fs.readFileSync(modalPath, "utf-8");

  // Constant declaration
  assert.ok(
    content.includes("const TARGET_CENTER = new THREE.Vector3(0, 0.44, 0);"),
    "TARGET_CENTER must be declared as a module-level constant vector"
  );

  // No lingering targetCenter in dependency arrays or local references
  assert.ok(
    !content.includes("targetCenter"),
    "There must be zero occurrences of lowercase targetCenter to prevent ReferenceError"
  );

  // Setup effect dependency array strictly [isOpen, retryTrigger]
  assert.ok(
    content.includes("}, [isOpen, retryTrigger]);"),
    "Three.js setup effect must depend strictly on [isOpen, retryTrigger]"
  );

  // Preserves renderDoorTextureRef
  assert.ok(
    content.includes("const renderDoorTextureRef = useRef(renderDoorTexture);"),
    "renderDoorTextureRef must be maintained to prevent stale closure loops"
  );
});

// -----------------------------------------------------------------------------
// Test 4: 2D Editor Canvas Resilient Image Restoration & Lifecycle
// -----------------------------------------------------------------------------
runTest("2D Editor Canvas implements CanvasPhotoElement with loading, error recovery and guestToken upload", () => {
  const canvasPath = path.join(ROOT_DIR, "components", "customizer", "2d-editor-canvas.tsx");
  assert.ok(fs.existsSync(canvasPath), "2d-editor-canvas.tsx must exist");
  const content = fs.readFileSync(canvasPath, "utf-8");

  // CanvasPhotoElement component
  assert.ok(
    content.includes("function CanvasPhotoElement"),
    "Must implement dedicated CanvasPhotoElement component"
  );

  // Loading and error states
  assert.ok(
    content.includes('loadState === "loading"') && content.includes("Loading..."),
    "CanvasPhotoElement must render loading placeholder state"
  );
  assert.ok(
    content.includes('loadState === "error"') && content.includes("Image unavailable"),
    "CanvasPhotoElement must render non-destructive error state"
  );
  assert.ok(
    content.includes("Retry") && content.includes("setRetryKey"),
    "CanvasPhotoElement must provide retry action to re-fetch asset"
  );

  // Uses resolveCustomizationAssetUrl
  assert.ok(
    content.includes("resolveCustomizationAssetUrl(rawTarget)"),
    "CanvasPhotoElement must resolve image source through resolveCustomizationAssetUrl"
  );

  // GuestToken sent on upload
  assert.ok(
    content.includes("const guestToken = getOrCreateGuestToken();") &&
    content.includes('formData.append("guestToken", guestToken);'),
    "Photo upload must attach persistent guestToken to formData"
  );

  // Synchronizes external initialLayers
  assert.ok(
    content.includes("initialLayersRef") && content.includes("setLayers(initialLayers);"),
    "EditorCanvas must synchronize external initialLayers when loaded from draft"
  );
});

// -----------------------------------------------------------------------------
// Test 5: Customer Customize Studio Saved Design Restoration
// -----------------------------------------------------------------------------
runTest("Customize studio restores photo layers with fresh signed URLs upon reopening", () => {
  const studioPath = path.join(ROOT_DIR, "app", "products", "[slug]", "customize", "page.tsx");
  assert.ok(fs.existsSync(studioPath), "Customize studio page must exist");
  const content = fs.readFileSync(studioPath, "utf-8");

  // Sanitizes restored layers
  assert.ok(
    content.includes("permanentPath = p.storagePath || extractStoragePath(p.imageUrl)") &&
    content.includes("freshUrl = resolveCustomizationAssetUrl(permanentPath || p.imageUrl)"),
    "Studio must sanitize restored layers and obtain fresh signed URLs for photo layers"
  );

  // Checks customer_designs in Supabase if not in localStorage
  assert.ok(
    content.includes('.from("customer_designs")') && content.includes("getUser()"),
    "Studio must check Supabase customer_designs for authenticated customers"
  );

  // Preserves persistentLayers when saving draft
  assert.ok(
    content.includes("persistentLayers = canvasLayers.map"),
    "Studio must preserve permanent storagePath when persisting design records"
  );
});

// -----------------------------------------------------------------------------
// Test 6: 3D Viewport Preview Uses Fresh Resolved Asset URLs
// -----------------------------------------------------------------------------
runTest("3D Viewport Preview resolves photo layers via resolveCustomizationAssetUrl", () => {
  const previewPath = path.join(ROOT_DIR, "components", "customizer", "3d-viewport-preview.tsx");
  assert.ok(fs.existsSync(previewPath), "3D Viewport preview component must exist");
  const content = fs.readFileSync(previewPath, "utf-8");

  assert.ok(
    content.includes("resolveCustomizationAssetUrl(photo.storagePath || photo.imageUrl)"),
    "3D viewport preview canvas texture render must resolve photo asset URLs"
  );
  assert.ok(
    content.includes("resolveCustomizationAssetUrl(pl.storagePath || pl.imageUrl)"),
    "3D viewport snapshot capture must pre-resolve photo asset URLs"
  );
});

// -----------------------------------------------------------------------------
// Test 7: Upload API Security & Ownership Scoping Contract
// -----------------------------------------------------------------------------
runTest("Upload API route enforces customer and guest token ownership", () => {
  const routePath = path.join(ROOT_DIR, "app", "api", "customizations", "upload", "route.ts");
  assert.ok(fs.existsSync(routePath), "Upload route file must exist");
  const content = fs.readFileSync(routePath, "utf-8");

  // Guest token check
  assert.ok(
    content.includes("isGuest && guestTokenParam && guestTokenParam === ownerId"),
    "GET handler must verify that guestToken matches the ownerId folder in path"
  );

  // Authenticated user check
  assert.ok(
    content.includes("user.id === ownerId"),
    "GET handler must verify that authenticated user matches the ownerId folder in path"
  );

  // Admin bypass
  assert.ok(
    content.includes('profile?.role === "admin"'),
    "GET handler must allow admins to access customization assets"
  );

  // Unauthenticated non-guest rejection
  assert.ok(
    content.includes("Access denied. You do not have permission to view this customization asset."),
    "Must reject unauthorized requests with 403 Forbidden"
  );
});

// -----------------------------------------------------------------------------
// Test 8: End-to-End Simulation of Saved Design Fixture Restoration (Test B & E)
// -----------------------------------------------------------------------------
await runAsyncTest("Simulate reopening a saved design fixture with expired signed URL", async () => {
  const { extractStoragePath, resolveCustomizationAssetUrl } = await import("../lib/3d/storage-assets.ts");

  // Simulated saved design from 2 days ago in localStorage
  const savedDesignFixture = {
    designId: "dsg-test-fixture-123",
    layers: [
      {
        id: "photo-1793737902000",
        type: "photo",
        name: "Customer Family Photo",
        storagePath: "b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg",
        // Expired signed URL that previously broke the canvas
        imageUrl:
          "https://mshjafebtbbhsmotnvdq.supabase.co/storage/v1/object/sign/customer-customizations/b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg?token=eyJhbGciOiJIUzI1NiJ9.expired_claim",
        x: 0.25,
        y: 0.35,
        width: 0.5,
        height: 0.4,
        rotationDeg: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
      },
      {
        id: "text-1793737905000",
        type: "text",
        text: "Shree Ganesh Kripa",
        fontFamily: "Cinzel, serif",
        fontSizePt: 28,
        fillColorHex: "#b45309",
        textAlign: "center",
        fontWeight: "bold",
        x: 0.1,
        y: 0.15,
        width: 0.8,
        height: 0.08,
        rotationDeg: 0,
        opacity: 1,
        zIndex: 2,
        visible: true,
      },
    ],
  };

  // Reopening process
  const restoredLayers = savedDesignFixture.layers.map((l) => {
    if (l.type === "photo") {
      const permanentPath = l.storagePath || extractStoragePath(l.imageUrl) || "";
      const freshUrl = resolveCustomizationAssetUrl(permanentPath || l.imageUrl);
      return {
        ...l,
        storagePath: permanentPath,
        imageUrl: freshUrl,
      };
    }
    return l;
  });

  // Verify photo layer
  const restoredPhoto = restoredLayers[0];
  assert.equal(
    restoredPhoto.storagePath,
    "b01fcd2a-36b6-4def-a786-52e4707c2395/photos/1793737902000_8bcd3a12.jpg",
    "Permanent storage path must remain pristine"
  );
  assert.equal(
    restoredPhoto.imageUrl,
    "/api/customizations/upload?path=b01fcd2a-36b6-4def-a786-52e4707c2395%2Fphotos%2F1793737902000_8bcd3a12.jpg",
    "Restored image URL must point to fresh authorized endpoint instead of dead signed URL"
  );

  // Verify text layer
  const restoredText = restoredLayers[1];
  assert.equal(restoredText.text, "Shree Ganesh Kripa", "Text inscription must be 100% preserved");
  assert.equal(restoredText.fontFamily, "Cinzel, serif");
  assert.equal(restoredText.fillColorHex, "#b45309");
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`PHASE 7B.9.4 TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
console.log("================================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log("All Phase 7B.9.4 tests PASSED successfully.");
}

