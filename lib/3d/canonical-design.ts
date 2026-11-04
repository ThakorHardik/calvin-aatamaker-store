/**
 * CALVIN AATAMAKER — Canonical Design Coordinate System & Protection Utilities
 * 
 * 1. Normalized 2D printable-surface coordinates ([0.0, 1.0]).
 * 2. Strict decoupling of 2D design coordinates from 3D model mesh UVs.
 * 3. Enforces protected CALVIN branding envelope so customer artwork cannot obscure brand marks.
 * 4. Cutout mask detection (hinges, latches, handles, display bezels).
 * 5. Undo/Redo design history state manager.
 */

import type {
  ProtectedBrandingConfig,
  SafeMarginMm,
} from "@/types/3d-model";

export interface BoundingBox2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts millimeter measurements into normalized [0, 1] surface coordinates.
 */
export function mmToNormalized(
  valMm: number,
  dimensionMm: number,
): number {
  if (dimensionMm <= 0) return 0;
  return Math.max(0, Math.min(1, valMm / dimensionMm));
}

/**
 * Converts normalized [0, 1] coordinates into millimeters.
 */
export function normalizedToMm(
  normalizedVal: number,
  dimensionMm: number,
): number {
  return normalizedVal * dimensionMm;
}

/**
 * Converts normalized [0, 1] coordinates into viewport screen canvas pixels.
 */
export function normalizedToPixels(
  normalizedVal: number,
  pixelDimension: number,
): number {
  return normalizedVal * pixelDimension;
}

/**
 * Converts screen canvas pixels into normalized [0, 1] coordinates.
 */
export function pixelsToNormalized(
  pixelVal: number,
  pixelDimension: number,
): number {
  if (pixelDimension <= 0) return 0;
  return Math.max(0, Math.min(1, pixelVal / pixelDimension));
}

/**
 * Computes the normalized bounding box for the protected CALVIN branding region
 * based on the machine model's millimeter physical specification.
 */
export function computeNormalizedBrandingBox(
  branding: ProtectedBrandingConfig,
  surfaceWidthMm: number,
  surfaceHeightMm: number,
): BoundingBox2D {
  if (!branding.enabled || surfaceWidthMm <= 0 || surfaceHeightMm <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const normWidth = branding.width_mm / surfaceWidthMm;
  const normHeight = branding.height_mm / surfaceHeightMm;
  const normOffsetX = branding.offset_x_mm / surfaceWidthMm;
  const normOffsetY = branding.offset_y_mm / surfaceHeightMm;

  let normX = 0;
  let normY = 0;

  switch (branding.position) {
    case "top_center":
      normX = (1 - normWidth) / 2 + normOffsetX;
      normY = normOffsetY;
      break;
    case "top_left":
      normX = normOffsetX;
      normY = normOffsetY;
      break;
    case "top_right":
      normX = 1 - normWidth - normOffsetX;
      normY = normOffsetY;
      break;
    case "bottom_center":
      normX = (1 - normWidth) / 2 + normOffsetX;
      normY = 1 - normHeight - normOffsetY;
      break;
    case "bottom_left":
      normX = normOffsetX;
      normY = 1 - normHeight - normOffsetY;
      break;
    case "bottom_right":
      normX = 1 - normWidth - normOffsetX;
      normY = 1 - normHeight - normOffsetY;
      break;
  }

  return {
    x: Math.max(0, Math.min(1 - normWidth, normX)),
    y: Math.max(0, Math.min(1 - normHeight, normY)),
    width: Math.min(1, normWidth),
    height: Math.min(1, normHeight),
  };
}

/**
 * Checks whether two 2D axis-aligned bounding boxes overlap.
 */
export function doBoxesOverlap(a: BoundingBox2D, b: BoundingBox2D): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
    return false;
  }
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Validates that customer artwork does NOT overlap the protected CALVIN branding envelope.
 * Returns true if the position is safe, or false if it intrudes on the protected zone.
 */
export function isPlacementSafeFromProtectedBranding(
  layerBox: BoundingBox2D,
  branding: ProtectedBrandingConfig,
  surfaceWidthMm: number,
  surfaceHeightMm: number,
): { isSafe: boolean; conflictReason?: string } {
  if (!branding.enabled || !branding.locked) {
    return { isSafe: true };
  }

  const brandingBox = computeNormalizedBrandingBox(
    branding,
    surfaceWidthMm,
    surfaceHeightMm,
  );

  if (doBoxesOverlap(layerBox, brandingBox)) {
    return {
      isSafe: false,
      conflictReason:
        "The CALVIN emblem area is reserved and protected. Please reposition your artwork outside the brand zone.",
    };
  }

  return { isSafe: true };
}

/**
 * Validates that an artwork box stays within the physical safe printable margins.
 */
export function isWithinSafeMargins(
  layerBox: BoundingBox2D,
  margins: SafeMarginMm,
  surfaceWidthMm: number,
  surfaceHeightMm: number,
): { isWithinSafe: boolean; warning?: string } {
  if (surfaceWidthMm <= 0 || surfaceHeightMm <= 0) {
    return { isWithinSafe: true };
  }

  const normSafeLeft = margins.left / surfaceWidthMm;
  const normSafeRight = 1 - margins.right / surfaceWidthMm;
  const normSafeTop = margins.top / surfaceHeightMm;
  const normSafeBottom = 1 - margins.bottom / surfaceHeightMm;

  const isOutside =
    layerBox.x < normSafeLeft ||
    layerBox.x + layerBox.width > normSafeRight ||
    layerBox.y < normSafeTop ||
    layerBox.y + layerBox.height > normSafeBottom;

  if (isOutside) {
    return {
      isWithinSafe: false,
      warning:
        "Part of this artwork extends past the safe margin line and risks being trimmed at the cabinet edge during manufacturing.",
    };
  }

  return { isWithinSafe: true };
}

// -----------------------------------------------------------------------------
// History (Undo / Redo) Manager for 2D Design State
// -----------------------------------------------------------------------------

export class DesignHistoryManager<T> {
  private past: T[] = [];
  private present: T;
  private future: T[] = [];
  private readonly maxSteps: number;

  constructor(initialState: T, maxSteps = 30) {
    this.present = initialState;
    this.maxSteps = maxSteps;
  }

  public getState(): T {
    return this.present;
  }

  public pushState(newState: T): void {
    // If state is identical (deep reference check or quick serialization check), skip
    if (JSON.stringify(this.present) === JSON.stringify(newState)) {
      return;
    }
    this.past.push(this.present);
    if (this.past.length > this.maxSteps) {
      this.past.shift();
    }
    this.present = newState;
    this.future = []; // Clear redo stack on new action
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public undo(): T | null {
    if (!this.canUndo()) return null;
    const previous = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = previous;
    return this.present;
  }

  public redo(): T | null {
    if (!this.canRedo()) return null;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
    return this.present;
  }

  public reset(newState: T): void {
    this.past = [];
    this.present = newState;
    this.future = [];
  }
}

