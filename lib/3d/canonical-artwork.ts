/**
 * CALVIN AATAMAKER — Canonical Flat Artwork Renderer
 * 
 * Generates high-resolution 2D flat artwork PNGs representing the full
 * unrolled printable front door panel (380 mm × 620 mm) with:
 * - Selected cabinet finish background
 * - Customer photo layers (with crop, scale, rotation, opacity)
 * - Custom text inscriptions (with exact font, size, weight, color, alignment)
 * - Protected official CALVIN brand logo plate at upper center
 * - Factory specification footer note
 */

import type { CanvasLayer, PhotoLayer, TextLayer } from "@/types/3d-model";
function resolveCustomizationAssetUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return "";
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("/")) {
    return trimmed;
  }
  const match = trimmed.match(/\/customer-customizations\/([^?#]+)/);
  const path = match ? decodeURIComponent(match[1]) : trimmed;
  return `/api/customizations/upload?path=${encodeURIComponent(path)}`;
}

export const CANONICAL_ARTWORK_WIDTH = 1024;
export const CANONICAL_ARTWORK_HEIGHT = 1670; // 380mm x 620mm aspect ratio

export interface RenderArtworkOptions {
  width?: number;
  height?: number;
  finish?: string;
  includeBranding?: boolean;
  watermark?: string;
  imageElementGetter?: (url: string) => HTMLImageElement | null | undefined;
}

/**
 * Maps selected panel finish code to a high-end background gradient.
 */
function getPanelFinishColors(finishCode?: string): [string, string] {
  switch (finishCode) {
    case "brushed_silver":
      return ["#2D3139", "#202227"];
    case "champagne_gold":
      return ["#2C261F", "#1D1914"];
    case "rose_copper":
      return ["#2C1F1F", "#1B1313"];
    case "matte_black":
    default:
      return ["#1D1D22", "#131317"];
  }
}

/**
 * Synchronously or asynchronously renders the canonical flat artwork to a canvas
 * and returns its base64 data URL (image/png).
 */
export async function renderCanonicalFlatArtworkDataUrl(
  layers: CanvasLayer[],
  options: RenderArtworkOptions = {}
): Promise<string> {
  if (typeof document === "undefined") {
    return "";
  }

  const width = options.width || CANONICAL_ARTWORK_WIDTH;
  const height = options.height || CANONICAL_ARTWORK_HEIGHT;
  const finish = options.finish || "matte_black";
  const includeBranding = options.includeBranding !== false;
  const watermark = options.watermark || "CALVIN AATAMAKER • PROTOTYPE SPECIFICATION (380 × 620 mm)";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Panel Background Finish
  const [cTop, cBottom] = getPanelFinishColors(finish);
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, cTop);
  grad.addColorStop(1, cBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle Outer Bevel Stroke
  ctx.strokeStyle = "#2E2E38";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);

  // 3. Safe Margin Guideline (30px in 1024 width coordinate space)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  // 4. Preload Photo Layers' Images
  const photoLayers = layers.filter((l) => l.visible && l.type === "photo") as PhotoLayer[];
  const loadedImages = new Map<string, HTMLImageElement>();

  await Promise.all(
    photoLayers.map(async (pl) => {
      const rawTarget = pl.storagePath || pl.imageUrl;
      if (!rawTarget) return;
      const effectiveUrl = resolveCustomizationAssetUrl(rawTarget) || pl.imageUrl;
      if (!effectiveUrl) return;

      if (options.imageElementGetter) {
        const fromGetter = options.imageElementGetter(effectiveUrl) || options.imageElementGetter(pl.imageUrl);
        if (fromGetter && fromGetter.complete && fromGetter.naturalWidth > 0) {
          loadedImages.set(pl.imageUrl, fromGetter);
          loadedImages.set(effectiveUrl, fromGetter);
          return;
        }
      }

      // Check DOM cache
      const domImg =
        (document.querySelector(`img[src="${effectiveUrl}"]`) as HTMLImageElement | null) ||
        (document.querySelector(`img[src="${pl.imageUrl}"]`) as HTMLImageElement | null);
      if (domImg && domImg.complete && domImg.naturalWidth > 0) {
        loadedImages.set(pl.imageUrl, domImg);
        loadedImages.set(effectiveUrl, domImg);
        return;
      }

      // Load dynamically
      await new Promise<void>((resolve) => {
        const img = new Image();
        if (!effectiveUrl.startsWith("data:") && !effectiveUrl.startsWith("blob:")) {
          img.crossOrigin = "anonymous";
        }
        img.onload = () => {
          loadedImages.set(pl.imageUrl, img);
          loadedImages.set(effectiveUrl, img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = effectiveUrl;
      });
    })
  );

  // 5. Render Layers in zIndex Order
  const sortedLayers = [...layers]
    .filter((l) => l.visible)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const layer of sortedLayers) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1.0;

    const lx = layer.x * width;
    const ly = layer.y * height;
    const lw = layer.width * width;
    const lh = layer.height * height;

    const cx = lx + lw / 2;
    const cy = ly + lh / 2;

    ctx.translate(cx, cy);
    if (layer.rotationDeg) {
      ctx.rotate((layer.rotationDeg * Math.PI) / 180);
    }

    if (layer.type === "photo") {
      const photo = layer as PhotoLayer;
      const effectiveUrl =
        resolveCustomizationAssetUrl(photo.storagePath || photo.imageUrl) || photo.imageUrl;
      const img = loadedImages.get(effectiveUrl) || loadedImages.get(photo.imageUrl);

      if (img && img.complete && img.naturalWidth > 0) {
        if (photo.crop) {
          const sx = Math.max(0, photo.crop.x * img.naturalWidth);
          const sy = Math.max(0, photo.crop.y * img.naturalHeight);
          const sw = Math.min(img.naturalWidth - sx, photo.crop.width * img.naturalWidth);
          const sh = Math.min(img.naturalHeight - sy, photo.crop.height * img.naturalHeight);
          ctx.drawImage(img, sx, sy, sw, sh, -lw / 2, -lh / 2, lw, lh);
        } else {
          ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
        }
      } else {
        // High quality framed fallback placeholder
        ctx.fillStyle = "#2D3748";
        ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
        ctx.strokeStyle = "#D97706";
        ctx.lineWidth = 3;
        ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
        ctx.fillStyle = "#F7FAFC";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("📷 Bespoke Photograph", 0, 8);
      }
    } else if (layer.type === "text") {
      const textL = layer as TextLayer;
      const scaledFontSize = Math.max(
        16,
        (textL.fontSizePt || 28) * (height / 700)
      );
      const fontStyle = textL.fontWeight === "bold" ? "bold" : "normal";
      const fontFamily = textL.fontFamily || "Cinzel, serif";

      ctx.font = `${fontStyle} ${scaledFontSize}px ${fontFamily}`;
      ctx.fillStyle = textL.fillColorHex || ((textL as unknown as Record<string, unknown>).color as string) || "#FFFFFF";
      ctx.textAlign = textL.textAlign || "center";
      ctx.textBaseline = "middle";

      ctx.fillText(textL.text || "", 0, 0);
    }

    ctx.restore();
  }

  // 6. Protected CALVIN Brand Logo at Upper Center
  if (includeBranding) {
    // 120 mm width x 30 mm height on 380 mm x 620 mm door
    const badgeW = width * (120 / 380);
    const badgeH = badgeW * (30 / 120);
    const badgeX = (width - badgeW) / 2;
    const badgeY = 32;

    // Subtle dark badge plate with champagne gold border
    ctx.save();
    ctx.fillStyle = "rgba(18, 18, 22, 0.95)";
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fill();

    ctx.strokeStyle = "#D97706";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Check for logo asset in DOM
    const logoDom = document.querySelector(`img[src*="calvin-aatamaker-logo.png"]`) as HTMLImageElement | null;
    if (logoDom && logoDom.complete && logoDom.naturalWidth > 0) {
      const padding = 10;
      ctx.drawImage(logoDom, badgeX + padding, badgeY + padding / 2, badgeW - padding * 2, badgeH - padding);
    } else {
      ctx.fillStyle = "#F59E0B";
      ctx.font = "bold 34px 'Cinzel', serif, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("CALVIN", badgeX + badgeW / 2, badgeY + badgeH / 2);
    }
    ctx.restore();
  }

  // 7. Factory Specification Note at Bottom
  if (watermark) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.font = "600 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(watermark, width / 2, height - 16);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
