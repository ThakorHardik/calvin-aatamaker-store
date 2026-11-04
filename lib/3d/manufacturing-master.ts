/**
 * CALVIN AATAMAKER — Printer-Independent Manufacturing Master Pipeline
 * 
 * 1. Defines the printer-agnostic master document schema.
 * 2. Does NOT hardcode 300 DPI, bleed, PDF/TIFF specifications, or printing method.
 * 3. Enforces that final production export remains strictly disabled until
 *    factory printing technology, ink profiles, and substrate tolerances are formally approved.
 */

import type {
  CanvasLayer,
  Product3DModel,
  ProductPrintableSurface,
  PrinterIndependentMaster,
} from "@/types/3d-model";

/**
 * Constructs a normalized, printer-independent master record from an active customer design session.
 */
export function buildPrinterIndependentMaster(params: {
  model: Product3DModel;
  surface: ProductPrintableSurface;
  layers: CanvasLayer[];
  orderReference?: string;
  approvedPrintingSpecs?: {
    method: string;
    resolutionDpi: number;
    colorProfile: string;
    fileFormat: "pdf" | "tiff" | "svg";
  };
}): PrinterIndependentMaster {
  const { model, surface, layers, orderReference, approvedPrintingSpecs } = params;

  // Final export is enabled ONLY if approved printing specifications are supplied
  // and the machine model is in a validated or published state.
  const isApproved =
    Boolean(approvedPrintingSpecs?.method) &&
    model.status === "published" &&
    surface.status === "published";

  return {
    schema_version: "1.0.0",
    order_reference: orderReference,
    model_code: model.model_code,
    surface_key: surface.surface_key,
    physical_specifications: {
      width_mm: surface.physical_width_mm,
      height_mm: surface.physical_height_mm,
      safe_margin_top_mm: surface.safe_margins_mm.top,
      safe_margin_bottom_mm: surface.safe_margins_mm.bottom,
      safe_margin_left_mm: surface.safe_margins_mm.left,
      safe_margin_right_mm: surface.safe_margins_mm.right,
      nominal_bleed_mm: surface.safe_margins_mm.bleed,
    },
    design_layers: layers.filter((l) => l.visible),
    fixed_branding_snapshot: surface.fixed_branding,
    export_status: {
      is_export_enabled: isApproved,
      block_reason: isApproved
        ? undefined
        : "Production export is disabled: Factory printing technology, substrate specifications, and color profiles are pending formal manufacturer sign-off.",
      approved_printing_method: approvedPrintingSpecs?.method,
      approved_resolution_dpi: approvedPrintingSpecs?.resolutionDpi,
      approved_color_profile: approvedPrintingSpecs?.colorProfile,
      approved_file_format: approvedPrintingSpecs?.fileFormat,
    },
  };
}

/**
 * Validates whether a customer design is structurally complete for manufacturing archiving.
 */
export function validateDesignForArchival(
  layers: CanvasLayer[],
): { isValid: boolean; error?: string } {
  if (!Array.isArray(layers)) {
    return { isValid: false, error: "Invalid design payload: layers array missing." };
  }

  // Count active customer layers (excluding locked branding)
  const customerLayers = layers.filter(
    (l) => l.visible && l.type !== "locked_branding" && l.type !== "cutout_mask",
  );

  if (customerLayers.length === 0) {
    return {
      isValid: false,
      error: "Design contains no active customer elements. Please add at least one photo or text layer.",
    };
  }

  for (const layer of customerLayers) {
    if (layer.type === "photo" && !layer.imageUrl) {
      return { isValid: false, error: `Photo layer "${layer.name}" is missing an image source.` };
    }
    if (layer.type === "text" && (!layer.text || layer.text.trim().length === 0)) {
      return { isValid: false, error: `Text layer "${layer.name}" is empty.` };
    }
  }

  return { isValid: true };
}

