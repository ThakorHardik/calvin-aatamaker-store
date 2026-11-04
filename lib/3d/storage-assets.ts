/**
 * CALVIN AATAMAKER — Customization Asset Storage & URL Resolution Utility
 * 
 * Provides safe resolution and persistence of design assets (photos, preview thumbnails):
 * - Translates permanent Supabase Storage paths into fresh signed URLs via server endpoint.
 * - Extracts permanent Storage object paths from expired signed URLs with bucket-aware parsing.
 * - Manages persistent guest authorization tokens across browser sessions.
 * - Enforces owner authorization and eliminates broken image errors across 2D/3D studio and admin.
 */

/**
 * Storage bucket name dedicated to customer uploaded assets and design renders.
 */
export const CUSTOMIZATION_BUCKET = "customer-customizations";

/**
 * Retrieves or initializes a cryptographically persistent guest token in the browser.
 * Ensures guest sessions retain ownership of their uploaded photos across reloads/revisits.
 */
export function getOrCreateGuestToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const KEY = "calvin-customization-guest-token";
    let token = localStorage.getItem(KEY);
    if (!token || token.length < 16) {
      token =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `gst-${crypto.randomUUID().replace(/-/g, "")}`
          : `gst-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(KEY, token);
    }
    return token;
  } catch {
    return "";
  }
}

/**
 * Checks whether an asset string is a permanent storage path rather than an ephemeral signed URL.
 * Matches:
 *   - <userId>/(photos|previews|artwork)/<filename>
 *   - guests/<guestToken>/(photos|previews|artwork)/<filename>
 */
export function isPermanentStoragePath(val?: string | null): boolean {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return false;
  }
  return /^([a-zA-Z0-9_-]+|guests\/[a-zA-Z0-9_-]+)\/(photos|previews|artwork)\/[a-zA-Z0-9_.-]+$/.test(trimmed);
}

/**
 * Bucket-aware parser: Extracts the clean, permanent Storage object path from any
 * format (expired signed URL, public URL, API proxy URL, or raw storage path).
 * 
 * Returns null if the input cannot be resolved to a valid customer-customizations object.
 */
export function extractStoragePath(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. If it's already an API route (/api/customizations/upload?path=...)
  if (trimmed.includes("/api/customizations/upload")) {
    try {
      const url = new URL(trimmed, "http://localhost");
      const pathParam = url.searchParams.get("path");
      if (pathParam) {
        const decoded = decodeURIComponent(pathParam).trim();
        if (isPermanentStoragePath(decoded)) return decoded;
      }
    } catch {
      // Fallback manual query string parsing
      const match = trimmed.match(/[?&]path=([^&]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]).trim();
        if (isPermanentStoragePath(decoded)) return decoded;
      }
    }
  }

  // 2. Bucket-aware Supabase Storage URL matcher (signed, public, authenticated)
  // Handles: https://<domain>/storage/v1/object/(sign|public|authenticated)/customer-customizations/<path>[?query]
  const bucketUrlMatch = trimmed.match(
    /\/storage\/v1\/object\/(?:sign|public|authenticated)\/customer-customizations\/([^?#]+)/
  );
  if (bucketUrlMatch && bucketUrlMatch[1]) {
    const decoded = decodeURIComponent(bucketUrlMatch[1]).trim();
    if (isPermanentStoragePath(decoded)) return decoded;
  }

  // 3. General customer-customizations URL matcher
  const genericMatch = trimmed.match(/\/customer-customizations\/([^?#]+)/);
  if (genericMatch && genericMatch[1]) {
    const decoded = decodeURIComponent(genericMatch[1]).trim();
    if (isPermanentStoragePath(decoded)) return decoded;
  }

  // 4. Clean permanent storage path format
  if (isPermanentStoragePath(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Resolves any customization asset reference (storage path, signed URL, or upload route)
 * into a fresh, authorized access URL through the server endpoint.
 * 
 * - If the path points to an expired Supabase signed URL, the permanent path is extracted and re-signed.
 * - Automatically attaches the persistent guestToken when resolving guest assets in browser contexts.
 * - Preserves inline data URIs and active blob URIs for immediate local render.
 */
export function resolveCustomizationAssetUrl(
  pathOrUrl?: string | null,
  guestToken?: string | null
): string {
  if (!pathOrUrl || typeof pathOrUrl !== "string") {
    return "";
  }

  const trimmed = pathOrUrl.trim();
  if (!trimmed) return "";

  // 1. Extract permanent Storage path if present in URL or raw path
  const extractedPath = extractStoragePath(trimmed);
  if (extractedPath) {
    // Determine effective guest token:
    // a. Explicitly passed parameter
    // b. Extracted from path if guests/<token>/...
    // c. Browser session token from localStorage
    let effectiveGuestToken = guestToken || "";
    if (!effectiveGuestToken && extractedPath.startsWith("guests/")) {
      const parts = extractedPath.split("/");
      if (parts[1]) {
        effectiveGuestToken = parts[1];
      }
    }
    if (!effectiveGuestToken && typeof window !== "undefined") {
      effectiveGuestToken = getOrCreateGuestToken();
    }

    const query = new URLSearchParams({ path: extractedPath });
    if (effectiveGuestToken) {
      query.set("guestToken", effectiveGuestToken);
    }
    return `/api/customizations/upload?${query.toString()}`;
  }

  // 2. Preserve immediate client formats (data URIs, blob URIs)
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // 3. Preserve already-formed upload API routes
  if (trimmed.startsWith("/api/customizations/upload")) {
    if (guestToken && !trimmed.includes("guestToken=")) {
      const sep = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${sep}guestToken=${encodeURIComponent(guestToken)}`;
    }
    return trimmed;
  }

  // 4. Backward compatibility: External absolute URLs not hosted on Supabase Storage
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // 5. Default fallback to upload endpoint query
  const query = new URLSearchParams({ path: trimmed });
  const effectiveToken = guestToken || (typeof window !== "undefined" ? getOrCreateGuestToken() : "");
  if (effectiveToken) {
    query.set("guestToken", effectiveToken);
  }
  return `/api/customizations/upload?${query.toString()}`;
}
