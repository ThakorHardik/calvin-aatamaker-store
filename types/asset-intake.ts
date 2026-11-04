/**
 * CALVIN AATAMAKER — Machine Model Asset Intake Types
 * 
 * Defines data structures for:
 * 1. Multi-angle reference photography intake (uncompressed, full resolution).
 * 2. Physical millimeter measurements with strict verification tracking
 *    (Unverified vs. Factory Confirmed).
 * 3. Non-printable zone boundaries (door handles, dispensing chute, vents).
 * 4. Separate official CALVIN corporate logo vector/raster intake.
 * 5. Complete Blender 3D modeling handover manifest.
 */

export type ReferencePhotoAngle =
  | "front_ortho"
  | "back_ortho"
  | "left_side"
  | "right_side"
  | "top_view"
  | "perspective_fl"
  | "perspective_fr"
  | "panel_closeup"
  | "chute_closeup"
  | "branding_closeup"
  | "measurement_evidence"
  | "general_reference";

export interface ReferencePhoto {
  id: string;
  angle: ReferencePhotoAngle;
  label: string;
  storage_path: string;
  public_url: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  width_px?: number;
  height_px?: number;
  uploaded_at: string;
  notes?: string;
}

export type MeasurementVerificationStatus = "unverified" | "factory_confirmed";

export interface MeasurementField {
  value_mm: number;
  status: MeasurementVerificationStatus;
  tolerance_mm?: number;
  measured_by?: string;
  measured_at?: string;
  measurement_tool?: string;
  notes?: string;
  evidence_photo_id?: string;
}

export interface CabinetMeasurements {
  width_mm: MeasurementField;
  height_mm: MeasurementField;
  depth_mm: MeasurementField;
}

export interface FrontPanelMeasurements {
  width_mm: MeasurementField;
  height_mm: MeasurementField;
  thickness_mm: MeasurementField;
  corner_radius_mm: MeasurementField;
  safe_margin_top_mm: MeasurementField;
  safe_margin_bottom_mm: MeasurementField;
  safe_margin_left_mm: MeasurementField;
  safe_margin_right_mm: MeasurementField;
  nominal_bleed_mm: MeasurementField;
}

export interface NonPrintableObstacle {
  id: string;
  name: string;
  type: "handle" | "vent" | "dispensing_chute" | "display" | "switch" | "hinge" | "bevel";
  description?: string;
  /** Millimeter bounding box relative to front panel top-left corner */
  offset_x_mm: number;
  offset_y_mm: number;
  width_mm: number;
  height_mm: number;
  status: MeasurementVerificationStatus;
}

export interface OfficialBrandLogoAsset {
  storage_path: string;
  public_url: string;
  original_filename: string;
  file_format: "svg" | "png";
  width_mm: number;
  height_mm: number;
  position_anchor: "top_center" | "top_left" | "top_right";
  offset_y_mm: number;
  is_brand_approved: boolean;
  approval_date?: string;
}

export interface ModelAssetIntakeManifest {
  schema_version: "1.0.0";
  model_code: string;
  model_name: string;
  machine_variant: "compact_domestic" | "standard_domestic" | "commercial";
  intake_status:
    | "pending_assets"
    | "photos_in_progress"
    | "measurements_recorded"
    | "ready_for_blender"
    | "blender_in_progress"
    | "completed";
  reference_photos: ReferencePhoto[];
  cabinet_measurements: CabinetMeasurements;
  panel_measurements: FrontPanelMeasurements;
  obstacles: NonPrintableObstacle[];
  brand_logo?: OfficialBrandLogoAsset;
  general_engineering_notes?: string;
  created_at: string;
  updated_at: string;
}

export const PHOTO_ANGLE_DEFINITIONS: Record<
  ReferencePhotoAngle,
  { label: string; description: string; required: boolean }
> = {
  front_ortho: {
    label: "Front Elevation (Orthographic)",
    description: "Straight-on shot of the front panel, camera parallel to door, zero perspective tilt.",
    required: true,
  },
  back_ortho: {
    label: "Rear Elevation",
    description: "Rear panel showing power cord entry, vents, and service label placement.",
    required: false,
  },
  left_side: {
    label: "Left Elevation",
    description: "Straight-on left side view showing cabinet depth, door hinges, and seam lines.",
    required: true,
  },
  right_side: {
    label: "Right Elevation",
    description: "Straight-on right side view showing handle latch, power switch, and seam lines.",
    required: true,
  },
  top_view: {
    label: "Top View",
    description: "Looking straight down at the grain hopper opening and lid geometry.",
    required: true,
  },
  perspective_fl: {
    label: "Front-Left 3/4 Perspective",
    description: "45-degree angle showing front door and left side simultaneously for bevel curvature.",
    required: true,
  },
  perspective_fr: {
    label: "Front-Right 3/4 Perspective",
    description: "45-degree angle showing front door and right side latch/handle simultaneously.",
    required: true,
  },
  panel_closeup: {
    label: "Front Panel Surface Close-up",
    description: "Macro photo under diffused light showing door material finish, sheen, and edge bevels.",
    required: true,
  },
  chute_closeup: {
    label: "Dispensing Chute Close-up",
    description: "Detailed view of the bottom flour discharge chute, door clearance, and collection zone.",
    required: true,
  },
  branding_closeup: {
    label: "Factory Branding Stamp Close-up",
    description: "Close-up of the existing CALVIN badge/decal with measurement scale next to it.",
    required: true,
  },
  measurement_evidence: {
    label: "Measurement Evidence (Ruler/Caliper)",
    description: "Photo showing vernier caliper or steel rule directly against critical dimensions.",
    required: true,
  },
  general_reference: {
    label: "General Reference / Environment",
    description: "Machine situated in domestic kitchen or factory testing environment.",
    required: false,
  },
};

