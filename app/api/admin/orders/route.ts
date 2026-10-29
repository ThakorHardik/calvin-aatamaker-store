import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authenticateAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publicKey || !secretKey) {
    return {
      response: errorResponse(
        "Server authentication configuration is incomplete.",
        500,
      ),
    };
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return {
      response: errorResponse("Please sign in as an administrator.", 401),
    };
  }

  const authClient = createClient(url, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return {
      response: errorResponse(
        "Your session is invalid or expired. Please sign in again.",
        401,
      ),
    };
  }

  const adminClient = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Admin role lookup failed:", profileError.message);
    return {
      response: errorResponse(
        "Unable to verify administrator permissions.",
        500,
      ),
    };
  }

  if (profile?.role !== "admin") {
    return {
      response: errorResponse("Administrator access is required.", 403),
    };
  }

  return { adminClient };
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { data, error } = await auth.adminClient
    .from("orders")
    .select(
      `
      id,
      order_number,
      customer_id,
      customer_name,
      email,
      phone,
      shipping_address_line1,
      shipping_address_line2,
      city,
      state,
      postal_code,
      country,
      subtotal,
      shipping_amount,
      tax_amount,
      discount_amount,
      total_amount,
      currency,
      order_status,
      payment_status,
      payment_provider,
      payment_reference,
      customer_notes,
      created_at,
      updated_at,
      order_items (
        id,
        product_id,
        variant_id,
        product_name,
        sku,
        variant_name,
        unit_price,
        quantity,
        line_total,
        customisation_details
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Admin order retrieval failed:", error.message);
    return errorResponse("Unable to load orders. Please try again.", 500);
  }

  return NextResponse.json(
    { orders: data ?? [] },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);

  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid request body.");
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("Please submit valid update details.", 400);
  }

  const orderId = body.orderId;
  const nextStatus = body.orderStatus;

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse("Invalid order ID.", 400);
  }

  if (
    typeof nextStatus !== "string" ||
    !ORDER_STATUSES.includes(nextStatus as OrderStatus)
  ) {
    return errorResponse("Invalid order status.", 400);
  }

  const { data, error } = await auth.adminClient
    .from("orders")
    .update({
      order_status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("id, order_number, order_status, updated_at")
    .maybeSingle();

  if (error) {
    console.error("Admin order update failed:", error.message);
    return errorResponse("Unable to update this order.", 500);
  }

  if (!data) {
    return errorResponse("Order not found.", 404);
  }

  // Payment status is intentionally not changed by this endpoint.
  // Payment confirmation must come from verified payment processing.
  return NextResponse.json({ order: data });
}
