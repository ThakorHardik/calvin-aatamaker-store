# CALVIN AATAMAKER — Phase 7B.9 Engineering Verification Report
## Complete Customized Order Snapshot, Artwork Persistence and Admin Inspection Repair

**Date:** November 4, 2026  
**Status:** COMPLETE & VERIFIED  
**Target Order Inspected:** `CA-BE01BE8E34` (ID: `3d3761e4-f0c5-43e7-b76d-f96bcd054059`)  
**Customer:** Hardik Thakor (`ashokthakor161985@gmail.com`)  

---

## 1. Executive Summary & Root Cause Analysis

During manual testing in Phase 7B.8, an order was placed containing an uploaded photograph and custom text inscription (*"Hardik"*). When inspecting the order in Admin at `/admin/orders/[id]`, four discrepancies were reported:
1. Original uploaded photograph was visible.
2. Final 3D machine preview displayed *"No 3D snapshot recorded."*
3. Canonical flat artwork displayed *"No flat artwork snapshot recorded."*
4. Custom text was not clearly displayed in Admin inspection.

### Live Database & Storage Forensic Audit Findings

A read-only inspection of Supabase PostgreSQL and Storage buckets revealed:
- **3D Preview Was Actually Captured and Stored:** The 3D render file `preview_6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482.png` existed in bucket `customer-customizations` under path `b01fcd2a-36b6-4def-a786-52e4707c2395/previews/`. In `order_items.customisation_details`, it was stored under key `_preview_storage_path`.
- **Property Name Mismatch Caused Missing 3D Preview in Admin:** `app/admin/orders/[id]/page.tsx` was querying only `custom._preview_thumbnail_path`, which was undefined. It never checked `custom._preview_storage_path` or `snapshot.preview_storage_path`. Consequently, the UI fell back to *"No 3D snapshot recorded"*.
- **Flat Artwork Generation Was Not Hooked Up:** In `customize/page.tsx`, `uploadPreviewToStorage` was executed for the 3D snapshot, but the 2D surface canvas was never exported as a standalone flat graphic or uploaded to storage. Therefore, `_flat_artwork_path` was null.
- **Custom Text Inscription Was Stored But Hidden:** The custom text `"Hardik"` (font: `'Noto Serif Devanagari', serif`, size: 28, color: `'#b45309'`) was safely saved inside `_layers` and `_snapshot.text_layers`. However, the Admin UI lacked a dedicated Inscription card and buried the text inside a small generic table at the bottom of the page.

---

## 2. Architecture & Pipeline Implementation

### A. Canonical Flat Artwork Engine (`lib/3d/canonical-artwork.ts`)
Created a standalone, high-resolution flat artwork renderer:
- **Exact Printable Dimensions:** 1024 × 1670 pixels, maintaining the exact $380 \times 620\text{ mm}$ door panel aspect ratio ($\approx 0.613$).
- **Cabinet Finish Background:** Renders the selected powder-coat finish gradient (e.g. Matte Black `#1D1D22` to `#131317`, Brushed Silver, Champagne Gold, Rose Copper) with bevel edge and safe margin guidelines.
- **Photo Layers:** Preloads customer images and renders them at normalized coordinates with crop, scale, rotation, and opacity.
- **Text Layers:** Renders custom text with scaled typography, font family, font weight, fill color, and alignment.
- **Official Brand Mark:** Draws the protected CALVIN logo badge plate at upper center ($120 \times 30\text{ mm}$).
- **Factory Watermark:** Adds a clear footer note: *"CALVIN AATAMAKER • PROTOTYPE SPECIFICATION (380 × 620 mm)"*.

### B. Storage Upload & Authorization Endpoint (`app/api/customizations/upload/route.ts` & `lib/3d/storage-assets.ts`)
- Upgraded the upload endpoint to accept `type: "artwork"`, saving flat artwork into the `artwork/` subfolder with filename `flat_{designId}.png`.
- Updated path validation and `isPermanentStoragePath` regex to permit `(photos|previews|artwork)`.
- Maintained server-side folder isolation (`<customerId>/artwork/...` for registered users, `guests/<token>/artwork/...` for guests).
- Preserved Admin access check: Admin users can view all assets across all customer directories through fresh signed URLs.

### C. 3D Studio & Cart Integration (`app/products/[slug]/customize/page.tsx` & `components/customizer/3d-viewport-preview.tsx`)
- Extended `ViewportPreviewHandle` with `captureFlatArtworkSnapshot()`.
- During both `handleSaveDesign` and `executeAddToCartOrBuyNow`:
  1. Captures 3D WebGL perspective beauty render.
  2. Captures canonical flat artwork PNG.
  3. Uploads both in parallel to Supabase Storage.
  4. Stores both `_preview_thumbnail_path` and `_preview_storage_path`.
  5. Stores both `_flat_artwork_path` and `_flat_artwork_storage_path`.
  6. Passes both paths into `buildImmutableCustomizationSnapshot()`.

### D. Checkout API Pipeline (`app/api/checkout/route.ts`)
- Preserved system customization metadata fields starting with `_` during cart item sanitization.
- Synchronized `_preview_thumbnail_path`, `_preview_storage_path`, `_flat_artwork_path`, and `_flat_artwork_storage_path`.
- Unpacked snapshot fields (`original_assets`, `text_layers`, `layers`, `surface_dimensions_mm`, `branding`) directly into `order_items.customisation_details`.

### E. Admin Order Inspection Upgrade (`app/admin/orders/[id]/page.tsx` & `app/admin/orders/page.tsx`)
- **Robust Multi-key Fallbacks:** `previewPath` checks `_preview_thumbnail_path`, `_preview_storage_path`, `snap.preview_storage_path`, `_preview_image`. `flatPath` checks `_flat_artwork_path`, `_flat_artwork_storage_path`, `snap.flat_artwork_storage_path`, `_flat_artwork_url`.
- **Dedicated Custom Text Inscription Card (Section D.3):**
  - Displays customer's text in large, styled typography using the exact configured `fontFamily` and `color`.
  - Presents manufacturing metadata: Inscription String, Font Family, Font Size / Weight, Alignment, Color Swatch (with hex and visual circle), and Door Panel Coordinates.
- **Ordered Products Line Items (Section C):**
  - Displays visual thumbnail (3D or flat artwork).
  - Displays an inscription pill: `Inscription: "Hardik"`.
- **Slide-over Drawer (`/admin/orders`):**
  - Displays 3D preview thumbnail and inscription badge directly in the order register drawer.

### F. Customer Order History (`app/account/orders/[id]/page.tsx` & `app/account/orders/page.tsx`)
- Displays both 3D Preview and Flat Artwork thumbnails.
- Displays prominent Custom Inscription card with font details.
- Displays customer's uploaded photograph thumbnails.
- Strictly scoped to authenticated customer owner.

---

## 3. Verification & Test Results

### 1. Phase 7B.9 Automated Verification Suite
Executed: `node scripts/test-phase7b9-snapshot-and-artwork-persistence.mjs`
- **TEST 1 (Dimensions):** Canonical flat artwork 1024 × 1670 px perfectly matches 380 × 620 mm door panel ratio ($0.61317 \approx 0.61290$). **PASSED**
- **TEST 2 (Storage Paths):** Permanent path detection validates `photos/`, `previews/`, and `artwork/` for registered users and guests. **PASSED**
- **TEST 3 (URL Resolution):** Resolves storage paths to authorized signed URL endpoint `/api/customizations/upload?path=...`. **PASSED**
- **TEST 4 (Immutable Snapshot):** Snapshot construction accurately preserves 3D preview, flat artwork, text layers, and original assets. **PASSED**
- **TEST 5 (Existing Order CA-BE01BE8E34 Audit):** Resolved existing order `3d3761e4-f0c5-43e7-b76d-f96bcd054059` — successfully retrieves 3D preview `b01fcd2a-36b6-4def-a786-52e4707c2395/previews/preview_6aa4a8ff-2223-48a4-a9b5-ee3bab4fe482.png` and displays text inscription `"Hardik"` with font `'Noto Serif Devanagari', serif` and color `#b45309`. **PASSED**

### 2. Phase 7B.7 Regression Suite
Executed: `node scripts/test-phase7b7-order-lifecycle.mjs`
- **Result:** 40 passed, 0 failed.

### 3. Static Type Analysis & Code Quality
- `npm run typecheck`: **0 errors**.
- `npm run lint`: **0 errors**, clean code quality.
- `npm run build`: **0 errors**, production compilation succeeded across all 24 routes.

---

## 4. Guardrails & Compliance Record

| Rule | Status | Evidence |
|---|---|---|
| Do not deploy, push, or merge | COMPLIED | No git push or deployment executed. |
| Do not modify `.env.local` or expose secrets | COMPLIED | No environment variables modified or secrets exposed. |
| Do not delete or mutate existing orders | COMPLIED | Order `CA-BE01BE8E34` was inspected read-only and preserved intact. |
| Do not delete uploaded photos | COMPLIED | All storage assets in `customer-customizations` remain untouched. |
| Do not apply unapproved migrations | COMPLIED | Zero migrations applied. |
| Preserve demonstration warnings & locks | COMPLIED | Prototype demonstration warnings (380 × 620 mm) and manufacturing status locks remain fully enforced. |

