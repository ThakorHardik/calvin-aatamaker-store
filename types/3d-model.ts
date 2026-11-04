/**
 * CALVIN AATAMAKER — 3D Product Personalization & Model Management Types
 * 
 * Defines canonical data contracts for:
 * 1. Physical machine model profiles and versioning.
 * 2. Printable front-panel surface specifications and millimeter dimensions.
 * 3. Protected CALVIN branding envelope and cutout masks.
 * 4. Normalized 2D canonical design canvas layers (independent of 3D UV space).
 * 5. Printer-independent manufacturing master document.
 */

export type ModelLifecycleStatus = "draft" | "validated" | "published" | "archived";
export type SurfaceLifecycleStatus = "draft" | "calibrated" | "validated" | "published";

export interface ModelReadinessChecklist {
  glb_uploaded: boolean;
  measurements_verified: boolean;
  front_mesh_identified: boolean;
  uv_mapping_checked: boolean;
  printable_boundaries_verified: boolean;
  calvin_branding_approved: boolean;
  factory_validation_completed: boolean;
}

export interface DimensionsMm {
  width: number;
  height: number;
  depth: number;
}

export interface ProtectedBrandingConfig {
  enabled: boolean;
  locked: boolean;
  brand_text?: string;
  logo_asset_path?: string;
  /** Anchor position on the printable surface */
  position: "top_center" | "top_left" | "top_right" | "bottom_center" | "bottom_left" | "bottom_right";
  /** Offsets from anchor in millimeters */
  offset_x_mm: number;
  offset_y_mm: number;
  width_mm: number;
  height_mm: number;
}

export interface SafeMarginMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
  bleed: number;
}

export interface UvMappingConfig {
  uv_channel: number;
  u_min: number;
  u_max: number;
  v_min: number;
  v_max: number;
  flip_y: boolean;
  rotation_deg: number;
}

export interface CutoutZone {
  id: string;
  name: string;
  type: "handle" | "hinge" | "display" | "latch" | "custom";
  /** Normalized bounding box in 0..1 UV coordinate space */
  x: number;
  y: number;
  width: number;
  height: number;
  is_non_printable: boolean;
}

/**
 * Physical 3D Machine Model Profile (e.g. CALVIN Classic, CALVIN Slim)
 */
export interface Product3DModel {
  id: string;
  product_id: string | null;
  product_name?: string;
  model_code: string;
  name: string;
  description?: string | null;
  version: number;
  status: ModelLifecycleStatus;
  is_active: boolean;
  dimensions_mm: DimensionsMm;
  glb_storage_path: string | null;
  thumbnail_path: string | null;
  front_mesh_name: string;
  validation_notes?: string | null;
  validated_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Front-panel printable surface calibration
 */
export interface ProductPrintableSurface {
  id: string;
  model_id: string;
  surface_key: string;
  surface_name: string;
  mesh_target_name: string;
  material_slot_name: string;
  physical_width_mm: number;
  physical_height_mm: number;
  safe_margins_mm: SafeMarginMm;
  fixed_branding: ProtectedBrandingConfig;
  uv_mapping: UvMappingConfig;
  cutout_zones: CutoutZone[];
  status: SurfaceLifecycleStatus;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Canonical 2D Canvas Layer Model (Normalized 0..1 Coordinate System)
// -----------------------------------------------------------------------------

export type LayerType = "photo" | "text" | "locked_branding" | "cutout_mask";

export interface BaseLayer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  /** Normalized coordinates: x, y in range [0, 1] relative to printable surface */
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export interface PhotoLayer extends BaseLayer {
  type: "photo";
  imageUrl: string;
  storagePath?: string;
  originalFilename?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  assetId?: string;
  sourceWidthPx: number;
  sourceHeightPx: number;
  filterPreset?: "none" | "warm" | "grayscale" | "sepia";
  /** Normalized crop coordinates (0..1 relative to source image) */
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  fontFamily: string;
  fontSizePt: number;
  fillColorHex: string;
  textAlign: "left" | "center" | "right";
  fontWeight: "normal" | "bold";
  isCurved?: boolean;
  curveRadius?: number;
}

export interface LockedBrandingLayer extends BaseLayer {
  type: "locked_branding";
  brandText: string;
  logoAssetUrl?: string;
}

export interface CutoutMaskLayer extends BaseLayer {
  type: "cutout_mask";
  cutoutType: "handle" | "hinge" | "display" | "latch";
}

export type CanvasLayer = PhotoLayer | TextLayer | LockedBrandingLayer | CutoutMaskLayer;

export interface CanonicalDesignDocument {
  version: 1;
  model_code: string;
  surface_key: string;
  unit: "normalized_0_1";
  layers: CanvasLayer[];
  metadata: {
    client_app_version: string;
    last_modified: string;
    undo_steps_count?: number;
  };
}

// -----------------------------------------------------------------------------
// Printer-Independent Manufacturing Master Specification
// -----------------------------------------------------------------------------

export interface PrinterIndependentMaster {
  schema_version: "1.0.0";
  order_reference?: string;
  model_code: string;
  surface_key: string;
  physical_specifications: {
    width_mm: number;
    height_mm: number;
    safe_margin_top_mm: number;
    safe_margin_bottom_mm: number;
    safe_margin_left_mm: number;
    safe_margin_right_mm: number;
    nominal_bleed_mm: number;
  };
  design_layers: CanvasLayer[];
  fixed_branding_snapshot: ProtectedBrandingConfig;
  export_status: {
    is_export_enabled: boolean;
    block_reason?: string;
    approved_printing_method?: string;
    approved_resolution_dpi?: number;
    approved_color_profile?: string;
    approved_file_format?: "pdf" | "tiff" | "svg";
  };
}

