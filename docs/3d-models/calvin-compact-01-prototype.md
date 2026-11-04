# CALVIN AATAMAKER — CALVIN-COMPACT-01 3D Prototype Specification

**Document Code:** `SPEC-3D-COMPACT-01-V1`  
**Model Code:** `CALVIN-COMPACT-01`  
**Classification:** Prototype Visual Model (Provisional Dimensions)  
**GLB Asset Path:** `public/models/calvin-compact-01-prototype.glb`  
**Blender Script:** `blender/generate_calvin_compact_01.py`  
**Renderer Script:** `scripts/render_prototype_views.py`  
**Official Logo Asset:** `public/images/calvin-aatamaker-logo.png` (2048 × 893 transparent PNG)

---

## 1. Executive Summary & Verification Criteria

This 3D prototype represents the first visual construction for **CALVIN-COMPACT-01**, based on approved promotional references and client intake photographs (`public/images/compact-atta-chakki-source.jpeg`).

### Verified Requirements:
1. **Dimensions:** Overall approved prototype envelope of **480 mm (Width) × 340 mm (Depth) × 880 mm (Height)**.
2. **Branding Integrity:**
   - The reference photograph's former "MILAN" badge has been **completely removed**.
   - Exactly **ONE** company logo is present across the entire machine: the official **CALVIN Aatamaker** badge in the upper-front door position.
   - The logo is a fixed 3D mesh node (`Calvin_Fixed_Logo`) textured with `public/images/calvin-aatamaker-logo.png`. It is physically separated (+1mm forward) and immutable, preventing customer artwork occlusion or tampering.
3. **Printable Surface Neutrality:**
   - The floral/stone decorative pattern visible in the intake photograph was identified as non-structural sample artwork.
   - The 3D model door surface (`Front_Print_Surface`) is a clean, neutral, dark matte finish (`#18181C`) ready for dynamic customer personalisation.
4. **Coordinate Interpretation:**
   - **Width ($X$ axis):** Left to right across the front cabinet ($0.480\text{ m}$).
   - **Height ($Y$ axis):** Vertical bottom of caster wheels to top of hopper cap ($0.880\text{ m}$).
   - **Depth ($Z$ axis):** Front door face to rear service panel ($0.340\text{ m}$).

---

## 2. Multi-Angle Verification Renders

All renders were generated from the 3D model geometry using calibrated 3-point studio lighting (Warm Key Light, Cool Fill Light, Sharp Rim Light, Ambient Base):

| Angle | Dimensions | Output Path | Key Visual Features Verified |
| :--- | :--- | :--- | :--- |
| **Front Elevation** | 480 × 880 mm | `docs/3d-models/renders/front_elevation.png` | Official CALVIN logo in upper-front location; zero MILAN branding; clean unpatterned dark printable door; lower ventilation slits; right-side handle bar. |
| **Left Elevation** | 340 × 880 mm | `docs/3d-models/renders/left_elevation.png` | Recessed side panel sheet; top cap overhang; hopper ring profile; bottom pedestal and industrial caster wheels. |
| **Right Elevation** | 340 × 880 mm | `docs/3d-models/renders/right_elevation.png` | Ergonomic brushed-chrome vertical handle with standoff brackets; right caster wheel pair; cabinet door frame gap. |
| **3/4 Isometric Perspective** | 480 × 340 × 880 mm | `docs/3d-models/renders/perspective_3qtr.png` | 45-degree studio perspective showing front printable door, top stainless hopper inlet ring, chrome handle, and cabinet contour lines. |

---

## 3. 3D Object Hierarchy

The binary glTF (`.glb`) model strictly adheres to the approved 12-component hierarchy:

```text
CALVIN_Compact_Root
  ├── Bottom_Base                (Cast pedestal, 460 x 40 x 320 mm)
  ├── Wheels                     (4 industrial rubber casters + chrome brackets)
  │     ├── Wheel_1
  │     ├── Wheel_2
  │     ├── Wheel_3
  │     └── Wheel_4
  ├── Cabinet_Body               (Main housing, 476 x 760 x 336 mm, matte charcoal #1A1A1E)
  ├── Left_Side_Panel            (Recessed acoustic/cooling sheet, 4 x 730 x 310 mm)
  ├── Right_Side_Panel           (Recessed acoustic/cooling sheet, 4 x 730 x 310 mm)
  ├── Rear_Panel                 (Service access panel, 460 x 730 x 4 mm)
  ├── Top_Panel                  (Overhanging top cap + stainless hopper funnel inlet)
  ├── Front_Door_Frame           (Door structural border, 450 x 710 x 12 mm)
  ├── Front_Print_Surface        (Dedicated planar printable mesh: 380 x 620 mm, Z=0.172m)
  ├── Front_Handle               (Ergonomic brushed metal bar: Ø14mm x 140mm + dual standoffs)
  ├── Ventilation_Grille         (4 horizontal cooling louvers near base of door)
  └── Calvin_Fixed_Logo          (Upper-front branding plane: 120 x 52.3 mm, Z=0.173m)
```

---

## 4. Materials & UV Mapping Specifications

| Material Slot | Name | Type | Properties | Mapped Object |
| :--- | :--- | :--- | :--- | :--- |
| `mat_cabinet_body` | Matte Cabinet Powder Coat | PBR Metallic-Roughness | Color: `#1A1A1E`, Roughness: `0.45`, Metalness: `0.15` | `Cabinet_Body`, `Rear_Panel`, `Top_Panel` |
| `mat_side_panel` | Side Panel Sheet | PBR Metallic-Roughness | Color: `#151518`, Roughness: `0.50`, Metalness: `0.10` | `Left_Side_Panel`, `Right_Side_Panel` |
| `mat_bottom_base` | Cast Pedestal Base | PBR Metallic-Roughness | Color: `#111113`, Roughness: `0.60`, Metalness: `0.20` | `Bottom_Base` |
| `mat_chrome_accents` | Brushed Chrome Accents | PBR Metallic-Roughness | Color: `#E2E8F0`, Roughness: `0.15`, Metalness: `0.85` | `Front_Handle`, `Hopper_Ring`, Caster Brackets |
| `mat_front_print` | Customizable Door Surface | PBR Metallic-Roughness + Dynamic CanvasTexture | Color: `#18181C`, Roughness: `0.35`, Metalness: `0.05` | `Front_Print_Surface` |
| `mat_calvin_fixed_logo` | Official Branding Badge | PBR Transparent Texture | AlphaTest: `0.05`, Roughness: `0.20`, Metalness: `0.10` | `Calvin_Fixed_Logo` |
| `mat_rubber_wheels` | Industrial Caster Rubber | PBR Metallic-Roughness | Color: `#0A0A0C`, Roughness: `0.80`, Metalness: `0.05` | `Wheels` |

### Planar UV Layout for `Front_Print_Surface`:
- **Dimensions:** $380\text{ mm (Width)} \times 620\text{ mm (Height)}$.
- **Mapping:** Direct normalized planar coordinates:
  - $(U=0.0, V=0.0)$ $\rightarrow$ Top-Left corner.
  - $(U=1.0, V=0.0)$ $\rightarrow$ Top-Right corner.
  - $(U=0.0, V=1.0)$ $\rightarrow$ Bottom-Left corner.
  - $(U=1.0, V=1.0)$ $\rightarrow$ Bottom-Right corner.
- **Dynamic Projector:** Real-time Three.js `CanvasTexture` updated from 2D Konva/Canvas layers at $1024 \times 1670\text{ px}$.

---

## 5. Provisional vs. Confirmed Specifications Table

In accordance with strict manufacturing guidelines, all dimensions are clearly categorized:

| Dimension / Feature | Value | Status | Source / Evidence |
| :--- | :--- | :--- | :--- |
| Overall Machine Width | 480 mm | **Provisional Prototype** | Promotional specification image (`public/images/compact-atta-chakki.jpeg`) |
| Overall Machine Depth | 340 mm | **Provisional Prototype** | Promotional specification image (`public/images/compact-atta-chakki.jpeg`) |
| Overall Machine Height | 880 mm | **Provisional Prototype** | Promotional specification image (`public/images/compact-atta-chakki.jpeg`) |
| Front Door Width | 380 mm | **Provisional** | Derived model door frame aperture (Awaiting caliper measurement) |
| Front Door Height | 620 mm | **Provisional** | Derived model door frame aperture (Awaiting caliper measurement) |
| Door Safe Margin (Top) | 15 mm | **Provisional** | Factory clearance rule recommendation |
| Door Safe Margin (Bottom)| 25 mm | **Provisional** | Clearance above ventilation louvers |
| Door Safe Margin (Sides)| 15 mm | **Provisional** | Edge clearance for door seal and hinges |
| CALVIN Logo Width | 120 mm | **Approved Visual** | 2048 × 893 aspect ratio ($2.293:1$) proportional scaling |
| CALVIN Logo Position | Upper-front door center | **Confirmed Design Rule** | Replacing obsolete MILAN badge |
| MILAN Branding | Removed | **Confirmed Rule** | Brand policy: zero unauthorized logos |
| Front Door Base Finish | Neutral Dark `#18181C` | **Confirmed Design Rule** | Clean canvas for customer designs |

---

## 6. Three.js Viewport Integration Checklist

The live storefront component `components/customizer/3d-viewport-preview.tsx` implements:
- [x] WebGL renderer with ACES Filmic tone mapping and shadow tone depth.
- [x] `OrbitControls` with smooth damping (`dampingFactor: 0.05`).
- [x] Azimuth 360-degree rotation enabled.
- [x] Polar angle constraints: $0.12\pi$ to $0.52\pi$ (prevents viewing underneath machine or clipping bottom wheels).
- [x] Zoom boundaries: $0.75\text{ m}$ to $2.6\text{ m}$.
- [x] Dynamic `CanvasTexture` projection reflecting customer photo uploads, text layers, rotations, and opacities in real time.
- [x] Permanent, fixed `Calvin_Fixed_Logo` textured with official transparent PNG.
- [x] Responsive layout with `ResizeObserver`.
- [x] Camera preset buttons: Front Elevation, 3/4 Perspective, Right Profile, Reset.

