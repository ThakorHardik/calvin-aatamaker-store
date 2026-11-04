import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PREVIEW_BYTES,
  validateImageBuffer,
} from "@/lib/3d/image-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeSegment(val: unknown, maxLength = 64): string {
  if (typeof val !== "string") return "";
  return val.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maxLength);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-guest-token",
    },
  });
}

export async function POST(request: Request) {
  try {
    // 1. Session identification for folder ownership
    let customerId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) customerId = user.id;
    } catch (e) {
      console.warn("Session check in customization upload skipped:", e);
    }

    // 2. Parse payload (supports multipart/form-data and application/json)
    const contentTypeHeader = request.headers.get("content-type") || "";
    let fileBuffer: Buffer | null = null;
    let declaredMimeType = "image/png";
    let uploadType: "photo" | "preview" | "artwork" = "photo";
    let designId = "";
    let guestToken = "";
    let originalFilename = "";

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      uploadType = (formData.get("type") as "photo" | "preview" | "artwork") || "photo";
      designId = sanitizeSegment(formData.get("designId"));
      guestToken = sanitizeSegment(formData.get("guestToken") || request.headers.get("x-guest-token"));
      if (file) {
        originalFilename = file.name;
      }

      if (!file) {
        return NextResponse.json({ error: "No image file provided." }, { status: 400 });
      }

      declaredMimeType = file.type || "image/png";
      const bytes = await file.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
    } else if (contentTypeHeader.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      uploadType = (body.type as "photo" | "preview" | "artwork") || "preview";
      designId = sanitizeSegment(body.designId);
      guestToken = sanitizeSegment(body.guestToken || request.headers.get("x-guest-token"));
      originalFilename = typeof body.filename === "string" ? body.filename : "";

      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
      const match = dataUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json(
          { error: "Invalid base64 image data URL format." },
          { status: 400 }
        );
      }

      declaredMimeType = match[1];
      fileBuffer = Buffer.from(match[2], "base64");
    } else {
      return NextResponse.json(
        { error: "Unsupported content type. Submit multipart/form-data or application/json." },
        { status: 415 }
      );
    }

    // 3. MIME type header validation
    if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Only JPEG, PNG, and WebP images are allowed." },
        { status: 400 }
      );
    }

    // 4. Server-Side File Size Enforcement
    const maxAllowed = uploadType === "preview" ? MAX_PREVIEW_BYTES : MAX_PHOTO_BYTES;
    if (fileBuffer.length > maxAllowed) {
      return NextResponse.json(
        {
          error: `File size exceeds limit (${(maxAllowed / (1024 * 1024)).toFixed(0)} MB max).`,
        },
        { status: 413 }
      );
    }

    // 5. Deep Binary Magic-Byte Content Inspection
    const inspection = validateImageBuffer(fileBuffer);
    if (!inspection.valid || !inspection.detectedMime) {
      return NextResponse.json(
        { error: inspection.error || "File content validation failed." },
        { status: 400 }
      );
    }

    const verifiedMime = inspection.detectedMime;

    // 6. Folder isolation enforcing customer ownership
    // Authenticated users ALWAYS store under their authenticated user UUID.
    // Guests use a cryptographically sanitized guest token under guests/<token>/.
    let folderOwner: string;
    if (customerId) {
      folderOwner = customerId;
    } else {
      const validGuestToken =
        guestToken && guestToken.length >= 16 ? guestToken : generateId();
      folderOwner = `guests/${validGuestToken}`;
    }

    const extension =
      verifiedMime === "image/jpeg" ? "jpg" : verifiedMime === "image/webp" ? "webp" : "png";
    const filename =
      uploadType === "preview"
        ? `preview_${designId || generateId()}.${extension}`
        : uploadType === "artwork"
        ? `flat_${designId || generateId()}.${extension}`
        : `${Date.now()}_${generateId()}.${extension}`;
    const subfolder =
      uploadType === "preview"
        ? "previews"
        : uploadType === "artwork"
        ? "artwork"
        : "photos";
    const storagePath = `${folderOwner}/${subfolder}/${filename}`;

    // 7. Store in Supabase Storage customer-customizations bucket
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("customer-customizations")
      .upload(storagePath, fileBuffer, {
        contentType: verifiedMime,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload failure in customer-customizations:", uploadError.message);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 8. Generate fresh signed URL (3600 seconds = 1 hour) for immediate UI rendering
    const { data: signData, error: signError } = await admin.storage
      .from("customer-customizations")
      .createSignedUrl(storagePath, 60 * 60);

    if (signError || !signData?.signedUrl) {
      console.error("Signed URL creation failed:", signError);
      return NextResponse.json(
        { error: "Failed to generate access URL for uploaded asset." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        storagePath,
        url: signData.signedUrl,
        contentType: verifiedMime,
        sizeBytes: fileBuffer.length,
        originalFilename: originalFilename || undefined,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Unhandled error in /api/customizations/upload POST:", err);
    return NextResponse.json(
      { error: "Internal server error during asset upload." },
      { status: 500 }
    );
  }
}

/**
 * GET: Resolves a permanent storage path to a fresh signed URL with ownership authorization.
 * Usage:
 *   /api/customizations/upload?path=<storagePath>&guestToken=<token>
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storagePath = searchParams.get("path") || "";
    const guestTokenParam = sanitizeSegment(
      searchParams.get("guestToken") || request.headers.get("x-guest-token")
    );
    const format = searchParams.get("format");

    if (!storagePath) {
      return NextResponse.json({ error: "Storage path parameter is required." }, { status: 400 });
    }

    // Path structure validation (prevents directory traversal)
    // Allowed: <owner>/photos/<file>, <owner>/previews/<file>, or <owner>/artwork/<file>
    // Where owner is a user UUID or guests/<token>
    const normalizedPath = storagePath.replace(/\\/g, "/").trim();
    if (normalizedPath.includes("..") || normalizedPath.startsWith("/")) {
      return NextResponse.json({ error: "Invalid storage path navigation." }, { status: 400 });
    }

    const segments = normalizedPath.split("/");
    let isGuest = false;
    let ownerId = "";
    let folderType = "";

    if (segments[0] === "guests" && segments.length === 4) {
      isGuest = true;
      ownerId = segments[1];
      folderType = segments[2];
    } else if (segments.length === 3) {
      ownerId = segments[0];
      folderType = segments[1];
    } else {
      return NextResponse.json({ error: "Malformed customization storage path." }, { status: 400 });
    }

    if (!["photos", "previews", "artwork"].includes(folderType)) {
      return NextResponse.json({ error: "Invalid customization subfolder." }, { status: 400 });
    }

    // Authorization verification
    let isAuthorized = false;
    let isAdmin = false;

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Check if admin
        const adminClient = createAdminClient();
        const { data: profile } = await adminClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.role === "admin") {
          isAdmin = true;
          isAuthorized = true;
        } else if (user.id === ownerId) {
          isAuthorized = true;
        }
      }
    } catch {
      // Session lookup failed
    }

    if (!isAuthorized) {
      if (isGuest && guestTokenParam && guestTokenParam === ownerId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && !isAdmin) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to view this customization asset." },
        { status: 403 }
      );
    }

    // Generate fresh signed URL (1 hour expiry)
    const admin = createAdminClient();
    const { data: signData, error: signError } = await admin.storage
      .from("customer-customizations")
      .createSignedUrl(normalizedPath, 60 * 60);

    if (signError || !signData?.signedUrl) {
      console.warn("Storage signed URL regeneration failed or network unavailable, serving fallback portrait SVG:", signError?.message);
      
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2c2724"/>
            <stop offset="100%" stop-color="#191512"/>
          </linearGradient>
        </defs>
        <rect width="400" height="400" fill="url(#bg)"/>
        <circle cx="200" cy="150" r="55" fill="#f59e0b" opacity="0.9"/>
        <path d="M120 310 c0-55 45-75 80-75 s80 20 80 75 Z" fill="#d97706" opacity="0.95"/>
        <rect x="150" y="270" width="100" height="24" rx="4" fill="#78350f"/>
        <text x="200" y="286" text-anchor="middle" fill="#fef3c7" font-family="sans-serif" font-size="12" font-weight="bold">CUSTOMER PHOTO</text>
        <text x="200" y="360" text-anchor="middle" fill="#d4d4d8" font-family="sans-serif" font-size="14">CALVIN Personalization</text>
      </svg>`;

      if (format === "json") {
        return NextResponse.json(
          {
            success: true,
            storagePath: normalizedPath,
            url: `/api/customizations/upload?path=${encodeURIComponent(normalizedPath)}`,
          },
          { status: 200 }
        );
      }

      return new NextResponse(fallbackSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Return JSON or 307 Temporary Redirect for direct image tags
    const acceptHeader = request.headers.get("accept") || "";
    if (format === "json" || acceptHeader.includes("application/json")) {
      return NextResponse.json(
        {
          success: true,
          storagePath: normalizedPath,
          url: signData.signedUrl,
        },
        { status: 200 }
      );
    }

    const redirectRes = NextResponse.redirect(signData.signedUrl, 307);
    redirectRes.headers.set("Access-Control-Allow-Origin", "*");
    redirectRes.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    redirectRes.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-guest-token");
    return redirectRes;
  } catch (err) {
    console.error("Unhandled error in /api/customizations/upload GET:", err);
    return NextResponse.json(
      { error: "Internal server error resolving asset URL." },
      { status: 500 }
    );
  }
}
