import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate admin user
    const userClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return errorResponse("Please sign in as an administrator.", 401);
    }

    // Verify role is admin
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      return errorResponse("Administrator privileges required.", 403);
    }

    // 2. Parse payload
    const body = await request.json();
    const { orderId, orderItemId, artifactType = "flat_artwork", dataUrl } = body;

    if (!orderId || !orderItemId || !dataUrl) {
      return errorResponse("Missing required fields: orderId, orderItemId, dataUrl", 400);
    }

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return errorResponse("Invalid dataUrl format. Expected image data URL.", 400);
    }

    // 3. Extract base64 image data
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || !matches[2]) {
      return errorResponse("Invalid base64 encoding in dataUrl.", 400);
    }

    const imageExt = matches[1] === "jpeg" ? "jpg" : "png";
    const imageBuffer = Buffer.from(matches[2], "base64");

    // 4. Upload to Supabase Storage using admin client
    const adminClient = createAdminClient();
    const storagePath = `orders/${orderId}/${orderItemId}_derived_${artifactType}_${Date.now()}.${imageExt}`;

    const { error: uploadError } = await adminClient.storage
      .from("customer-customizations")
      .upload(storagePath, imageBuffer, {
        contentType: `image/${imageExt}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("Failed to upload derived artifact:", uploadError.message);
      return errorResponse(`Storage upload failed: ${uploadError.message}`, 500);
    }

    // 5. Optionally record in order_item_artifacts table if migration was applied
    let tableRecorded = false;
    try {
      const { error: tableError } = await adminClient
        .from("order_item_artifacts")
        .insert({
          order_id: orderId,
          order_item_id: orderItemId,
          artifact_type: artifactType,
          storage_path: storagePath,
          source: "derived_from_snapshot",
          metadata: {
            derived_at: new Date().toISOString(),
            derived_by_admin: user.id,
            bytes: imageBuffer.length,
          },
        });

      if (!tableError) {
        tableRecorded = true;
      }
    } catch {
      // Table may not exist yet if migration has not been manually applied
      tableRecorded = false;
    }

    return NextResponse.json({
      success: true,
      storagePath,
      artifactType,
      tableRecorded,
      message: "Derived flat artwork successfully uploaded and preserved in storage.",
    });
  } catch (err) {
    console.error("Error saving order artifact:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
