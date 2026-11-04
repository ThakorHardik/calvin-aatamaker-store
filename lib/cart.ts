import type { CartCustomisationDetails, CartItem } from "@/types/cart";

export const CART_STORAGE_KEY = "calvin-aatamaker-cart";
export const CART_UPDATED_EVENT = "calvin-cart-updated";

/**
 * Generates a deterministic, stable identifier for a cart line item.
 * Items with identical product + variant + customization are merged.
 */
export function generateCartItemId(
  productId: string,
  variantId: string | null,
  customisationDetails?: CartCustomisationDetails | null,
  designId?: string | null,
): string {
  const cleanVariantId = variantId && variantId.trim().length > 0 ? variantId.trim() : "default";
  const base = `${productId}:${cleanVariantId}`;

  const explicitDesignId = designId || (customisationDetails?._design_id as string | undefined);
  if (explicitDesignId) {
    return `${base}:design-${explicitDesignId}`;
  }

  if (!customisationDetails || Object.keys(customisationDetails).length === 0) {
    return `${base}:standard`;
  }

  // Generate a clean deterministic key from sorted non-private entries
  const sortedEntries = Object.entries(customisationDetails)
    .filter(([k]) => !k.startsWith("_"))
    .sort(([a], [b]) => a.localeCompare(b));

  if (sortedEntries.length === 0) {
    return `${base}:standard`;
  }

  const detailKey = sortedEntries
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(";");

  return `${base}:${detailKey}`;
}

/**
 * Fast deterministic 64-bit FNV-1a hash for strings (data URIs, raw text).
 * Produces clean 16-character hex digest without external dependencies.
 */
function fnv1a64(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch >> 8), 0x01000193);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}`;
}

/**
 * Extracts a stable, non-expiring photo asset identifier from a photo layer.
 * Specifically handles:
 * - Cryptographic content hashes (contentHash, fileHash, sha256)
 * - Permanent storage paths (storagePath, assetPath)
 * - Base64 data URIs (hashed via FNV-1a with payload byte length)
 * - Supabase Storage signed URLs (stripping temporary ?token=... and extracting bucket path)
 * - API upload routes (/api/customizations/upload?path=...)
 * - Fallbacks to sanitized URLs, filenames, and physical dimensions for unpersisted blobs
 */
export function extractStablePhotoIdentity(l: Record<string, unknown>): string {
  // 1. Explicit cryptographic content hash if provided
  if (typeof l.contentHash === "string" && l.contentHash.trim()) {
    return `hash:${l.contentHash.trim()}`;
  }
  if (typeof l.fileHash === "string" && l.fileHash.trim()) {
    return `hash:${l.fileHash.trim()}`;
  }
  if (typeof l.sha256 === "string" && l.sha256.trim()) {
    return `hash:${l.sha256.trim()}`;
  }

  // 2. Permanent Supabase Storage path
  if (typeof l.storagePath === "string" && l.storagePath.trim()) {
    return `storage:${l.storagePath.trim()}`;
  }
  if (typeof l.assetPath === "string" && l.assetPath.trim()) {
    return `storage:${l.assetPath.trim()}`;
  }

  const rawUrl = typeof l.imageUrl === "string" ? l.imageUrl.trim() : "";

  // 3. Base64 data URI: deterministic content hash + length
  if (rawUrl.startsWith("data:")) {
    return `data:${fnv1a64(rawUrl)}_len${rawUrl.length}`;
  }

  // 4. Supabase Storage signed or public URL: extract object path and strip query tokens
  if (rawUrl.includes("/customer-customizations/")) {
    const segments = rawUrl.split("/customer-customizations/")[1]?.split("?")[0] || "";
    if (segments) {
      try {
        return `storage:${decodeURIComponent(segments)}`;
      } catch {
        return `storage:${segments}`;
      }
    }
  }

  // 5. Asset upload API route URL: /api/customizations/upload?path=...
  if (rawUrl.startsWith("/api/customizations/upload")) {
    try {
      const dummy = new URL(rawUrl, "http://localhost");
      const p = dummy.searchParams.get("path");
      if (p) return `storage:${p}`;
    } catch {}
  }

  // 6. Generic HTTP(S) URL: strip query parameters and hash fragments (e.g. ?token=...)
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      const parsed = new URL(rawUrl);
      return `url:${parsed.pathname}`;
    } catch {
      return `raw:${rawUrl.split("?")[0]}`;
    }
  }

  // 7. Blob URL fallback: combine blob path with layer name/dimensions to distinguish local drafts
  if (rawUrl.startsWith("blob:")) {
    const name = String(l.name || "blob");
    const dims = `${Number(l.sourceWidthPx || 0)}x${Number(l.sourceHeightPx || 0)}`;
    return `blob:${name}_${dims}`;
  }

  if (rawUrl) {
    return `raw:${rawUrl.split("?")[0]}`;
  }

  return `unnamed:${String(l.name || "photo")}_${Number(l.sourceWidthPx || 0)}x${Number(l.sourceHeightPx || 0)}`;
}

/**
 * Computes a deterministic canonical fingerprint for a product customization.
 * Two customizations with identical artwork, crops, text, rotations, options,
 * and variant produce identical fingerprints.
 *
 * Excludes:
 * - Temporary signed URL tokens (?token=...)
 * - Volatile layer identifiers (e.g. Date.now() timestamps)
 * - Private internal metadata keys (starting with _)
 * - Internal draft and selection flags
 */
export function computeDesignFingerprint(
  productId: string,
  variantId: string | null,
  layers: unknown[],
  options?: Record<string, unknown> | null,
  context?: { modelCode?: string | null; surfaceKey?: string | null; modelVersion?: number | null } | null,
): string {
  const normLayers = (Array.isArray(layers) ? layers : [])
    .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === "object" && (l as { visible?: boolean }).visible !== false)
    .map((l, idx) => {
      const type = String(l.type || "unknown");
      const x = Math.round(Number(l.x ?? 0) * 1000) / 1000;
      const y = Math.round(Number(l.y ?? 0) * 1000) / 1000;
      const w = Math.round(Number(l.width ?? 0) * 1000) / 1000;
      const h = Math.round(Number(l.height ?? 0) * 1000) / 1000;
      const rot = Math.round(Number(l.rotationDeg ?? 0) * 10) / 10;
      const op = Math.round(Number(l.opacity ?? 1) * 100) / 100;

      const record: Record<string, unknown> = {
        type,
        x,
        y,
        w,
        h,
        rot,
        op,
        order: idx,
      };

      if (type === "photo") {
        record.asset = extractStablePhotoIdentity(l);
        record.filter = String(l.filterPreset || "none");
        const crop = l.crop as { x?: number; y?: number; width?: number; height?: number } | null | undefined;
        if (crop && typeof crop === "object") {
          record.crop = {
            x: Math.round(Number(crop.x ?? 0) * 1000) / 1000,
            y: Math.round(Number(crop.y ?? 0) * 1000) / 1000,
            w: Math.round(Number(crop.width ?? 1) * 1000) / 1000,
            h: Math.round(Number(crop.height ?? 1) * 1000) / 1000,
          };
        }
      } else if (type === "text") {
        record.txt = String(l.text || "").trim();
        record.font = String(l.fontFamily || "");
        record.col = String(l.fillColorHex || "").toLowerCase();
        record.size = Number(l.fontSizePt || 28);
        record.weight = String(l.fontWeight || "bold");
        record.align = String(l.textAlign || "center");
      }
      return record;
    });

  const normOptions: Record<string, string> = {};
  if (options && typeof options === "object") {
    for (const [k, v] of Object.entries(options)) {
      if (!k.startsWith("_") && v !== null && v !== undefined && v !== "") {
        normOptions[k] = String(v);
      }
    }
  }

  const sortedOptionKeys = Object.keys(normOptions).sort();
  const sortedOptionString = sortedOptionKeys
    .map((k) => `${k}=${normOptions[k]}`)
    .join(";");

  const fingerprintObj: Record<string, unknown> = {
    productId,
    variantId: variantId && variantId.trim().length > 0 ? variantId.trim() : "default",
    layers: normLayers,
    options: sortedOptionString,
  };

  if (context?.modelCode) fingerprintObj.modelCode = context.modelCode;
  if (context?.surfaceKey) fingerprintObj.surfaceKey = context.surfaceKey;

  return JSON.stringify(fingerprintObj);
}

/**
 * Runtime type guard for CartItem.
 */
export function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<CartItem>;

  const hasCustomDetails =
    item.customisationDetails === undefined ||
    item.customisationDetails === null ||
    (typeof item.customisationDetails === "object" &&
      !Array.isArray(item.customisationDetails));

  return (
    typeof item.id === "string" &&
    typeof item.productId === "string" &&
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    (typeof item.image === "string" || item.image === null || item.image === undefined) &&
    typeof item.unitPrice === "number" &&
    Number.isFinite(item.unitPrice) &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    (typeof item.variantId === "string" || item.variantId === null) &&
    (typeof item.variantName === "string" || item.variantName === null) &&
    (typeof item.sku === "string" || item.sku === null) &&
    hasCustomDetails
  );
}

/**
 * Safely reads the saved cart from localStorage.
 */
export function readSavedCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isCartItem);
  } catch {
    return [];
  }
}

/**
 * Persists the cart items to localStorage and dispatches a change event.
 */
export function saveCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  } catch (err) {
    console.error("Failed to save cart to localStorage:", err);
  }
}

/**
 * Formats customisation details into a human-readable summary string,
 * automatically filtering out private system metadata keys.
 */
export function formatCustomisationSummary(
  details?: CartCustomisationDetails | null,
): string {
  if (!details || Object.keys(details).length === 0) return "";
  return Object.entries(details)
    .filter(([k, v]) => !k.startsWith("_") && v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => {
      const formattedKey = k
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
      return `${formattedKey}: ${String(v)}`;
    })
    .join(" · ");
}


/**
 * Clears the saved cart and notifies listeners.
 */
export function clearCart(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CART_STORAGE_KEY);
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  } catch (err) {
    console.error("Failed to clear cart:", err);
  }
}

