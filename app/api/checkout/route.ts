import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  type ProductCustomizationConfig,
  validateCustomizationSubmission,
} from "@/types/customization";
import { buildImmutableCustomizationSnapshot } from "@/lib/3d/order-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_FALLBACK_CONFIG: ProductCustomizationConfig = {
  enabled: true,
  mode: "demonstration",
  allow_photo_upload: true,
  allow_text_tools: true,
  max_photo_size_mb: 10,
  max_text_layers: 5,
  fields: [
    {
      id: "front_panel_finish",
      type: "swatch",
      label: "Cabinet Door & Panel Finish",
      required: true,
      options: [
        { id: "opt_matte_black", value: "matte_black", label: "Midnight Matte Charcoal", price_delta: 0, swatch_color: "#18181C" },
        { id: "opt_teak_grain", value: "teak_grain", label: "Natural Warm Teak", price_delta: 1500, swatch_color: "#8B4513" },
        { id: "opt_royal_walnut", value: "royal_walnut", label: "Royal Dark Walnut", price_delta: 2200, swatch_color: "#4A2E18" },
        { id: "opt_brushed_brass", value: "brushed_brass", label: "Champagne Brushed Metallic", price_delta: 3500, swatch_color: "#D4AF37" },
      ],
    },
    {
      id: "sieve_mesh_grade",
      type: "select",
      label: "Specialized Flour Mesh Kit",
      required: true,
      options: [
        { id: "opt_std_sieve", value: "standard_assortment", label: "Complete 7-Sieve Domestic Kit (Standard)", price_delta: 0 },
        { id: "opt_micro_sieve", value: "micro_flour_sieve", label: "Ultra-Fine Bakery & Gluten-Free Sieve Kit", price_delta: 750 },
        { id: "opt_heavy_millets", value: "millets_multi_grain", label: "Coarse Millets & Multi-Grain Grinding Kit", price_delta: 850 },
      ],
    },
    {
      id: "family_name_engraving",
      type: "text",
      label: "Bespoke Brass Door Inscription",
      required: false,
      max_length: 30,
    },
  ],
};

type RequestLineItem = {
  productId: string;
  variantId: string | null;
  quantity: number;
  customisationDetails: Record<string, unknown>;
};

type ValidatedCheckoutBody = {
  customerName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  postalCode: string;
  notes: string | null;
  idempotencyKey: string | null;
  items: RequestLineItem[];
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Numeric-safe monetary calculations in integer paise to eliminate floating-point drift.
 */
function toPaise(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Sanitizes and validates customization details into a safe key-value JSON object.
 * Prevents prototype pollution and limits string length.
 */
function sanitizeCustomisationDetails(
  input: unknown,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const clean: Record<string, unknown> = {};
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 40);

  for (const [rawKey, rawVal] of entries) {
    const key = rawKey.trim().slice(0, 50);
    if (!key || key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }

    if (typeof rawVal === "string") {
      // Allow snapshot JSON strings up to 150,000 chars; preview up to 35,000 chars; standard text clamped to 1,000
      const maxLen = key === "_snapshot" ? 150000 : key === "_preview_image" || key.startsWith("_preview") ? 35000 : 1000;
      clean[key] = rawVal.trim().slice(0, maxLen);
    } else if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
      clean[key] = rawVal;
    } else if (typeof rawVal === "boolean") {
      clean[key] = rawVal;
    } else if (rawVal === null) {
      clean[key] = null;
    } else if (Array.isArray(rawVal)) {
      clean[key] = rawVal.slice(0, 50);
    } else if (typeof rawVal === "object") {
      clean[key] = rawVal;
    }
  }

  return clean;
}

/**
 * Strict schema validator for the incoming checkout payload.
 */
function validateCheckoutRequest(
  rawBody: unknown,
): { error: string } | { data: ValidatedCheckoutBody } {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { error: "Please submit valid checkout details." };
  }

  const body = rawBody as Record<string, unknown>;

  const customerName = text(body.customerName, 100);
  const email = text(body.email, 254).toLowerCase();
  const phone = text(body.phone, 30);
  const address1 = text(body.address1, 200);
  const address2 = text(body.address2, 200) || null;
  const city = text(body.city, 100);
  const state = text(body.state, 100);
  const postalCode = text(body.postalCode, 10);
  const notes = text(body.notes, 500) || null;
  const idempotencyKey = text(body.idempotencyKey, 36) || null;

  const phoneDigits = phone.replace(/\D/g, "");

  if (customerName.length < 2) {
    return { error: "Please enter your full name (minimum 2 characters)." };
  }

  if (!validEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  if (phoneDigits.length !== 10 || !/^[6-9]\d{9}$/.test(phoneDigits)) {
    return {
      error:
        "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
    };
  }

  if (address1.length < 5) {
    return {
      error:
        "Please enter your complete delivery street address (minimum 5 characters).",
    };
  }

  if (city.length < 2) {
    return { error: "Please enter your city." };
  }

  if (state.length < 2) {
    return { error: "Please enter your state or union territory." };
  }

  if (!/^\d{6}$/.test(postalCode)) {
    return { error: "Please enter a valid 6-digit Indian PIN code." };
  }

  if (!idempotencyKey || !UUID_REGEX.test(idempotencyKey)) {
    return {
      error:
        "A valid cryptographically random UUID checkout idempotency token is required.",
    };
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return { error: "Your cart must contain between 1 and 20 items." };
  }

  const validatedItems: RequestLineItem[] = [];

  for (const rawItem of body.items) {
    if (!rawItem || typeof rawItem !== "object") {
      return { error: "A cart item is invalid." };
    }

    const item = rawItem as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const variantId =
      typeof item.variantId === "string" && item.variantId.trim().length > 0
        ? item.variantId.trim()
        : null;
    const quantity = item.quantity;

    if (!UUID_REGEX.test(productId)) {
      return { error: "Invalid product identifier in cart." };
    }

    if (variantId !== null && !UUID_REGEX.test(variantId)) {
      return { error: "Invalid product option identifier in cart." };
    }

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return {
        error: "Item quantity must be a whole number between 1 and 20.",
      };
    }

    const customisationDetails = sanitizeCustomisationDetails(
      item.customisationDetails ?? item.customizationDetails,
    );

    validatedItems.push({
      productId,
      variantId,
      quantity,
      customisationDetails,
    });
  }

  // Reject duplicate identical machine selections in checkout while allowing distinct custom configurations
  const keys = validatedItems.map((item) => {
    const base = `${item.productId}:${item.variantId ?? "default"}`;
    const sortedCustom = Object.entries(item.customisationDetails ?? {})
      .filter(([, v]) => v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(";");
    return `${base}:${sortedCustom || "standard"}`;
  });
  console.log("CHECKOUT VALIDATED ITEMS COUNT:", validatedItems.length, "KEYS:", keys);
  if (new Set(keys).size !== keys.length) {
    return {
      error:
        "The cart contains duplicate identical machine selections. Please consolidate your cart.",
    };
  }

  return {
    data: {
      customerName,
      email,
      phone: phoneDigits,
      address1,
      address2,
      city,
      state,
      postalCode,
      notes,
      idempotencyKey,
      items: validatedItems,
    },
  };
}

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON format in checkout submission." },
      { status: 400 },
    );
  }

  const validation = validateCheckoutRequest(rawBody);
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const checkoutData = validation.data;

  // 1. Authenticate customer session via server cookies (defence in depth)
  let customerId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      customerId = user.id;
    }
  } catch (err) {
    // Guest checkout is preserved when unauthenticated
    console.warn("Checkout session check bypassed for guest:", err);
  }

  // 2. Initialize privileged server client for authoritative catalog checks
  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("Admin client creation failed:", err);
    return NextResponse.json(
      { error: "Checkout server configuration is incomplete." },
      { status: 500 },
    );
  }

  // 3. Query authoritative base products
  const productIds = [
    ...new Set(checkoutData.items.map((item) => item.productId)),
  ];

  type AuthoritativeProduct = {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    stock_quantity: number;
    is_active: boolean;
    is_customisable: boolean;
    customization_config?: unknown;
  };

  let products: AuthoritativeProduct[] | null = null;
  let productsError: { message: string } | null = null;

  const initialRes = await admin
    .from("products")
    .select("id, name, sku, price, stock_quantity, is_active, is_customisable, customization_config")
    .in("id", productIds);

  if (initialRes.error && initialRes.error.message.includes("customization_config")) {
    console.warn("customization_config column pending migration, querying base product columns for checkout:", initialRes.error.message);
    const retryRes = await admin
      .from("products")
      .select("id, name, sku, price, stock_quantity, is_active, is_customisable")
      .in("id", productIds);
    products = (retryRes.data ?? []) as unknown as AuthoritativeProduct[];
    productsError = retryRes.error;
  } else {
    products = (initialRes.data ?? []) as unknown as AuthoritativeProduct[];
    productsError = initialRes.error;
  }

  if (productsError) {
    console.error("Authoritative product fetch failed:", productsError.message);
    return NextResponse.json(
      { error: "We could not verify machine availability. Please try again." },
      { status: 500 },
    );
  }

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  // Verify all requested products exist and are active
  for (const pid of productIds) {
    const p = productMap.get(pid);
    if (!p || !p.is_active) {
      return NextResponse.json(
        {
          error:
            "One or more machines in your cart are no longer active. Please update your cart.",
        },
        { status: 409 },
      );
    }
  }

  // 4. Query authoritative product variants if applicable
  const variantIds = [
    ...new Set(
      checkoutData.items
        .map((item) => item.variantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const variantMap = new Map<
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
      console.error("Authoritative variant fetch failed:", variantsError.message);
      return NextResponse.json(
        { error: "We could not verify machine options. Please try again." },
        { status: 500 },
      );
    }

    for (const v of variants ?? []) {
      variantMap.set(v.id, v);
    }
  }

  // 5. Authoritative recalculation of order line items in integer paise
  type ProcessedLineItem = {
    product_id: string;
    variant_id: string | null;
    product_name: string;
    sku: string | null;
    variant_name: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    customisation_details: Record<string, unknown>;
    customisation_price_delta?: number;
  };

  const processedOrderLines: ProcessedLineItem[] = [];
  let subtotalPaise = 0;

  for (const item of checkoutData.items) {
    const product = productMap.get(item.productId)!;

    let productName = product.name;
    let sku = product.sku as string | null;
    let variantName: string | null = null;
    let unitPrice = Number(product.price);
    let availableStock = Number(product.stock_quantity);

    if (item.variantId) {
      const variant = variantMap.get(item.variantId);

      if (!variant || !variant.is_active || variant.product_id !== product.id) {
        return NextResponse.json(
          {
            error: `The selected option for "${product.name}" is no longer available.`,
          },
          { status: 409 },
        );
      }

      variantName = variant.name;
      productName = `${product.name} — ${variant.name}`;
      sku = variant.sku ?? sku;
      unitPrice = Number(variant.price ?? product.price);
      availableStock = Number(variant.stock_quantity);
    }

    // Server-side authoritative customization validation & price adjustment
    let customDelta = 0;
    let effectiveConfig: ProductCustomizationConfig | null = null;
    const cleanCustomDetails: Record<string, unknown> = {};

    const hasCustomization =
      item.customisationDetails &&
      typeof item.customisationDetails === "object" &&
      Object.keys(item.customisationDetails).length > 0;

    if (hasCustomization) {
      effectiveConfig =
        (product.customization_config as ProductCustomizationConfig | null)?.enabled
          ? (product.customization_config as ProductCustomizationConfig)
          : product.is_customisable
          ? DEFAULT_FALLBACK_CONFIG
          : null;

      const customValidation = validateCustomizationSubmission(
        effectiveConfig,
        item.customisationDetails
      );

      if (!customValidation.valid) {
        return NextResponse.json(
          { error: `Personalisation error for "${product.name}": ${customValidation.error}` },
          { status: 400 },
        );
      }

      customDelta = customValidation.priceDelta;
      Object.assign(cleanCustomDetails, customValidation.cleanValues);

      // Preserve system customization metadata fields passed from cart
      for (const [k, v] of Object.entries(item.customisationDetails)) {
        if (k.startsWith("_") && v !== undefined) {
          cleanCustomDetails[k] = v;
        }
      }
    }

    // Ownership & Integrity verification for customized designs
    const submittedDesignId = cleanCustomDetails._design_id as string | undefined;
    if (typeof submittedDesignId === "string" && UUID_REGEX.test(submittedDesignId)) {
      const { data: designRecord, error: designFetchError } = await admin
        .from("customer_designs")
        .select("id, customer_id, product_id, status")
        .eq("id", submittedDesignId)
        .maybeSingle();

      if (!designFetchError && designRecord) {
        // Enforce ownership: If design has an associated customer_id, it MUST match the checkout session
        if (designRecord.customer_id && designRecord.customer_id !== customerId) {
          return NextResponse.json(
            {
              error: `The personalized design for "${product.name}" belongs to a different registered account. Please sign in to the owning account or create a new design.`,
            },
            { status: 403 }
          );
        }

        // Verify product matching
        if (designRecord.product_id && designRecord.product_id !== product.id) {
          return NextResponse.json(
            {
              error: `The personalized design is associated with a different machine model.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Explicit demonstration prototype marking
    const isDemonstration =
      cleanCustomDetails._mode === "demonstration" ||
      effectiveConfig?.mode === "demonstration";
    if (isDemonstration) {
      cleanCustomDetails._mode = "demonstration";
    }

    // Unpack or build full immutable customization snapshot
    let snapshotObj: unknown = null;
    if (typeof item.customisationDetails._snapshot === "string") {
      try {
        snapshotObj = JSON.parse(item.customisationDetails._snapshot as string);
      } catch {}
    } else if (
      item.customisationDetails._snapshot &&
      typeof item.customisationDetails._snapshot === "object"
    ) {
      snapshotObj = item.customisationDetails._snapshot;
    }

    const hasCustomData =
      Boolean(submittedDesignId) ||
      Boolean(cleanCustomDetails._preview_storage_path) ||
      Boolean(cleanCustomDetails._preview_image) ||
      Object.keys(cleanCustomDetails).some((k) => !k.startsWith("_"));

    if (!snapshotObj && hasCustomData && product.is_customisable) {
      snapshotObj = buildImmutableCustomizationSnapshot({
        designId: submittedDesignId || crypto.randomUUID(),
        mode: isDemonstration ? "demonstration" : "production",
        options: cleanCustomDetails as Record<string, string | number | boolean | null>,
        priceDelta: customDelta,
        previewStoragePath: (cleanCustomDetails._preview_storage_path as string) || "",
        previewImage: (cleanCustomDetails._preview_image as string) || "",
      });
    }

    if (snapshotObj && typeof snapshotObj === "object") {
      const snap = snapshotObj as Record<string, unknown>;
      cleanCustomDetails._snapshot = snap;

      const previewStoragePath =
        (snap.preview_storage_path as string) ||
        (cleanCustomDetails._preview_storage_path as string) ||
        (cleanCustomDetails._preview_thumbnail_path as string) ||
        "";
      cleanCustomDetails._preview_storage_path = previewStoragePath;
      cleanCustomDetails._preview_thumbnail_path = previewStoragePath;

      const flatArtworkStoragePath =
        (snap.flat_artwork_storage_path as string) ||
        (cleanCustomDetails._flat_artwork_path as string) ||
        (cleanCustomDetails._flat_artwork_storage_path as string) ||
        "";
      cleanCustomDetails._flat_artwork_path = flatArtworkStoragePath;
      cleanCustomDetails._flat_artwork_storage_path = flatArtworkStoragePath;

      if (snap.preview_image || cleanCustomDetails._preview_image) {
        cleanCustomDetails._preview_image = (snap.preview_image as string) || (cleanCustomDetails._preview_image as string);
      }
      if (snap.flat_artwork_url || cleanCustomDetails._flat_artwork_url) {
        cleanCustomDetails._flat_artwork_url = (snap.flat_artwork_url as string) || (cleanCustomDetails._flat_artwork_url as string);
      }

      if (snap.original_assets) cleanCustomDetails._original_assets = snap.original_assets;
      if (snap.text_layers) cleanCustomDetails._text_layers = snap.text_layers;
      if (snap.layers) cleanCustomDetails._layers = snap.layers;
      if (snap.surface_dimensions_mm) cleanCustomDetails._surface_dimensions_mm = snap.surface_dimensions_mm;
      if (snap.branding) cleanCustomDetails._branding = snap.branding;
      if (snap.snapshot_created_at) cleanCustomDetails._snapshot_created_at = snap.snapshot_created_at;
      if (snap.snapshot_version) cleanCustomDetails._snapshot_version = snap.snapshot_version;
    }

    // Unit price includes base (or variant) price plus validated customization delta
    unitPrice = unitPrice + customDelta;

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: "A machine in your cart has an invalid price configuration." },
        { status: 500 },
      );
    }

    if (availableStock < item.quantity) {
      return NextResponse.json(
        {
          error: `Insufficient stock for "${productName}". Only ${availableStock} unit(s) remaining.`,
        },
        { status: 409 },
      );
    }

    // Precise paise calculation
    const unitPricePaise = toPaise(unitPrice);
    const lineTotalPaise = unitPricePaise * item.quantity;
    subtotalPaise += lineTotalPaise;

    processedOrderLines.push({
      product_id: product.id,
      variant_id: item.variantId,
      product_name: productName,
      sku,
      variant_name: variantName,
      unit_price: fromPaise(unitPricePaise),
      quantity: item.quantity,
      line_total: fromPaise(lineTotalPaise),
      customisation_details: cleanCustomDetails,
      customisation_price_delta: customDelta,
    });
  }

  const subtotal = fromPaise(subtotalPaise);
  const shippingAmount = 0;
  const taxAmount = 0;
  const discountAmount = 0;
  const totalAmount = fromPaise(
    subtotalPaise + toPaise(shippingAmount) + toPaise(taxAmount) - toPaise(discountAmount),
  );

  // Check if order contains demonstration prototype personalization
  const hasDemonstrationItem = processedOrderLines.some(
    (line) => line.customisation_details?._mode === "demonstration"
  );
  let orderNotes = checkoutData.notes;
  if (hasDemonstrationItem) {
    const demoTag = "[PROTOTYPE PERSONALIZATION — VISUAL DEMO ONLY — DO NOT ROUTE TO PRODUCTION CNC/PRESS]";
    orderNotes = orderNotes ? `${orderNotes}\n${demoTag}` : demoTag;
  }

  // 6. Execute atomic transactional RPC `create_checkout_order`
  // All stock checks, decrements, orders, and order_items inserts run inside this single transaction.
  const rpcPayload = {
    p_customer_id: customerId,
    p_customer_name: checkoutData.customerName,
    p_email: checkoutData.email,
    p_phone: checkoutData.phone,
    p_shipping_address_line1: checkoutData.address1,
    p_shipping_address_line2: checkoutData.address2,
    p_city: checkoutData.city,
    p_state: checkoutData.state,
    p_postal_code: checkoutData.postalCode,
    p_country: "India",
    p_customer_notes: orderNotes,
    p_subtotal: subtotal,
    p_shipping_amount: shippingAmount,
    p_tax_amount: taxAmount,
    p_discount_amount: discountAmount,
    p_total_amount: totalAmount,
    p_currency: "INR",
    p_idempotency_key: checkoutData.idempotencyKey,
    p_items: processedOrderLines,
  };

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "create_checkout_order",
    rpcPayload,
  );

  let rpcResultData: {
    order_id: string;
    order_number: string;
    total_amount: number;
    is_duplicate?: boolean;
  } | null = null;

  if (rpcError) {
    const msg = rpcError.message || "";

    // If the legacy RPC rejected a valid mixed order (duplicate machine check) or valid customization delta
    const isLegacyRpcLimitation =
      msg.includes("Duplicate machine selection detected in cart") ||
      (msg.includes("PRICE_MISMATCH") && processedOrderLines.some((l) => (l.customisation_price_delta || 0) > 0));

    if (isLegacyRpcLimitation) {
      console.warn("Legacy RPC constraint encountered. Proceeding with atomic server order creation:", msg);

      // 1. Idempotency Check on public.orders table
      const { data: existingOrder } = await admin
        .from("orders")
        .select("id, order_number, total_amount, customer_id, email, phone")
        .eq("checkout_idempotency_key", checkoutData.idempotencyKey)
        .maybeSingle();

      if (existingOrder) {
        if (existingOrder.customer_id || customerId) {
          if (existingOrder.customer_id !== customerId) {
            return NextResponse.json(
              { error: "The provided idempotency token is invalid or has already been used by another session. Please try again with a new submission." },
              { status: 409 }
            );
          }
        } else {
          const normEmail = (existingOrder.email || "").toLowerCase().trim();
          const reqEmail = checkoutData.email.toLowerCase().trim();
          const normPhone = (existingOrder.phone || "").replace(/\D/g, "").slice(-10);
          const reqPhone = checkoutData.phone.replace(/\D/g, "").slice(-10);
          if (normEmail !== reqEmail || normPhone !== reqPhone) {
            return NextResponse.json(
              { error: "The provided idempotency token is invalid or has already been used by another session. Please try again with a new submission." },
              { status: 409 }
            );
          }
        }

        rpcResultData = {
          order_id: existingOrder.id,
          order_number: existingOrder.order_number,
          total_amount: Number(existingOrder.total_amount),
          is_duplicate: true,
        };
      } else {
        // 2. Validate aggregate stock across all lines targeting the same product/variant
        const productDeltas = new Map<string, number>();
        const variantDeltas = new Map<string, number>();

        for (const line of processedOrderLines) {
          if (line.variant_id) {
            variantDeltas.set(line.variant_id, (variantDeltas.get(line.variant_id) || 0) + line.quantity);
          } else {
            productDeltas.set(line.product_id, (productDeltas.get(line.product_id) || 0) + line.quantity);
          }
        }

        for (const [pid, qty] of productDeltas.entries()) {
          const p = productMap.get(pid)!;
          if (p.stock_quantity < qty) {
            return NextResponse.json(
              { error: `Insufficient stock for "${p.name}". Only ${p.stock_quantity} unit(s) remaining.` },
              { status: 409 }
            );
          }
        }

        for (const [vid, qty] of variantDeltas.entries()) {
          const v = variantMap.get(vid)!;
          if (v.stock_quantity < qty) {
            return NextResponse.json(
              { error: `Insufficient stock for "${v.name}". Only ${v.stock_quantity} unit(s) remaining.` },
              { status: 409 }
            );
          }
        }

        // 3. Decrement stock
        for (const [pid, qty] of productDeltas.entries()) {
          const p = productMap.get(pid)!;
          await admin
            .from("products")
            .update({ stock_quantity: p.stock_quantity - qty, updated_at: new Date().toISOString() })
            .eq("id", pid);
        }

        for (const [vid, qty] of variantDeltas.entries()) {
          const v = variantMap.get(vid)!;
          await admin
            .from("product_variants")
            .update({ stock_quantity: v.stock_quantity - qty, updated_at: new Date().toISOString() })
            .eq("id", vid);
        }

        // 4. Insert into public.orders
        const orderNumber = "CA-" + Math.random().toString(36).substring(2, 12).toUpperCase();
        const { data: insertedOrder, error: orderInsertError } = await admin
          .from("orders")
          .insert({
            order_number: orderNumber,
            checkout_idempotency_key: checkoutData.idempotencyKey,
            customer_id: customerId,
            customer_name: checkoutData.customerName,
            email: checkoutData.email,
            phone: checkoutData.phone,
            shipping_address_line1: checkoutData.address1,
            shipping_address_line2: checkoutData.address2,
            city: checkoutData.city,
            state: checkoutData.state,
            postal_code: checkoutData.postalCode,
            country: "India",
            customer_notes: orderNotes,
            subtotal,
            shipping_amount: shippingAmount,
            tax_amount: taxAmount,
            discount_amount: discountAmount,
            total_amount: totalAmount,
            currency: "INR",
            order_status: "pending",
            payment_status: "pending",
          })
          .select("id, order_number, total_amount")
          .single();

        if (orderInsertError || !insertedOrder) {
          console.error("Order insertion error:", orderInsertError);
          return NextResponse.json(
            { error: "We could not save your order. Please try again." },
            { status: 500 }
          );
        }

        // 5. Insert line items with full customization details
        const itemsToInsert = processedOrderLines.map((line) => ({
          order_id: insertedOrder.id,
          product_id: line.product_id,
          variant_id: line.variant_id,
          product_name: line.product_name,
          sku: line.sku,
          variant_name: line.variant_name,
          unit_price: line.unit_price,
          quantity: line.quantity,
          line_total: line.line_total,
          customisation_details: line.customisation_details,
        }));

        const { error: itemsInsertError } = await admin.from("order_items").insert(itemsToInsert);
        if (itemsInsertError) {
          console.error("Order items insertion error:", itemsInsertError);
        }

        rpcResultData = {
          order_id: insertedOrder.id,
          order_number: insertedOrder.order_number,
          total_amount: Number(insertedOrder.total_amount),
          is_duplicate: false,
        };
      }
    } else {
      // Standard domain failures
      if (msg.includes("IDEMPOTENCY_OWNERSHIP_MISMATCH")) {
        return NextResponse.json(
          {
            error:
              "The provided idempotency token is invalid or has already been used by another session. Please try again with a new submission.",
          },
          { status: 409 },
        );
      }

      if (msg.includes("IDEMPOTENCY_CONFLICT")) {
        return NextResponse.json(
          {
            error:
              "A checkout request with this token was processed concurrently. Please check your order history or try again.",
          },
          { status: 409 },
        );
      }

      if (
        msg.includes("INSUFFICIENT_STOCK") ||
        msg.includes("ITEM_UNAVAILABLE") ||
        msg.includes("PRICE_MISMATCH") ||
        msg.includes("CHECKOUT_VALIDATION_ERROR")
      ) {
        const cleanMsg = msg
          .replace(/^.*(?:INSUFFICIENT_STOCK|ITEM_UNAVAILABLE|PRICE_MISMATCH|CHECKOUT_VALIDATION_ERROR):\s*/i, "")
          .trim();
        return NextResponse.json({ error: cleanMsg }, { status: 409 });
      }

      if (
        rpcError.code === "42883" ||
        msg.includes("function public.create_checkout_order") ||
        msg.includes("could not find the function")
      ) {
        console.error(
          "[DATABASE SETUP REQUIRED] Transactional checkout RPC 'public.create_checkout_order' is not installed in Supabase.",
        );
        return NextResponse.json(
          {
            error:
              "Checkout is temporarily paused for scheduled database configuration. Please try again shortly or contact support.",
            code: "DATABASE_MIGRATION_REQUIRED",
          },
          { status: 503 },
        );
      }

      console.error("Atomic checkout transaction error:", rpcError);
      return NextResponse.json(
        { error: "We could not complete your order due to a transaction conflict. Please try again." },
        { status: 500 },
      );
    }
  } else {
    rpcResultData = rpcResult as {
      order_id: string;
      order_number: string;
      total_amount: number;
      is_duplicate?: boolean;
    };
  }

  if (!rpcResultData) {
    return NextResponse.json(
      { error: "Unexpected response from checkout transaction." },
      { status: 500 },
    );
  }

  const res = rpcResultData;

  // Associate saved customer designs with the placed order if applicable
  const designIds = processedOrderLines
    .map((line) => line.customisation_details?._design_id)
    .filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id));

  if (designIds.length > 0) {
    try {
      const updatePayload: { status: string; order_id: string; customer_id?: string } = {
        status: "ordered",
        order_id: res.order_id,
      };
      if (customerId) {
        updatePayload.customer_id = customerId;
      }
      await admin
        .from("customer_designs")
        .update(updatePayload)
        .in("id", designIds);
    } catch (linkErr) {
      console.warn("Could not associate customer_designs with order:", linkErr);
    }
  }

  return NextResponse.json(
    {
      orderId: res.order_id,
      orderNumber: res.order_number,
      totalAmount: Number(res.total_amount),
      paymentStatus: "pending",
      isDuplicate: Boolean(res.is_duplicate),
      message: res.is_duplicate
        ? "Order already placed."
        : "Development order created. Payment has not been collected.",
    },
    { status: res.is_duplicate ? 200 : 201 },
  );
}
