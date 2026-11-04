import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isDevelopmentTestOrder } from "@/lib/orders/test-order";

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
  let user: User | null = null;
  let userClient: SupabaseClient | null = null;
  let hadExpiredCookie = false;

  // 1. Primary: Verify identity via cookies using @supabase/ssr server client
  try {
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore
      .getAll()
      .some(
        (cookie) =>
          cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"),
      );

    if (hasAuthCookie) {
      const cookieClient = await createClient();
      const {
        data: { user: cookieUser },
        error: cookieError,
      } = await cookieClient.auth.getUser();

      if (!cookieError && cookieUser) {
        user = cookieUser;
        userClient = cookieClient;
      } else {
        hadExpiredCookie = true;
      }
    }
  } catch {
    // If cookie client resolution fails, proceed to Bearer fallback
  }

  // 2. Fallback: Verify identity via Bearer token
  if (!user) {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (token) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publicKey =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !publicKey) {
        return {
          response: errorResponse(
            "Server authentication configuration is incomplete.",
            500,
          ),
        };
      }

      const bearerClient = createSupabaseClient(url, publicKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      const {
        data: { user: bearerUser },
        error: bearerAuthError,
      } = await bearerClient.auth.getUser(token);

      if (bearerAuthError || !bearerUser) {
        return {
          response: errorResponse(
            "Your session is invalid or expired. Please sign in again.",
            401,
          ),
        };
      }

      user = bearerUser;
      userClient = bearerClient;
    } else if (hadExpiredCookie) {
      return {
        response: errorResponse(
          "Your session is invalid or expired. Please sign in again.",
          401,
        ),
      };
    }
  }

  // 3. Neither cookie nor Bearer token provided an authenticated session
  if (!user || !userClient) {
    return {
      response: errorResponse("Please sign in as an administrator.", 401),
    };
  }

  // 4. Verify profiles.role === "admin" independently under the caller's session
  const { data: profile, error: profileError } = await userClient
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

  // 5. Privileged client used strictly after caller identity and admin authorization
  let adminClient: SupabaseClient;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    console.error("Failed to initialize admin client:", err);
    return {
      response: errorResponse(
        "Server authentication configuration is incomplete.",
        500,
      ),
    };
  }

  return { adminClient };
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("id");

  if (targetId) {
    if (!UUID_PATTERN.test(targetId)) {
      return errorResponse("Invalid order ID.", 400);
    }

    const { data: order, error } = await auth.adminClient
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
      .eq("id", targetId)
      .maybeSingle();

    if (error) {
      console.error("Admin single order retrieval failed:", error.message);
      return errorResponse("Unable to load order details.", 500);
    }

    if (!order) {
      return errorResponse("Order not found.", 404);
    }

    return NextResponse.json(
      { order },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
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

  // 1. Fetch current order record
  const { data: existingOrder, error: orderLookupError } = await auth.adminClient
    .from("orders")
    .select("id, order_number, order_status, updated_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderLookupError || !existingOrder) {
    return errorResponse("Order not found.", 404);
  }

  // 2. Test Order Fulfillment Restriction:
  // Development test orders are permanent audit fixtures and cannot be confirmed, processed,
  // shipped, or delivered. They may only remain pending or be marked cancelled.
  const isTest = isDevelopmentTestOrder(existingOrder);
  if (isTest && (nextStatus === "confirmed" || nextStatus === "processing" || nextStatus === "shipped" || nextStatus === "delivered")) {
    return errorResponse(
      "Development Test Order Restriction: This order is a verified development test record and cannot be confirmed, processed, shipped, or delivered. It may only remain pending or be marked cancelled.",
      400,
    );
  }

  // 3. Manufacturing Safety Restriction:
  // Orders containing prototype demonstration personalizations (e.g. CALVIN-COMPACT-01)
  // cannot be released to production CNC/press, shipping or delivery ("processing", "shipped", "delivered")
  // until factory caliper validation.
  if (nextStatus === "processing" || nextStatus === "shipped" || nextStatus === "delivered") {
    const { data: existingItems, error: itemsError } = await auth.adminClient
      .from("order_items")
      .select("id, product_name, sku, customisation_details")
      .eq("order_id", orderId);

    if (!itemsError && Array.isArray(existingItems)) {
      const hasPrototypeDemo = existingItems.some((item) => {
        const details = item.customisation_details as Record<string, unknown> | null;
        return (
          details &&
          (details._mode === "demonstration" ||
            details._prototype_warning === "UNVERIFIED_FACTORY_MEASUREMENTS" ||
            Boolean(details._snapshot))
        );
      });

      if (hasPrototypeDemo) {
        return errorResponse(
          "Manufacturing Safety Restriction: This order contains a prototype demonstration design (CALVIN-COMPACT-01). Prototype models have unverified factory caliper measurements and cannot be released to production, shipping, or delivery.",
          400,
        );
      }
    }
  }

  // 4. Atomic Inventory Restoration on Order Cancellation
  if (nextStatus === "cancelled") {
    // If the order is already cancelled, cancellation is idempotent; do not restore inventory again
    if (existingOrder.order_status === "cancelled") {
      return NextResponse.json({
        order: existingOrder,
        inventoryRestored: false,
        message: "Order is already cancelled.",
      });
    }

    // Preferred: Invoke atomic PostgreSQL RPC cancel_order_and_release_inventory if migration 0004 is applied
    const { data: rpcResult, error: rpcError } = await auth.adminClient.rpc(
      "cancel_order_and_release_inventory",
      { p_order_id: orderId },
    );

    if (rpcError) {
      const errorMsg = rpcError.message || "";
      const errorCode = (rpcError as { code?: string }).code || "";
      const isMissingFunction =
        errorCode === "PGRST202" ||
        errorCode === "42883" ||
        errorMsg.includes("Could not find the function") ||
        errorMsg.includes("cancel_order_and_release_inventory") ||
        errorMsg.includes("does not exist");

      if (!isMissingFunction) {
        console.error("PostgreSQL cancel_order_and_release_inventory RPC failed with database error:", rpcError);
        return errorResponse(`Order cancellation failed: ${errorMsg}`, 500);
      }
      // RPC is not yet installed in Postgres (migration 0004 pending); proceed to safe fallback
    } else if (rpcResult && typeof rpcResult === "object") {
      const res = rpcResult as {
        success: boolean;
        already_released?: boolean;
        restored_lines?: number;
        message?: string;
      };
      const { data: refreshedOrder } = await auth.adminClient
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      return NextResponse.json({
        order: refreshedOrder || { ...existingOrder, order_status: "cancelled" },
        inventoryRestored: !res.already_released,
        restoredLines: res.restored_lines || 0,
        message: res.message || "Order cancelled successfully.",
      });
    }

    // Fallback: Atomic conditional status transition to prevent concurrent double-restoration
    // Only used when migration 0004 RPC has not yet been applied to Postgres.
    const isExemptFromStockRestoration =
      (existingOrder as { inventory_deducted?: boolean }).inventory_deducted === false ||
      existingOrder.order_number === "CA-7891F04B40";

    const { data: cancelledOrder, error: cancelError } = await auth.adminClient
      .from("orders")
      .update({
        order_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .neq("order_status", "cancelled")
      .select("id, order_number, order_status, updated_at")
      .maybeSingle();

    if (cancelError) {
      console.error("Admin order cancellation failed:", cancelError.message);
      return errorResponse("Unable to cancel this order.", 500);
    }

    if (!cancelledOrder) {
      // Another concurrent request already cancelled the order
      return NextResponse.json({
        order: existingOrder,
        inventoryRestored: false,
        message: "Order cancellation processed concurrently.",
      });
    }

    // If order was exempt from inventory deduction (e.g. seed order CA-7891F04B40), skip stock restoration
    if (isExemptFromStockRestoration) {
      return NextResponse.json({
        order: { ...existingOrder, order_status: "cancelled" },
        inventoryRestored: false,
        restoredLines: 0,
        message: "Order cancelled. Inventory was never deducted (exempt from restoration).",
      });
    }

    // Winner of the transition: fetch all line items and restore inventory
    const { data: existingItems } = await auth.adminClient
      .from("order_items")
      .select("product_id, variant_id, quantity")
      .eq("order_id", orderId);

    if (Array.isArray(existingItems) && existingItems.length > 0) {
      const productRestores = new Map<string, number>();
      const variantRestores = new Map<string, number>();

      for (const item of existingItems) {
        const qty = Number(item.quantity) || 1;
        if (item.variant_id) {
          variantRestores.set(
            item.variant_id,
            (variantRestores.get(item.variant_id) || 0) + qty,
          );
        } else if (item.product_id) {
          productRestores.set(
            item.product_id,
            (productRestores.get(item.product_id) || 0) + qty,
          );
        }
      }

      for (const [pid, qty] of productRestores.entries()) {
        const { data: p } = await auth.adminClient
          .from("products")
          .select("stock_quantity")
          .eq("id", pid)
          .maybeSingle();
        if (p && typeof p.stock_quantity === "number") {
          await auth.adminClient
            .from("products")
            .update({
              stock_quantity: p.stock_quantity + qty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", pid);
        }
      }

      for (const [vid, qty] of variantRestores.entries()) {
        const { data: v } = await auth.adminClient
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", vid)
          .maybeSingle();
        if (v && typeof v.stock_quantity === "number") {
          await auth.adminClient
            .from("product_variants")
            .update({
              stock_quantity: v.stock_quantity + qty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", vid);
        }
      }
    }

    return NextResponse.json({
      order: cancelledOrder,
      inventoryRestored: true,
      message: "Order cancelled and inventory reservation restored.",
    });
  }

  // 5. Standard Status Transition (confirmed, processing, shipped, delivered, pending)
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
