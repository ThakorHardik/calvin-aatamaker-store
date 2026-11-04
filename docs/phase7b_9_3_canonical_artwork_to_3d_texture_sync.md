# CALVIN AATAMAKER — Phase 7B.9.3 Technical Report
## Exact Canonical Artwork Synchronization Between 2D and 3D Machine Viewer

**Target Order:** `3d3761e4-f0c5-43e7-b76d-f96bcd054059` (`CA-BE01BE8E34`)  
**Customer:** `Hardik Thakor` (`aata@gmail.com`)  
**Product:** Compact Domestic Aatamaker (`327d5d70-ec43-4d28-9aff-cd1de77a23c5`)  
**Physical Door Dimensions:** 380 mm × 620 mm (Aspect Ratio: 0.613)  
**Canonical Texture Resolution:** 1024 × 1670 px (Offscreen 2D Canvas)  
**Status:** COMPLETE & VERIFIED

---

### 1. Root Cause Diagnosis: Why the Photograph Was Missing in 3D

During inspection of Order `CA-BE01BE8E34`, the customer had uploaded a photograph (`1793737902000_8bcd3a12-d334-482e-83d6-caf059aa6c23.jpg`, 1.15 MB JPEG) stored at `customer-customizations/b01fcd2a-36b6-4def-a786-52e4707c2395/photos/...`.

#### Root Cause 1: Ephemeral Signed URL Expiration (`InvalidJWT`)
- When the order was created, checkout serialized the layer objects into `customisation_details._layers`.
- Each layer object included both a permanent relative path (`storagePath: ".../photos/..."`) and an ephemeral signed URL (`imageUrl: "https://.../storage/v1/object/sign/...token=eyJ..."`).
- Supabase signed URLs expire after 3,600 seconds (1 hour). The JWT `exp` timestamp was `1793741506` (expired Nov 3, 2026).
- When the Admin 3D viewer initialized, its layer normalization evaluated:
  ```typescript
  const rawUrl = (l.imageUrl as string) || (l.storagePath as string) || "";
  ```
  It picked the expired `imageUrl` over the permanent `storagePath`.
- In `resolveCustomizationAssetUrl(rawUrl)`, any string starting with `https://` was returned as-is for backward compatibility.
- When Three.js attempted to load the expired URL, Supabase Storage returned HTTP 400:
  ```json
  {"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}
  ```
- Because image loading caught the failure, the texture renderer fell back to a default dark metallic rectangle (`#2D3748`), rendering custom text "Hardik" on top but dropping the customer's photograph completely.
- In contrast, the 2D Canonical Flat Artwork in `OrderDetailPage` used `deriveFlatArtworkForItem`, which prioritized `storagePath` and translated it into `/api/customizations/upload?path=...`, generating a fresh, valid signed URL.

#### Root Cause 2: Logo Duplication Risk
- The physical prototype GLB (`/models/calvin-compact-01-prototype.glb`) contains a separate physical mesh node `Calvin_Fixed_Logo`.
- The canonical flat artwork renderer (`lib/3d/canonical-artwork.ts`) already bakes the official CALVIN brand logo plate into the upper-center of the front panel artwork.
- Leaving `Calvin_Fixed_Logo` visible resulted in two superimposed logos (physical 3D emblem + flat artwork graphic), causing visual jitter and misalignment.

---

### 2. Architecture: Single Visual Source of Truth

To ensure 100% pixel-perfect synchronization between 2D flat inspection and the 3D machine model, we implemented a single canonical source of truth:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Immutable Order Record & Layers                      │
│      - storagePath: b01fcd2a.../photos/1793737902000_8bcd3a12.jpg      │
│      - text: "Hardik" (Cinzel serif, gold #b45309)                     │
│      - finish: "matte_black" (Provisional 380 x 620 mm)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Canonical Flat Artwork PNG (1024 x 1670)              │
│       - Derived once via lib/3d/canonical-artwork.ts                   │
│       - Contains: Base finish coat, Customer Photo (scaled/cropped),   │
│         Customer Inscription ("Hardik"), and CALVIN brand plate        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│     Admin 2D Flat Lightbox Modal  │ │    Admin Interactive 3D Viewer    │
│  - Displays full 1024x1670 PNG    │ │  - Texture: CanvasTexture (off-   │
│  - Zoom in/out, fit-to-screen     │ │    screen canvas with PNG drawn)  │
│  - Factory dimension warnings     │ │  - Front_Print_Surface material   │
│  - Exact artwork reference        │ │  - Calvin_Fixed_Logo.visible=false│
└───────────────────────────────────┘ └───────────────────────────────────┘
```

1. **Storage Path Resiliency (`lib/3d/storage-assets.ts`):**
   - Added regex extraction for Supabase signed URLs: `/customer-customizations/([^?#]+)`. Any expired signed URL is automatically stripped down to its permanent relative path and routed through `/api/customizations/upload?path=...`.
   - `isPermanentStoragePath` validates storage keys for owners and guests.
2. **CORS & Preflight Compliance (`app/api/customizations/upload/route.ts`):**
   - Added `OPTIONS` preflight handler with status 204.
   - Injected `Access-Control-Allow-Origin: *`, `Methods`, and `Headers` onto both preflight and the 307 Temporary Redirect responses, allowing Three.js offscreen canvases to decode images without tainted-canvas errors.
3. **Single Canonical Texture Mapping (`components/admin/interactive-3d-order-viewer-modal.tsx`):**
   - Accepts `artworkUrl?: string` as a direct input.
   - `renderDoorTexture` draws the canonical flat artwork PNG directly onto an offscreen `1024 × 1670` canvas.
   - `printTexture = new THREE.CanvasTexture(canvas)` maps directly to `Front_Print_Surface.material`.
   - Sets `Calvin_Fixed_Logo.visible = false` on the GLB root, allowing the canonical flat artwork to provide the exact, authentic brand emblem without duplication or z-fighting.
4. **Order Detail Integration (`app/admin/orders/[id]/page.tsx`):**
   - Passes `artworkUrl={derivedArtworkMap[active3DModalItem.id] || ...}` to `Interactive3DOrderViewerModal`.
   - Normalizes layers by mapping `storagePath` through `resolveCustomizationAssetUrl`.

---

### 3. Verification & Evidence

#### Automated Test Suite
- `scripts/test-phase7b93-canonical-artwork-sync.mjs`: **7/7 PASSED**
  1. `resolveCustomizationAssetUrl` extracts permanent path from expired signed URLs.
  2. Upload API route provides OPTIONS preflight and CORS headers.
  3. Admin 3D Viewer accepts `artworkUrl` prop and prioritizes canonical flat artwork.
  4. Admin 3D Viewer hides physical `Calvin_Fixed_Logo` mesh when canonical artwork is active.
  5. Layer normalization prioritizes permanent `storagePath` over ephemeral `imageUrl`.
  6. Admin Order Detail page connects derived canonical artwork to 3D modal.
  7. Canonical artwork renderer maintains 1024 × 1670 aspect ratio (0.613).

#### Full Regression Test Suites
- `scripts/test-phase7b92-viewer-stability-and-lightbox.mjs`: **6/6 PASSED**
- `scripts/test-phase7b91-interactive-3d-and-layers.mjs`: **5/5 PASSED**
- `scripts/test-phase7b9-snapshot-and-artwork-persistence.mjs`: **5/5 PASSED**
- `scripts/test-phase7b7-order-lifecycle.mjs`: **40/40 PASSED**
- `scripts/test-phase7b73-inventory-lifecycle.mjs`: **35/35 PASSED**
- `scripts/test-phase7b74-atomicity-and-safety.mjs`: **25/25 PASSED**
- `scripts/test-phase7b741-guarded-reconciliation.mjs`: **21/21 PASSED**
- `npm run typecheck`: **0 errors**
- `npm run lint`: **0 errors**
- `npm run build`: **0 errors** (Static pages 24/24 generated cleanly)

#### Live Browser Acceptance Screenshots
Captured on Order `CA-BE01BE8E34` via headless Edge CDP at 1440 × 960 resolution:
1. `50_canonical_flat_artwork_reference.png` (235,215 bytes): Canonical flat artwork reference showing the customer photo, custom inscription "Hardik", and CALVIN emblem.
2. `51_3d_front_with_customer_photo.png` (228,260 bytes): Front elevation 3D camera preset showing customer photograph cleanly projected onto `Front_Print_Surface`, with "Hardik" and single brand logo plate.
3. `52_3d_three_quarter_with_customer_photo.png` (228,257 bytes): Three-Quarter beauty perspective showing the customer photo adhering to the door curvature and metallic frame.
4. `53_3d_right_profile_with_customer_photo.png` (228,257 bytes): Right profile angle verifying 3D chassis depth, ventilation slots, and door thickness.
5. `54_3d_artwork_after_reopen.png` (228,259 bytes): Modal closed and reopened immediately, verifying rapid state recovery and texture persistence without WebGL memory leaks.
6. `55_3d_artwork_after_admin_refresh.png` (228,258 bytes): Cold page reload and 3D modal re-open, demonstrating that texture synchronization remains resilient across page lifecycles.

