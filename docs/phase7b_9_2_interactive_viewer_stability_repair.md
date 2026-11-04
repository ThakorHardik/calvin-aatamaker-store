# CALVIN AATAMAKER — Phase 7B.9.2: Interactive 3D Admin Viewer Stability & Artwork Lightbox Report

**Status:** Completed & Verified  
**Date:** 2026-11-04  
**Target Order Inspected:** `3d3761e4-f0c5-43e7-b76d-f96bcd054059` (`CA-BE01BE8E34`)  
**Customer:** Hardik Thakor (`aata@gmail.com`)  
**Product:** Compact Domestic Aatamaker (`327d5d70-ec43-4d28-9aff-cd1de77a23c5`)  

---

## 1. Executive Summary & Root Cause Analysis

In Phase 7B.9.1, the initial Admin Interactive 3D Viewer was introduced. However, manual browser testing revealed that clicking **"View Full 3D Preview (Interactive)"** resulted in a frozen grey viewport with an infinite loading spinner.

### Root Cause Diagnosis
1. **React State & Effect Dependency Loop:**
   - In `components/admin/interactive-3d-order-viewer-modal.tsx`, `normalizedLayers` was recreated as a new array reference on every render.
   - This in turn invalidated `updateFrontSurfaceTexture`, which was included in the scene setup `useEffect`'s dependency array.
   - When the GLTF loader finished and called `setLoadingModel(false)` to update state, React triggered a re-render, changing `updateFrontSurfaceTexture`, which invoked the effect cleanup (`renderer.dispose()`, `scene.clear()`), and immediately re-mounted the effect, resetting `loadingModel = true` and invoking `loader.load()` indefinitely.
2. **Container Sizing Race Condition:**
   - On initial modal mount with CSS transitions/flexbox, `container.clientWidth` was 0 before layout calculation, generating an invalid `NaN` aspect ratio for Three.js.
3. **SSR Evaluation of Three.js:**
   - Importing Three.js directly in client components evaluated at build time caused Next.js Webpack module chunking issues.
4. **Artwork Presentation Limitations:**
   - Canonical flat artwork previously opened in a separate browser tab without in-page high-resolution zoom/pan controls or clear indication of on-demand derivation.

---

## 2. Engineering Remediation & Architecture

### A. Three.js Lifecycle & Staged State Machine
The modal was refactored with an explicit 7-stage state machine:
- `initializing`: WebGL renderer initialization and scene graph instantiation.
- `loading_glb`: Asynchronous streaming of `calvin-compact-01-prototype.glb` with percentage progress tracking.
- `loading_artwork`: Parallel preloading of customer photograph assets via `Promise.allSettled` with decoding fallbacks.
- `applying_texture`: Decoupled offscreen 2D canvas drawing (1024 × 1670 px) mapped to `THREE.CanvasTexture`.
- `rendering_frame`: First frame forced render with ACESFilmic tone mapping.
- `ready`: Interactive OrbitControls enabled with smooth damping.
- `error`: Graceful error boundary with a **"Retry Loading Viewer"** action button.

### B. Setup Effect Decoupling
- The main Three.js setup `useEffect` depends strictly on `[isOpen, retryTrigger]`.
- Layer texture repainting is decoupled into a separate effect that repaints the offscreen 2D canvas and sets `printTexture.needsUpdate = true` without re-initializing Three.js or reloading the GLB geometry.
- `ResizeObserver` is attached to `canvasContainerRef` to dynamically update `camera.aspect` and `renderer.setSize` on viewport resizes.

### C. Mesh Targeting & Brand Logo Independence
- The physical GLB node `Front_Print_Surface` (mesh 17) is isolated for customer canvas textures.
- The dedicated physical badge `Calvin_Fixed_Logo` (mesh 25) is textured independently with `/images/calvin-aatamaker-logo.png`, preventing duplicate logo overlays.

### D. High-Resolution Flat Artwork Lightbox Modal
- Click-to-enlarge lightbox viewing modal with backdrop blur (`bg-stone-950/95`).
- Exact physical aspect ratio (380 × 620 mm, native aspect `1 : 1.63`).
- Controls: Zoom Out (-25%), Zoom In (+25%), Fit 1:1, Download High-Res PNG, and Save Derived to Storage.
- Clean distinction badges between immutable checkout captures and non-mutating on-demand derivations.

---

## 3. Automated Test Verification Results

All automated suites passed with 100% success:

1. **`test-phase7b92-viewer-stability-and-lightbox.mjs`** (6 / 6 passed):
   - ✓ Interactive 3D Viewer defines explicit staged states and decoupled setup effect.
   - ✓ GLB Node Targeting isolates `Front_Print_Surface` from `Calvin_Fixed_Logo`.
   - ✓ Camera Presets (Three-Quarter, Front Elevation, Right Profile) exist without model reload.
   - ✓ Admin Order Detail Page implements High-Resolution Flat Artwork Lightbox with Zoom Controls.
   - ✓ Interactive 3D Viewer Modal is imported dynamically with `ssr: false`.
   - ✓ Preserves Prototype Factory Caliper Warnings and Non-Mutating Historical Badge.
2. **`test-phase7b91-interactive-3d-and-layers.mjs`**: 5 / 5 passed.
3. **`test-phase7b9-snapshot-and-artwork-persistence.mjs`**: 5 / 5 passed.
4. **`test-phase7b7-order-lifecycle.mjs`**: 40 / 40 passed.
5. **`test-phase7b73-inventory-lifecycle.mjs`**: 35 / 35 passed.
6. **`test-phase7b74-atomicity-and-safety.mjs`**: 25 / 25 passed.
7. **`test-phase7b741-guarded-reconciliation.mjs`**: 21 / 21 passed.

---

## 4. Live Browser Visual Acceptance Evidence

Browser verification was executed in Microsoft Edge via Chrome DevTools Protocol (CDP) on order `CA-BE01BE8E34`:

| Screenshot | Description | File Path |
| :--- | :--- | :--- |
| **`44_viewer_model_loaded.png`** | Three-Quarter Beauty Perspective: Interactive 3D Model loaded cleanly with lighting and OrbitControls. | `docs/screenshots/44_viewer_model_loaded.png` |
| **`45_viewer_front_elevation.png`** | Front Elevation Preset: Camera framing directly facing the door panel artwork and CALVIN branding. | `docs/screenshots/45_viewer_front_elevation.png` |
| **`46_viewer_right_profile.png`** | Right Profile Preset: Side chassis view for inspection of structural proportions. | `docs/screenshots/46_viewer_right_profile.png` |
| **`47_viewer_customer_artwork_on_model.png`** | Customer Artwork on Surface: Customer photo and custom inscription "Hardik" rendered on machine surface. | `docs/screenshots/47_viewer_customer_artwork_on_model.png` |
| **`48_viewer_after_reopen.png`** | Re-open Cycle: Closed and immediately re-opened modal, confirming immediate initialization. | `docs/screenshots/48_viewer_after_reopen.png` |
| **`49_flat_artwork_enlarged.png`** | High-Resolution Flat Artwork Lightbox: Full-screen modal with zoom (+/-), 1:1 fit, and PNG download. | `docs/screenshots/49_flat_artwork_enlarged.png` |

---

## 5. Security & Safety Compliance

- **No Deploy / Push / Merge:** Verified.
- **`.env.local` Intact:** No credentials or secrets exposed.
- **Database & Inventory Protection:** Zero mutations to live Supabase database records or stock levels.
- **Manufacturing Integrity:** All demonstration prototype notices (380 × 620 mm unverified caliper measurements) and processing state gates preserved.

