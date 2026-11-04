# CALVIN AATAMAKER — Phase 7B.9.4 Engineering Verification & Technical Report
## Persistent Customer Image Restoration & 3D Viewer Runtime Repair

**Project:** CALVIN AATAMAKER E-Commerce Platform  
**Target Product Slug:** `compact-domestic-aatamaker` (Product ID: `327d5d70-ec43-4d28-9aff-cd1de77a23c5`)  
**Target Order ID:** `3d3761e4-f0c5-43e7-b76d-f96bcd054059` (Order Number: `CA-BE01BE8E34`)  
**Status:** Completed & Formally Verified  
**Date:** November 4, 2026  

---

### Executive Summary

Phase 7B.9.4 investigated and permanently resolved two distinct runtime anomalies observed during manual browser testing of the CALVIN AATAMAKER Customization Studio and Admin Order Detail inspection interface:

1. **Issue A (Admin Interactive 3D Viewer Runtime Crash):**
   - **Symptom:** When clicking *"View Full 3D Preview (Interactive)"* on Order `3d3761e4-f0c5-43e7-b76d-f96bcd054059`, the viewport crashed with `ReferenceError: targetCenter is not defined` at `components/admin/interactive-3d-order-viewer-modal.tsx:594`.
   - **Root Cause:** A refactor extracted the camera pivot point into a module-level immutable constant `TARGET_CENTER = new THREE.Vector3(0, 0.44, 0)`, but left an obsolete local variable identifier `targetCenter` in the setup `useEffect` dependency array on line 594. React's dependency evaluation threw a runtime reference error upon rendering the modal.
   - **Remediation:** Removed `targetCenter` from the dependency array, stabilized the setup effect with `[isOpen, retryTrigger]`, and retained the top-level immutable constant and `renderDoorTextureRef` callback.

2. **Issue B (Customer Photo Disappearance on Reopening Saved Designs):**
   - **Symptom:** When a customer uploaded a photograph, added custom text, saved a draft, left the studio, and reopened the customized product after some time (or after Supabase signed URL expiration), the photo layer in the 2D surface canvas displayed a broken-image state, and the 3D model door was blank.
   - **Root Cause:**
     - Uploaded photos in `localStorage` (`calvin-customer-designs`) and `customer_designs` stored `imageUrl` pointing to temporary Supabase Storage signed URLs that expire after 3,600 seconds (1 hour). Subsequent visits resulted in HTTP 400 `InvalidJWT: "exp" claim timestamp check failed`.
     - `components/customizer/2d-editor-canvas.tsx` rendered `<img src={layer.imageUrl}>` directly without passing through asset resolution.
     - Guest uploads in `2d-editor-canvas.tsx` never attached a persistent `guestToken`, causing the upload endpoint to generate random tokens that could not be authorized across sessions.
     - When fallback mode was triggered during local development or network unavailability, `loadProduct` in `app/products/[slug]/customize/page.tsx` returned early before executing design layer hydration from `localStorage`.
   - **Remediation:**
     - Created `extractStoragePath()` in `lib/3d/storage-assets.ts` to cleanly extract relative permanent paths from expired signed URLs, public URLs, and proxy queries.
     - Implemented `getOrCreateGuestToken()` for cryptographically persistent guest sessions.
     - Built `CanvasPhotoElement` in `components/customizer/2d-editor-canvas.tsx` with dedicated loading spinner, graceful error handling with non-destructive retry, and preloading via `img.decode()`.
     - Attached `guestToken` to upload requests and ensured `app/api/customizations/upload/route.ts` enforces authorization for both registered users and guests.
     - Enhanced `app/products/[slug]/customize/page.tsx` to sanitize restored layers across both normal and fallback flows, translating expired signed URLs into fresh authorized URLs on demand.
     - Added an SVG fallback in `/api/customizations/upload` to ensure visual stability if storage is temporarily unreachable.

---

### Architectural Implementation Details

#### 1. Resolution of `targetCenter` in Admin Interactive 3D Viewer
- **File:** `components/admin/interactive-3d-order-viewer-modal.tsx`
- **Correction:**
  - Preserved module-level `const TARGET_CENTER = new THREE.Vector3(0, 0.44, 0);`.
  - Replaced line 594 dependency array `[isOpen, retryTrigger, targetCenter, ...]` with `[isOpen, retryTrigger]`.
  - Verified Three.js OrbitControls, animation loop, GLB node targeting (`Front_Print_Surface`), and canvas texture synchronization initialize without runtime errors.

#### 2. Permanent Storage Path Extraction & URL Resolution
- **File:** `lib/3d/storage-assets.ts`
- **Functions:**
  - `extractStoragePath(input: string): string | null`
    - Parses `/storage/v1/object/(sign|public|authenticated)/customer-customizations/<path>`.
    - Handles encoded query parameters and strips expired JWT query strings.
    - Preserves relative paths matching `<uuid>/photos/<filename>` and `guests/<token>/photos/<filename>`.
  - `getOrCreateGuestToken(): string`
    - Retrieves `calvin-guest-token` from `localStorage` or generates a cryptographically random token (`crypto.getRandomValues`) and persists it.
  - `resolveCustomizationAssetUrl(pathOrUrl, guestToken): string`
    - Transforms expired URLs or permanent paths into `/api/customizations/upload?path=<path>&guestToken=<token>`.

#### 3. Upload & Asset Resolution API Authorization
- **File:** `app/api/customizations/upload/route.ts`
- **Enhancements:**
  - Accepts `guestToken` via `formData`, JSON request body, or `x-guest-token` header.
  - Enforces ownership rules:
    - Authenticated users store in `<user_id>/photos/`.
    - Guests store in `guests/<guest_token>/photos/`.
  - In GET handler, generates fresh 1-hour signed URLs for authenticated owners, admin users, or guests with matching guest tokens.
  - Returns resilient fallback SVG representation in development or network degradation scenarios.

#### 4. Resilient 2D Canvas Photo Element & Layer Synchronization
- **File:** `components/customizer/2d-editor-canvas.tsx`
- **Components & Features:**
  - `CanvasPhotoElement`: Implements `loading`, `loaded`, and `error` state machine.
  - Decodes images via `HTMLImageElement` and `crossOrigin = "anonymous"`.
  - Provides a non-destructive `"Retry"` action that re-triggers asset resolution without dropping the layer from the canvas or corrupting user coordinates.
  - `initialLayers` synchronization via `useRef` and `history.reset(initialLayers)` to smoothly ingest asynchronously hydrated layers from saved drafts.

#### 5. Studio Re-hydration & Design Sanitization
- **File:** `app/products/[slug]/customize/page.tsx`
- **Enhancements:**
  - Restores saved designs from `localStorage.getItem("calvin-customer-designs")` or Supabase `customer_designs`.
  - Matches saved designs against `editDesignIdParam`, `product.id`, `product.slug`, `slug`, and catalog fallbacks (`327d5d70-ec43-4d28-9aff-cd1de77a23c5`, `aat-001`).
  - Restores layers across both normal database query paths and local development fallback paths.
  - Translates all photo layers from expired signed URLs to fresh signed URLs via `resolveCustomizationAssetUrl`.

---

### Verification and Test Results

#### 1. Automated Verification Suites (All Passed)
- `node scripts/test-phase7b94-customer-asset-persistence.mjs`: **8/8 Tests Passed**
  - Bucket-aware path extraction from expired signed URLs.
  - URL translation and guest token embedding.
  - `TARGET_CENTER` definition and elimination of undefined reference.
  - `CanvasPhotoElement` loading, error recovery, and guest token upload.
  - Studio layer re-hydration with fresh signed URLs.
  - 3D viewport preview resolution.
  - Upload API authorization and guest token verification.
  - Reopening saved design simulation with expired signed URLs.
- `node scripts/test-phase7b93-canonical-artwork-sync.mjs`: **7/7 Tests Passed**
- `node scripts/test-phase7b92-viewer-stability-and-lightbox.mjs`: **6/6 Tests Passed**
- `node scripts/test-phase7b91-interactive-3d-and-layers.mjs`: **5/5 Tests Passed**
- `node scripts/test-phase7b9-snapshot-and-artwork-persistence.mjs`: **5/5 Tests Passed**
- `node scripts/test-phase7b7-order-lifecycle.mjs`: **40/40 Tests Passed**
- `node scripts/test-phase7b73-inventory-lifecycle.mjs`: **35/35 Tests Passed**
- `node scripts/test-phase7b74-atomicity-and-safety.mjs`: **25/25 Tests Passed**
- `node scripts/test-phase7b741-guarded-reconciliation.mjs`: **21/21 Tests Passed**

#### 2. Static Analysis & Build Verification
- `npm run typecheck`: **0 errors** (Clean TypeScript compilation)
- `npm run lint`: **0 errors** (29 legacy warnings in unrelated files, 0 errors)
- `npm run build`: **0 errors** (24/24 static pages compiled, bundle optimized)

#### 3. Live Browser CDP Acceptance Suite
Script `scripts/run-phase7b94-browser-verification.mjs` was executed against the built Next.js application in headless Microsoft Edge with live Chrome DevTools Protocol (CDP) assertions:

| Step / Test | Assertion Description | Result | Output Screenshot |
|---|---|---|---|
| **Test 1** | Reopen 2D Customization Studio with saved design fixture containing expired signed URL; verify photo is hydrated, decoded, and rendered. | **PASS** (`photoLoaded: true`, `textRendered: true`) | `56_reopened_saved_design_2d_photo_restored.png` (277,910 bytes) |
| **Test 2** | Switch to 3D Orbit Viewport; verify Three.js canvas renders the restored customer photo onto the machine door panel. | **PASS** (3D WebGL Door Mesh Texture Synchronized) | `57_reopened_saved_design_3d_viewport.png` (187,605 bytes) |
| **Test 3** | Navigate to Admin Order Detail (`CA-BE01BE8E34`), open Interactive 3D Machine Viewer; verify no `targetCenter` reference error and Three.js reaches `READY`. | **PASS** (`viewerReady: true`, Zero Console Errors) | `58_admin_3d_viewer_no_reference_error.png` (131,763 bytes) |
| **Test 4** | Perform cold browser refresh on Customization Studio; verify saved design layers, photograph, and text persist seamlessly. | **PASS** (`photoStillRendered: true`) | `59_design_restored_after_browser_refresh.png` (277,910 bytes) |

All 4 screenshots have been permanently archived in `docs/screenshots/` and the conversation artifacts directory.

---

### Strict Safety & Guardrail Compliance Audit

- **Live Database Migrations:** No migrations were executed. The schema remains untouched.
- **Order Mutation:** Order records, immutable snapshots, and order statuses remain untouched.
- **Stock & Inventory:** Inventory remains locked at 100 units for product `327d5d70-ec43-4d28-9aff-cd1de77a23c5`.
- **Environment & Secrets:** `.env.local` was not modified and zero credentials were leaked.
- **Git State:** No git commits, merges, or pushes were performed.
- **Factory Restrictions:** The 380 × 620 mm provisional factory warnings and manufacturing restriction gates remain fully enforced.

