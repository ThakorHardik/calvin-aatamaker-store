# CALVIN AATAMAKER — 3D Asset Modelling Specification
## Model: CALVIN Compact Domestic Aatamaker (`CALVIN-COMPACT-01`)

**Document Version:** 1.0.0  
**Target Engine:** Three.js / WebGL (Next.js 15 Storefront 3D Personalizer)  
**Deliverable Format:** glTF 2.0 Binary (`.glb`)  
**Status:** DRAFT / INTAKE ACTIVE (Awaiting Client Photo Upload & Caliper Sign-off)

---

## 1. Executive Context

CALVIN AATAMAKER is introducing an interactive 3D Personalization Studio for the **CALVIN Compact Domestic Aatamaker**. Because no original CAD files or engineering 3D models exist, the 3D model must be modeled in Blender using:
1. High-resolution reference photographs across all standard elevations and angles.
2. Verified physical millimeter measurements taken with vernier calipers and steel rules.
3. Official CALVIN corporate brand vectors.

---

## 2. Object Hierarchy & Mesh Naming

The Blender scene and the resulting glTF scene graph **MUST** adhere to the following object hierarchy and exact naming:

```
CALVIN_Compact_Root (Empty / Pivot at bottom-center [0, 0, 0])
├── Body_Cabinet (Mesh: Outer main housing, side panels, back, and rubber base feet)
├── Top_Hopper_Assembly (Mesh: Stainless grain inlet hopper, chrome bezel ring, and lid)
├── Dispensing_Chute (Mesh: Lower flour exit nozzle, flour collection spout, and base tray)
├── Front_Door_Frame (Mesh: Door structural border, bevels, side hinges, and latch)
└── Front_Print_Surface (Mesh: Exact planar front panel for dynamic canvas texture)
```

> [!IMPORTANT]
> **Strict Mesh Naming:** The Three.js runtime searches for the node named `Front_Print_Surface` to dynamically bind the customer's high-resolution design canvas texture. Do NOT rename this object.

---

## 3. Physical Dimensions & Unit Scaling

* **Blender Working Units:** Metric, Unit Scale: `0.001` (1 unit = 1 mm) during poly modeling.
* **glTF / Three.js Export Units:** Meters (`1.0` unit = 1.0 meter).
* **Dimensional Reference Table:**

| Component | Target Metric (mm) | glTF Coordinates (Meters) | Verification Status |
| :--- | :---: | :---: | :--- |
| **Cabinet Outer Width** | 460 mm | 0.460 m | Unverified (Catalog Estimate) |
| **Cabinet Outer Height** | 840 mm | 0.840 m | Unverified (Catalog Estimate) |
| **Cabinet Outer Depth** | 330 mm | 0.330 m | Unverified (Catalog Estimate) |
| **Front Door Width** | 360 mm | 0.360 m | Unverified (Catalog Estimate) |
| **Front Door Height** | 620 mm | 0.620 m | Unverified (Catalog Estimate) |
| **Door Thickness / Bevel** | 18 mm | 0.018 m | Unverified (Catalog Estimate) |
| **Corner Chamfer Radius** | 12 mm | 0.012 m | Unverified (Catalog Estimate) |

*Note: Dimensions will be updated with exact factory caliper measurements during asset intake.*

---

## 4. Front Panel UV Mapping Specifications

The `Front_Print_Surface` object requires a distortion-free, 1:1 planar projection:

1. **UV Channel:** Primary `UVMap` (Channel 0).
2. **Coordinate Orientation:**
   * $(U=0.0, V=0.0) \rightarrow$ **Top-Left** of the front door panel.
   * $(U=1.0, V=1.0) \rightarrow$ **Bottom-Right** of the front door panel.
3. **Strict Aspect Ratio Alignment:**
   * The UV unwrap must not be stretched or squashed. The UV aspect ratio must match the physical width-to-height ratio ($\frac{360}{620} \approx 0.5806$).
4. **Zero Overlap:** The printable surface must be a single continuous UV island covering the full $0..1$ UV bounding space.

---

## 5. Non-Printable Regions & Obstacle Cutouts

The 3D modeler must construct visible physical geometry for the following features, but ensure customer artwork remains clear of them:

1. **Door Handle / Latch (`obs_handle_latch`):**
   - Recessed finger catch or magnetic handle on the right edge.
   - Offset: $X = 330\text{ mm}, Y = 310\text{ mm}$. Size: $25\text{ mm} \times 50\text{ mm}$.
2. **Flour Dispensing Chute Zone (`obs_chute_clearance`):**
   - Lower clearance where flour container docks.
   - Offset: $X = 30\text{ mm}, Y = 580\text{ mm}$. Size: $300\text{ mm} \times 40\text{ mm}$.
3. **Motor Air Intake Louvers (`obs_vent_slits`):**
   - Bottom ventilation slits for motor heat dissipation.
   - Offset: $X = 40\text{ mm}, Y = 540\text{ mm}$. Size: $280\text{ mm} \times 20\text{ mm}$.

---

## 6. Protected CALVIN Corporate Branding Envelope

* **Branding Strategy:** The official CALVIN brand logo is permanently positioned at:
  - **Position:** `top_center`
  - **Offset From Top Edge:** `35 mm`
  - **Dimensions:** `120 mm` width × `30 mm` height
* **Modeling Note:** Do NOT bake or paint customer artwork over this envelope. In the 3D model, the logo badge can be modeled as a slightly raised metallic decal or left as a defined coordinate area.

---

## 7. Materials & PBR Workflow

Use the glTF Metallic-Roughness PBR standard:

1. **`mat_cabinet_body` (Cabinet Housing & Sides):**
   - Base Color: Matte off-white / light cream powder coat (`#F4F2EE`).
   - Roughness: `0.45`
   - Metallic: `0.05`
2. **`mat_front_print` (Front Printable Door Panel):**
   - Base Color: Neutral White (`#FFFFFF`) — do NOT apply tint or baked shadows so dynamic customer artwork displays true-to-color.
   - Roughness: `0.35` (Semi-gloss smooth panel).
   - Metallic: `0.00`
3. **`mat_chrome_accents` (Hopper ring, hinges, latch):**
   - Base Color: Metallic Silver (`#E2E8F0`).
   - Roughness: `0.10`
   - Metallic: `0.90`
4. **`mat_chute` (Lower flour chute & tray):**
   - Base Color: Food-grade brushed stainless steel (`#CBD5E1`).
   - Roughness: `0.25`
   - Metallic: `0.85`

---

## 8. Performance Budget & GLB Export Settings

* **Polycount Target:** 15,000 to 30,000 triangles total (Max budget: 40,000 triangles).
* **Draw Calls:** Maximum 4 to 6 material slots.
* **Texture Sizes:** Ambient occlusion / metallic / roughness baked maps at max `2048×2048` (WEBP or optimized PNG).
* **File Size:** Under `10 MB` (Target: `3 to 6 MB`).

### Blender GLB Export Checklist:
- [x] Format: **glTF Binary (`.glb`)**
- [x] Include: **Selected Objects** only
- [x] Transform: **+Y Up, +Z Forward**
- [x] Geometry: **Apply Modifiers = True**
- [x] Geometry: **UVs = True, Normals = True, Tangents = True**
- [x] Materials: **Export Materials = True**
- [x] Animation: **Disabled** (No shape keys or armatures)
- [x] Compression: **Draco compression DISABLED** (to ensure fast mobile WebGL initialization without extra web-workers)

