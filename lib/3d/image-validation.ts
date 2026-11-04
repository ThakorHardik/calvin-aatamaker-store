/**
 * CALVIN AATAMAKER — Customization Image & Binary Content Validator
 * 
 * Inspects binary magic bytes to guarantee only authentic JPEG, PNG,
 * and WebP images are uploaded, and strictly rejects executable binaries,
 * archives, and active script or SVG vectors.
 */

export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024; // 2 MB

export const DANGEROUS_TEXT_PATTERNS = [
  "<script",
  "<svg",
  "<!doctype",
  "<?xml",
  "<?php",
  "javascript:",
  "<html",
  "onload=",
  "onerror=",
];

/**
 * Validates actual binary content (magic bytes) to verify it is an authentic
 * JPEG, PNG, or WebP file and does not contain executables, archives, or script payloads.
 */
export function validateImageBuffer(buffer: Buffer): {
  valid: boolean;
  detectedMime: string | null;
  error?: string;
} {
  if (!buffer || buffer.length < 12) {
    return { valid: false, detectedMime: null, error: "File buffer is too small to be a valid image." };
  }

  // 1. Executable checks (PE / ELF)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, detectedMime: null, error: "Executable Windows PE/DLL files are strictly prohibited." };
  }
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { valid: false, detectedMime: null, error: "Executable Linux ELF binaries are strictly prohibited." };
  }

  // 2. Archive checks (ZIP / APK / JAR)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05)) {
    return { valid: false, detectedMime: null, error: "Archive files (ZIP/JAR/APK) are strictly prohibited." };
  }

  // 3. Script / SVG / HTML injection scan in first 4096 bytes
  const headerText = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("ascii").toLowerCase();
  for (const pattern of DANGEROUS_TEXT_PATTERNS) {
    if (headerText.includes(pattern)) {
      return {
        valid: false,
        detectedMime: null,
        error: `Active script/vector content detected (${pattern}). Only standard raster JPEG, PNG, and WebP images are permitted.`,
      };
    }
  }

  // 4. Binary Magic Byte Verification
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png" };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg" };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { valid: true, detectedMime: "image/webp" };
  }

  return {
    valid: false,
    detectedMime: null,
    error: "File content does not match genuine JPEG, PNG, or WebP binary specifications.",
  };
}

