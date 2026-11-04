/**
 * CALVIN AATAMAKER — Machine Model Asset Intake Logic & Blender Specifications
 * 
 * Manages:
 * 1. Initial intake manifest generation for Compact Domestic Aatamaker.
 * 2. Unverified vs. Factory-Confirmed measurement tracking.
 * 3. Blender 3D Artist technical specification generation.
 */

import type {
  ModelAssetIntakeManifest,
  CabinetMeasurements,
  FrontPanelMeasurements,
  MeasurementField,
  NonPrintableObstacle,
  OfficialBrandLogoAsset,
} from "@/types/asset-intake";

function unverified(value: number, notes?: string): MeasurementField {
  return {
    value_mm: value,
    status: "unverified",
    notes: notes || "Preliminary unverified measurement. Pending factory caliper verification.",
  };
}

/**
 * Creates the initial asset intake manifest for the Compact Domestic Aatamaker.
 * Starts with unverified catalog estimates that must be factory confirmed.
 */
export function createInitialCompactIntakeManifest(
  modelCode = "CALVIN-COMPACT-01",
  modelName = "CALVIN Compact Domestic Aatamaker"
): ModelAssetIntakeManifest {
  const cabinet_measurements: CabinetMeasurements = {
    width_mm: unverified(460, "Catalog estimate: 460mm wide"),
    height_mm: unverified(840, "Catalog estimate: 840mm tall including feet"),
    depth_mm: unverified(330, "Catalog estimate: 330mm deep"),
  };

  const panel_measurements: FrontPanelMeasurements = {
    width_mm: unverified(360, "Catalog estimate: 360mm door width"),
    height_mm: unverified(620, "Catalog estimate: 620mm door height"),
    thickness_mm: unverified(18, "Door panel thickness ~18mm"),
    corner_radius_mm: unverified(12, "Panel corner chamfer radius ~12mm"),
    safe_margin_top_mm: unverified(15, "15mm safe margin avoiding top hinge and logo margin"),
    safe_margin_bottom_mm: unverified(25, "25mm safe margin avoiding flour dispensing chute"),
    safe_margin_left_mm: unverified(15, "15mm safe margin avoiding side hinge"),
    safe_margin_right_mm: unverified(15, "15mm safe margin avoiding magnetic door catch"),
    nominal_bleed_mm: unverified(3, "3mm wrap-around bleed allowance"),
  };

  const obstacles: NonPrintableObstacle[] = [
    {
      id: "obs_handle_latch",
      name: "Front Door Catch / Handle",
      type: "handle",
      description: "Recessed finger pull or magnetic door catch on right edge",
      offset_x_mm: 330,
      offset_y_mm: 310,
      width_mm: 25,
      height_mm: 50,
      status: "unverified",
    },
    {
      id: "obs_chute_clearance",
      name: "Flour Dispenser Chute Zone",
      type: "dispensing_chute",
      description: "Clearance for flour exit spout and container lip",
      offset_x_mm: 30,
      offset_y_mm: 580,
      width_mm: 300,
      height_mm: 40,
      status: "unverified",
    },
    {
      id: "obs_vent_slits",
      name: "Motor Air Intake Louvers",
      type: "vent",
      description: "Side/bottom cooling vents",
      offset_x_mm: 40,
      offset_y_mm: 540,
      width_mm: 280,
      height_mm: 20,
      status: "unverified",
    },
  ];

  const brand_logo: OfficialBrandLogoAsset = {
    storage_path: "brand-assets/calvin-logo-official.svg",
    public_url: "",
    original_filename: "calvin-logo-official.svg",
    file_format: "svg",
    width_mm: 120,
    height_mm: 30,
    position_anchor: "top_center",
    offset_y_mm: 35,
    is_brand_approved: true,
    approval_date: "2026-11-03",
  };

  return {
    schema_version: "1.0.0",
    model_code: modelCode,
    model_name: modelName,
    machine_variant: "compact_domestic",
    intake_status: "pending_assets",
    reference_photos: [],
    cabinet_measurements,
    panel_measurements,
    obstacles,
    brand_logo,
    general_engineering_notes:
      "Asset intake initialized on 2026-11-03. All dimensions currently UNVERIFIED pending client photo upload and factory caliper measurements.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Serializes the intake manifest safely for embedding in model notes or storage.
 */
export function serializeIntakeManifest(manifest: ModelAssetIntakeManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Parses intake manifest from JSON string.
 */
export function parseIntakeManifest(jsonStr: string): ModelAssetIntakeManifest | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && parsed.schema_version === "1.0.0" && parsed.model_code) {
      return parsed as ModelAssetIntakeManifest;
    }
  } catch {
    // Return null if invalid JSON
  }
  return null;
}

/**
 * Generates the technical Blender 3D Modelling Handover Specification
 * dynamically reflecting the recorded physical specs and reference photos.
 */
export function generateBlenderSpecificationMarkdown(
  manifest: ModelAssetIntakeManifest
): string {
  const cab = manifest.cabinet_measurements;
  const pan = manifest.panel_measurements;

  return `# CALVIN AATAMAKER — 3D Asset Modelling Specification
## Model: ${manifest.model_name} (\`${manifest.model_code}\`)

**Specification Revision:** 1.0.0  
**Target Engine:** Three.js / WebGL (Next.js 15 Storefront)  
**Deliverable Format:** glTF 2.0 Binary (\`.glb\`)  
**Intake Status:** ${manifest.intake_status.toUpperCase()}

---

### 1. Model Hierarchy & Object Naming

The exported GLB must contain the following hierarchy. **Object names must be preserved exactly:**

\`\`\`
CALVIN_Compact_Root (Empty / Pivot at ground center)
├── Body_Cabinet (Mesh: Outer housing, sides, top, and base feet)
├── Top_Hopper_Assembly (Mesh: Grain hopper funnel, chrome trim, and lid)
├── Dispensing_Chute (Mesh: Lower flour spout and tray receiver)
├── Front_Door_Frame (Mesh: Door border, bevels, hinges, and latch)
└── Front_Print_Surface (Mesh: Exact planar front panel for dynamic canvas texture)
\`\`\`

> **CRITICAL REQUIREMENT:**
> The object \`Front_Print_Surface\` is the dynamic target where customer personalization textures are mapped in real time. It must be a separate object (or clearly separated polygon island) with its own material slot.

---

### 2. Physical Dimensions & Unit Scaling

* **Blender Scene Units:** Metric. Unit Scale: \`0.001\` (Millimeters) during modeling.
* **Export Unit Scale:** Meters (\`1.0\` unit = 1 meter). In the exported GLB, the machine dimensions must match:

| Dimension Element | Value (mm) | glTF Export (Meters) | Verification Status |
| :--- | :---: | :---: | :--- |
| **Cabinet Width** | ${cab.width_mm.value_mm} mm | ${(cab.width_mm.value_mm / 1000).toFixed(3)} m | ${cab.width_mm.status.toUpperCase()} |
| **Cabinet Height** | ${cab.height_mm.value_mm} mm | ${(cab.height_mm.value_mm / 1000).toFixed(3)} m | ${cab.height_mm.status.toUpperCase()} |
| **Cabinet Depth** | ${cab.depth_mm.value_mm} mm | ${(cab.depth_mm.value_mm / 1000).toFixed(3)} m | ${cab.depth_mm.status.toUpperCase()} |
| **Front Door Width** | ${pan.width_mm.value_mm} mm | ${(pan.width_mm.value_mm / 1000).toFixed(3)} m | ${pan.width_mm.status.toUpperCase()} |
| **Front Door Height** | ${pan.height_mm.value_mm} mm | ${(pan.height_mm.value_mm / 1000).toFixed(3)} m | ${pan.height_mm.status.toUpperCase()} |
| **Door Thickness** | ${pan.thickness_mm.value_mm} mm | ${(pan.thickness_mm.value_mm / 1000).toFixed(3)} m | ${pan.thickness_mm.status.toUpperCase()} |
| **Corner Radius** | ${pan.corner_radius_mm.value_mm} mm | ${(pan.corner_radius_mm.value_mm / 1000).toFixed(3)} m | ${pan.corner_radius_mm.status.toUpperCase()} |

---

### 3. Front Panel UV Mapping Specifications

The \`Front_Print_Surface\` object requires a strict planar UV unwrap:
1. **UV Channel:** \`UVMap\` (Channel 0).
2. **Coordinate Orientation:**
   * $(U=0.0, V=0.0)$ must correspond to the **Top-Left** of the front door panel.
   * $(U=1.0, V=1.0)$ must correspond to the **Bottom-Right** of the front door panel.
3. **Zero Distortion / Equal Aspect Ratio:**
   * The UV unwrap must not be stretched or squashed. The UV aspect ratio must match $\\frac{${pan.width_mm.value_mm}}{${pan.height_mm.value_mm}} = ${(pan.width_mm.value_mm / pan.height_mm.value_mm).toFixed(4)}$.
4. **No Overlapping Islands:** The printable surface must be a single continuous UV island covering the full $0..1$ UV bounding space.

---

### 4. Non-Printable Regions & Obstacle Cutouts

The 3D modeler must construct visible physical geometry for the following features, but ensure customer artwork remains clear of them:

${manifest.obstacles
  .map(
    (obs, idx) => `#### 4.${idx + 1} ${obs.name} (\`${obs.type}\`)
- **Location:** X: ${obs.offset_x_mm} mm, Y: ${obs.offset_y_mm} mm from top-left.
- **Dimensions:** Width: ${obs.width_mm} mm, Height: ${obs.height_mm} mm.
- **Status:** ${obs.status.toUpperCase()}.
- **Description:** ${obs.description || "N/A"}.`
  )
  .join("\n\n")}

---

### 5. Protected CALVIN Corporate Branding Envelope

* **Branding Strategy:** The official CALVIN brand logo is permanently positioned at:
  - **Position:** \`top_center\`
  - **Offset From Top Edge:** \`35 mm\`
  - **Dimensions:** \`120 mm\` width × \`30 mm\` height
* **Modeling Note:** Do NOT bake or paint customer artwork over this envelope. In the 3D model, the logo badge can be modeled as a slightly raised metallic decal or left as a defined coordinate area.

---

### 6. Materials & PBR Workflow

Use the glTF Metallic-Roughness PBR standard:

1. **\`mat_cabinet_body\` (Cabinet Housing & Sides):**
   - Base Color: Matte off-white / light cream powder coat (\`#F4F2EE\`).
   - Roughness: \`0.45\`
   - Metallic: \`0.05\`
2. **\`mat_front_print\` (Front Printable Door Panel):**
   - Base Color: Neutral White (\`#FFFFFF\`) — do NOT apply tint or baked shadows so dynamic customer artwork displays true-to-color.
   - Roughness: \`0.35\` (Semi-gloss smooth panel).
   - Metallic: \`0.00\`
3. **\`mat_chrome_accents\` (Hopper ring, hinges, latch):**
   - Base Color: Metallic Silver (\`#E2E8F0\`).
   - Roughness: \`0.10\`
   - Metallic: \`0.90\`
4. **\`mat_chute\` (Lower flour chute & tray):**
   - Base Color: Food-grade brushed stainless steel (\`#CBD5E1\`).
   - Roughness: \`0.25\`
   - Metallic: \`0.85\`

---

### 7. Performance Budget & GLB Export Settings

* **Polycount Target:** 15,000 to 30,000 triangles total (Max budget: 40,000 triangles).
* **Draw Calls:** Maximum 4 to 6 material slots.
* **Texture Sizes:** Ambient occlusion / metallic / roughness baked maps at max \`2048×2048\` (WEBP or optimized PNG).
* **File Size:** Under \`10 MB\` (Target: \`3 to 6 MB\`).

#### Blender GLB Export Checklist:
- [x] Format: **glTF Binary (\`.glb\`)**
- [x] Include: **Selected Objects** only
- [x] Transform: **+Y Up, +Z Forward**
- [x] Geometry: **Apply Modifiers = True**
- [x] Geometry: **UVs = True, Normals = True, Tangents = True**
- [x] Materials: **Export Materials = True**
- [x] Animation: **Disabled** (No shape keys or armatures)
- [x] Compression: **Draco compression DISABLED** (to ensure fast mobile WebGL initialization without extra web-workers)

---
*Generated by CALVIN AATAMAKER Asset Intake Studio • ${new Date().toISOString().split("T")[0]}*
`;
}

