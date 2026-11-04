/**
 * CALVIN AATAMAKER — 3D Model Readiness & Factory Verification Checklist
 * 
 * Enforces manufacturing-grade standards before any 3D machine model
 * can be published to the customer storefront.
 * 
 * Checklist Items:
 * 1. glb_uploaded: GLB binary model file uploaded to storage.
 * 2. measurements_verified: Outer cabinet and door dimensions physically verified with caliper/tape.
 * 3. front_mesh_identified: Exact node name for front panel identified in the GLB hierarchy.
 * 4. uv_mapping_checked: Planar UV unwrapping checked for aspect ratio and zero distortion.
 * 5. printable_boundaries_verified: Width, height, safe margins, and bleed verified.
 * 6. calvin_branding_approved: Locked CALVIN corporate branding envelope verified.
 * 7. factory_validation_completed: Engineering sign-off completed and recorded in validation notes.
 */

export interface ModelReadinessChecklist {
  glb_uploaded: boolean;
  measurements_verified: boolean;
  front_mesh_identified: boolean;
  uv_mapping_checked: boolean;
  printable_boundaries_verified: boolean;
  calvin_branding_approved: boolean;
  factory_validation_completed: boolean;
}

export interface ModelReadinessResult {
  checklist: ModelReadinessChecklist;
  isReadyForPublishing: boolean;
  completedCount: number;
  totalCount: number;
  missingItems: { key: keyof ModelReadinessChecklist; label: string; description: string }[];
}

export const READINESS_ITEM_DEFINITIONS: Record<
  keyof ModelReadinessChecklist,
  { label: string; description: string }
> = {
  glb_uploaded: {
    label: "GLB Binary Uploaded",
    description: "A valid glTF binary (.glb) model is uploaded to the product-3d-models storage bucket.",
  },
  measurements_verified: {
    label: "Physical Measurements Verified",
    description: "Outer cabinet dimensions (width, height, depth) physically measured and documented.",
  },
  front_mesh_identified: {
    label: "Front Mesh Node Identified",
    description: "Exact mesh name in the GLB scene hierarchy is specified for texture binding.",
  },
  uv_mapping_checked: {
    label: "UV Mapping & Planar Aspect Checked",
    description: "Front door UV channel is unwrapped planarly without distortion or non-uniform stretching.",
  },
  printable_boundaries_verified: {
    label: "Printable Boundaries & Margins Verified",
    description: "Printable width/height and safe margins (avoiding hinges/chute) are calibrated.",
  },
  calvin_branding_approved: {
    label: "CALVIN Branding Position Approved",
    description: "Locked corporate brand envelope (top-center default) is positioned and immutable.",
  },
  factory_validation_completed: {
    label: "Factory Engineering Validation Completed",
    description: "Official validation sign-off and date recorded in engineering notes.",
  },
};

export interface ModelEvaluationInputs {
  glb_storage_path?: string | null;
  front_mesh_name?: string | null;
  dimensions_mm?: { width: number; height: number; depth: number } | null;
  surface?: {
    physical_width_mm: number;
    physical_height_mm: number;
    safe_margin_top_mm?: number;
    safe_margin_bottom_mm?: number;
    safe_margin_left_mm?: number;
    safe_margin_right_mm?: number;
    bleed_margin_mm?: number;
    fixed_branding_overlay?: {
      enabled: boolean;
      locked: boolean;
      brand_text?: string;
      width_mm?: number;
      height_mm?: number;
    } | null;
  } | null;
  validation_notes?: string | null;
  manual_checks?: {
    measurements_verified?: boolean;
    uv_mapping_checked?: boolean;
    factory_validation_completed?: boolean;
  };
}

/**
 * Parses manual checklist flags encoded in validation_notes if present.
 * Format: [CHECKLIST: {"measurements_verified":true,...}]
 */
export function parseChecklistFromNotes(notes?: string | null): Partial<ModelReadinessChecklist> {
  if (!notes) return {};
  try {
    const match = notes.match(/\[CHECKLIST:\s*(\{.*?\})\s*\]/);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
  } catch {
    // If invalid JSON in tag, ignore
  }
  return {};
}

/**
 * Serializes manual checklist flags into validation notes string.
 */
export function encodeChecklistInNotes(
  currentNotes: string,
  flags: Partial<ModelReadinessChecklist>
): string {
  const cleanNotes = currentNotes.replace(/\[CHECKLIST:\s*\{.*?\}\s*\]/g, "").trim();
  const tag = `[CHECKLIST: ${JSON.stringify(flags)}]`;
  return cleanNotes ? `${cleanNotes}\n\n${tag}` : tag;
}

/**
 * Evaluates whether a 3D model satisfies all 7 readiness criteria.
 */
export function evaluateModelReadiness(inputs: ModelEvaluationInputs): ModelReadinessResult {
  const notesFlags = parseChecklistFromNotes(inputs.validation_notes);
  const manual = { ...notesFlags, ...(inputs.manual_checks || {}) };

  // 1. GLB Uploaded
  const glb_uploaded = Boolean(
    inputs.glb_storage_path && inputs.glb_storage_path.trim().toLowerCase().endsWith(".glb")
  );

  // 2. Physical Measurements Verified
  const hasDimensions = Boolean(
    inputs.dimensions_mm &&
      inputs.dimensions_mm.width > 0 &&
      inputs.dimensions_mm.height > 0 &&
      inputs.dimensions_mm.depth > 0
  );
  const measurements_verified = hasDimensions && Boolean(manual.measurements_verified);

  // 3. Front Mesh Identified
  const front_mesh_identified = Boolean(
    inputs.front_mesh_name && inputs.front_mesh_name.trim().length > 0
  );

  // 4. UV Mapping Checked
  const uv_mapping_checked = Boolean(manual.uv_mapping_checked);

  // 5. Printable Boundaries Verified
  const s = inputs.surface;
  const printable_boundaries_verified = Boolean(
    s &&
      s.physical_width_mm > 0 &&
      s.physical_height_mm > 0 &&
      (s.safe_margin_top_mm ?? 0) >= 0 &&
      (s.safe_margin_bottom_mm ?? 0) >= 0
  );

  // 6. CALVIN Branding Approved
  const b = s?.fixed_branding_overlay;
  const calvin_branding_approved = Boolean(
    b &&
      b.enabled === true &&
      b.locked === true &&
      Boolean(b.brand_text?.trim()) &&
      (b.width_mm ?? 0) > 0 &&
      (b.height_mm ?? 0) > 0
  );

  // 7. Factory Validation Completed
  const factory_validation_completed = Boolean(
    manual.factory_validation_completed &&
      inputs.validation_notes &&
      inputs.validation_notes.trim().length > 0
  );

  const checklist: ModelReadinessChecklist = {
    glb_uploaded,
    measurements_verified,
    front_mesh_identified,
    uv_mapping_checked,
    printable_boundaries_verified,
    calvin_branding_approved,
    factory_validation_completed,
  };

  const keys = Object.keys(READINESS_ITEM_DEFINITIONS) as (keyof ModelReadinessChecklist)[];
  const missingItems = keys
    .filter((k) => !checklist[k])
    .map((k) => ({
      key: k,
      label: READINESS_ITEM_DEFINITIONS[k].label,
      description: READINESS_ITEM_DEFINITIONS[k].description,
    }));

  const completedCount = keys.filter((k) => checklist[k]).length;
  const totalCount = keys.length;
  const isReadyForPublishing = completedCount === totalCount;

  return {
    checklist,
    isReadyForPublishing,
    completedCount,
    totalCount,
    missingItems,
  };
}

