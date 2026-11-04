/**
 * CALVIN AATAMAKER — Immutable Customization Order Snapshot Utility
 * 
 * Creates and formats an immutable, self-contained record of a customer's bespoke design
 * at the moment of checkout, ensuring it cannot be mutated by later studio edits or drafts.
 * 
 * Embedded directly inside PostgreSQL order_items.customisation_details (JSONB).
 */

function extractStoragePath(input: string): string {
  if (!input || typeof input !== "string") return "";
  const match = input.match(/\/customer-customizations\/([^?#]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]).trim();
  }
  return input.trim();
}

export interface SnapshotAssetRecord {
  storagePath: string;
  filename?: string;
  mimeType: string;
  sizeBytes?: number;
  contentHash?: string;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale?: number;
  order: number;
}

export interface SnapshotTextRecord {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  align: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  order: number;
  visible: boolean;
}

export interface SnapshotLayerRecord {
  id?: string;
  type: "photo" | "text" | "graphic" | string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  order: number;
  visible: boolean;
  // Photo-specific
  storagePath?: string;
  imageUrl?: string;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  filter?: string;
  // Text-specific
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  textAlign?: string;
}

export interface ImmutableCustomizationSnapshot {
  snapshot_version: number;
  snapshot_created_at: string;
  design_id: string;
  design_fingerprint?: string;
  mode: "demonstration" | "production";
  provisional_notice?: string;
  model_code: string;
  surface_key: string;
  surface_dimensions_mm: {
    width: number;
    height: number;
  };
  branding: {
    logo_asset: string;
    position: string;
    width_mm: number;
    height_mm: number;
  };
  options: Record<string, string | number | boolean | null>;
  price_delta: number;
  summary: string;
  preview_storage_path?: string;
  preview_image?: string;
  flat_artwork_storage_path?: string;
  flat_artwork_url?: string;
  original_assets: SnapshotAssetRecord[];
  text_layers: SnapshotTextRecord[];
  layers: SnapshotLayerRecord[];
}

/**
 * Builds an immutable customization snapshot from studio layers and selected options.
 */
export function buildImmutableCustomizationSnapshot(params: {
  designId: string;
  designFingerprint?: string;
  mode?: "demonstration" | "production";
  modelCode?: string;
  surfaceKey?: string;
  surfaceDimensionsMm?: { width: number; height: number };
  layers?: Array<Record<string, unknown>>;
  options?: Record<string, string | number | boolean | null>;
  priceDelta?: number;
  summary?: string;
  previewStoragePath?: string;
  previewImage?: string;
  flatArtworkStoragePath?: string;
  flatArtworkUrl?: string;
}): ImmutableCustomizationSnapshot {
  const {
    designId,
    designFingerprint,
    mode = "demonstration",
    modelCode = "CALVIN-COMPACT-01",
    surfaceKey = "front_door_panel",
    surfaceDimensionsMm = { width: 380, height: 620 },
    layers = [],
    options = {},
    priceDelta = 0,
    summary = "Bespoke Personalization",
    previewStoragePath,
    previewImage,
    flatArtworkStoragePath,
    flatArtworkUrl,
  } = params;

  const originalAssets: SnapshotAssetRecord[] = [];
  const textLayers: SnapshotTextRecord[] = [];
  const normalizedLayers: SnapshotLayerRecord[] = [];

  layers.forEach((rawLayer, index) => {
    const l = rawLayer as Record<string, unknown>;
    const type = typeof l.type === "string" ? l.type : "photo";
    const visible = l.visible !== false;
    const order = typeof l.order === "number" ? l.order : index;
    const x = typeof l.x === "number" ? Number(l.x.toFixed(4)) : 0;
    const y = typeof l.y === "number" ? Number(l.y.toFixed(4)) : 0;
    const width = typeof l.width === "number" ? Number(l.width.toFixed(4)) : 0.3;
    const height = typeof l.height === "number" ? Number(l.height.toFixed(4)) : 0.3;
    const rotation = typeof l.rotation === "number" ? Number(l.rotation.toFixed(2)) : 0;
    const opacity = typeof l.opacity === "number" ? Number(l.opacity.toFixed(2)) : 1;

    if (type === "photo" || type === "image") {
      const rawPath =
        (typeof l.storagePath === "string" ? l.storagePath : "") ||
        (typeof l.assetPath === "string" ? l.assetPath : "") ||
        (typeof l.imageUrl === "string" && !l.imageUrl.startsWith("data:") ? l.imageUrl : "");
      const storagePath = extractStoragePath(rawPath) || rawPath;

      const crop = l.crop && typeof l.crop === "object"
        ? {
            x: Number((l.crop as Record<string, number>).x || 0),
            y: Number((l.crop as Record<string, number>).y || 0),
            width: Number((l.crop as Record<string, number>).width || 1),
            height: Number((l.crop as Record<string, number>).height || 1),
          }
        : undefined;

      const assetRec: SnapshotAssetRecord = {
        storagePath: storagePath || (typeof l.imageUrl === "string" ? l.imageUrl : ""),
        filename:
          typeof l.originalFilename === "string"
            ? l.originalFilename
            : typeof l.filename === "string"
            ? l.filename
            : undefined,
        mimeType: typeof l.mimeType === "string" ? l.mimeType : "image/png",
        sizeBytes:
          typeof l.fileSizeBytes === "number"
            ? l.fileSizeBytes
            : typeof l.sizeBytes === "number"
            ? l.sizeBytes
            : undefined,
        contentHash:
          typeof l.assetId === "string"
            ? l.assetId
            : typeof l.contentHash === "string"
            ? l.contentHash
            : undefined,
        crop,
        x,
        y,
        width,
        height,
        rotation,
        scale: typeof l.scale === "number" ? l.scale : 1,
        order,
      };

      originalAssets.push(assetRec);

      normalizedLayers.push({
        id: typeof l.id === "string" ? l.id : `photo_${index}`,
        type: "photo",
        name: typeof l.name === "string" ? l.name : `Photograph ${originalAssets.length}`,
        x,
        y,
        width,
        height,
        rotation,
        opacity,
        order,
        visible,
        storagePath: assetRec.storagePath,
        imageUrl: typeof l.imageUrl === "string" ? l.imageUrl : undefined,
        crop,
        filter: typeof l.filter === "string" ? l.filter : "none",
      });
    } else if (type === "text") {
      const text = typeof l.text === "string" ? l.text.trim() : "";
      const fontFamily = typeof l.fontFamily === "string" ? l.fontFamily : "Cinzel, serif";
      const fontSize = typeof l.fontSize === "number" ? l.fontSize : 28;
      const fontWeight = typeof l.fontWeight === "string" ? l.fontWeight : "bold";
      const color = typeof l.color === "string" ? l.color : "#b45309";
      const align = typeof l.align === "string" ? l.align : typeof l.textAlign === "string" ? l.textAlign : "center";

      const textRec: SnapshotTextRecord = {
        text,
        fontFamily,
        fontSize,
        fontWeight,
        color,
        align,
        x,
        y,
        width,
        height,
        rotation,
        order,
        visible,
      };

      textLayers.push(textRec);

      normalizedLayers.push({
        id: typeof l.id === "string" ? l.id : `text_${index}`,
        type: "text",
        name: typeof l.name === "string" ? l.name : `Custom Text "${text.slice(0, 15)}"`,
        x,
        y,
        width,
        height,
        rotation,
        opacity,
        order,
        visible,
        text,
        fontFamily,
        fontSize,
        fontWeight,
        color,
        textAlign: align,
      });
    }
  });

  // Filter out internal metadata from user-selected options
  const cleanOptions: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(options)) {
    if (!k.startsWith("_") && v !== undefined) {
      cleanOptions[k] = v;
    }
  }

  return {
    snapshot_version: 1,
    snapshot_created_at: new Date().toISOString(),
    design_id: designId,
    design_fingerprint: designFingerprint,
    mode,
    provisional_notice:
      mode === "demonstration"
        ? "Provisional demonstration prototype dimensions (380 × 620 mm uncalibrated). Factory caliper validation required before CNC/press routing."
        : undefined,
    model_code: modelCode,
    surface_key: surfaceKey,
    surface_dimensions_mm: surfaceDimensionsMm,
    branding: {
      logo_asset: "/images/calvin-aatamaker-logo.png",
      position: "top_center",
      width_mm: 120,
      height_mm: 30,
    },
    options: cleanOptions,
    price_delta: priceDelta,
    summary,
    preview_storage_path: previewStoragePath,
    preview_image: previewImage,
    flat_artwork_storage_path: flatArtworkStoragePath,
    flat_artwork_url: flatArtworkUrl,
    original_assets: originalAssets,
    text_layers: textLayers,
    layers: normalizedLayers,
  };
}

