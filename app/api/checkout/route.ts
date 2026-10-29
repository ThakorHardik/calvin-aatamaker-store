import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestItem = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    return NextResponse.json(
      { error: "Checkout server configuration is incomplete." },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body.");
    }
  } catch {
    return NextResponse.json(
      { error: "Please submit valid checkout details." },
      { status: 400 },
    );
  }

  const customerName = text(body.customerName, 100);
  const email = text(body.email, 254).toLowerCase();
  const phone = text(body.phone, 30);
  const address1 = text(body.address1, 200);
  const address2 = text(body.address2, 200);
  const city = text(body.city, 100);
  const state = text(body.state, 100);
  const postalCode = text(body.postalCode, 6);
  const notes = text(body.notes, 500);

  const phoneDigits = phone.replace(/\D/g, "");

  if (
    !customerName ||
    !validEmail(email) ||
    phoneDigits.length !== 10 ||
    !/^[6-9]\d{9}$/.test(phoneDigits) ||
    !address1 ||
    !city ||
    !state ||
    !/^\d{6}$/.test(postalCode)
  ) {
    return NextResponse.json(
      {
        error:
          "Enter a valid name, email, 10-digit Indian mobile number, complete address and 6-digit PIN code.",
      },
      { status: 400 },
    );
  }

  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 20
  ) {
    return NextResponse.json(
      { error: "Your cart must contain between 1 and 20 line items." },
      { status: 400 },
    );
  }

  const items: RequestItem[] = [];

  for (const rawItem of body.items) {
    if (!rawItem || typeof rawItem !== "object") {
      return NextResponse.json(
        { error: "A cart item is invalid." },
        { status: 400 },
      );
    }

    const item = rawItem as Record<string, unknown>;
    const productId = item.productId;
    const variantId = item.variantId ?? null;
    const quantity = item.quantity;

    if (
      typeof productId !== "string" ||
      !UUID.test(productId) ||
      (variantId !== null &&
        (typeof variantId !== "string" || !UUID.test(variantId))) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return NextResponse.json(
        { error: "A product selection or quantity is invalid." },
        { status: 400 },
      );
    }

    items.push({
      productId,
      variantId: variantId as string | null,
      quantity,
    });
  }

  const uniqueKeys = items.map(
    (item) => `${item.productId}:${item.variantId ?? "default"}`,
  );

  if (new Set(uniqueKeys).size !== uniqueKeys.length) {
    return NextResponse.json(
      {
        error:
          "The cart contains duplicate product selections. Please refresh your cart.",
      },
      { status: 400 },
    );
  }

  const admin = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const productIds = [...new Set(items.map((item) => item.productId))];

  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, name, sku, price, stock_quantity, is_active")
    .in("id", productIds)
    .eq("is_active", true);

  if (productsError) {
    console.error("Checkout product validation failed:", productsError.message);
    return NextResponse.json(
      { error: "We could not verify your products. Please try again." },
      { status: 500 },
    );
  }

  const productMap = new Map(
    (products ?? []).map((product) => [product.id, product]),
  );

  if (productMap.size !== productIds.length) {
    return NextResponse.json(
      {
        error: "One or more products are unavailable. Please update your cart.",
      },
      { status: 409 },
    );
  }

  const variantIds = [
    ...new Set(
      items
        .map((item) => item.variantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let variantMap = new Map<
    string,
    {
      id: string;
      product_id: string;
      name: string;
      sku: string | null;
      price: number | null;
      stock_quantity: number;
      is_active: boolean;
    }
  >();

  if (variantIds.length > 0) {
    const { data: variants, error: variantsError } = await admin
      .from("product_variants")
      .select("id, product_id, name, sku, price, stock_quantity, is_active")
      .in("id", variantIds);

    if (variantsError) {
      console.error(
        "Checkout variant validation failed:",
        variantsError.message,
      );
      return NextResponse.json(
        { error: "We could not verify your product options." },
        { status: 500 },
      );
    }

    variantMap = new Map(
      (variants ?? []).map((variant) => [variant.id, variant]),
    );
  }

  const orderLines: {
    product_id: string;
    variant_id: string | null;
    product_name: string;
    sku: string | null;
    variant_name: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    customisation_details: Record<string, never>;
  }[] = [];

  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product) {
      return NextResponse.json(
        { error: "A product is no longer available." },
        { status: 409 },
      );
    }

    let name = product.name;
    let sku = product.sku as string | null;
    let variantName: string | null = null;
    let unitPrice = Number(product.price);
    let availableStock = Number(product.stock_quantity);

    if (item.variantId) {
      const variant = variantMap.get(item.variantId);

      if (!variant || !variant.is_active || variant.product_id !== product.id) {
        return NextResponse.json(
          { error: "A selected product option is unavailable." },
          { status: 409 },
        );
      }

      variantName = variant.name;
      name = `${product.name} — ${variant.name}`;
      sku = variant.sku ?? sku;
      unitPrice = Number(variant.price ?? product.price);
      availableStock = Number(variant.stock_quantity);
    }

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !Number.isInteger(availableStock) ||
      availableStock < item.quantity
    ) {
      return NextResponse.json(
        {
          error: `There is insufficient stock for ${product.name}. Please update your cart.`,
        },
        { status: 409 },
      );
    }

    const lineTotal = roundMoney(unitPrice * item.quantity);

    orderLines.push({
      product_id: product.id,
      variant_id: item.variantId,
      product_name: name,
      sku,
      variant_name: variantName,
      unit_price: unitPrice,
      quantity: item.quantity,
      line_total: lineTotal,
      customisation_details: {},
    });
  }

  const subtotal = roundMoney(
    orderLines.reduce((sum, line) => sum + line.line_total, 0),
  );

  // Development values only. Configure real shipping/tax rules
  // before allowing live customer orders.
  const shippingAmount = 0;
  const taxAmount = 0;
  const discountAmount = 0;
  const total = roundMoney(
    subtotal + shippingAmount + taxAmount - discountAmount,
  );

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_name: customerName,
      email,
      phone: phoneDigits,
      shipping_address_line1: address1,
      shipping_address_line2: address2 || null,
      city,
      state,
      postal_code: postalCode,
      country: "India",
      customer_notes: notes || null,
      subtotal,
      shipping_amount: shippingAmount,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total_amount: total,
      currency: "INR",
      order_status: "pending",
      payment_status: "pending",
    })
    .select("id, order_number, total_amount")
    .single();

  if (orderError || !order) {
    console.error("Order creation failed:", orderError?.message);
    return NextResponse.json(
      { error: "We could not create your order. Please try again." },
      { status: 500 },
    );
  }

  const orderItems = orderLines.map((line) => ({
    ...line,
    order_id: order.id,
  }));

  const { error: itemsError } = await admin
    .from("order_items")
    .insert(orderItems);

  if (itemsError) {
    console.error("Order items creation failed:", itemsError.message);

    // Do not leave an incomplete order behind if line items fail.
    const { error: cleanupError } = await admin
      .from("orders")
      .delete()
      .eq("id", order.id);

    if (cleanupError) {
      console.error("Incomplete order cleanup failed:", cleanupError.message);
    }

    return NextResponse.json(
      { error: "We could not save all order items. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount: Number(order.total_amount),
      paymentStatus: "pending",
      message: "Development order created. Payment has not been collected.",
    },
    { status: 201 },
  );
}
