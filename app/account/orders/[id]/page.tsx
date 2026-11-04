import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  Package,
  MapPin,
  CreditCard,
  FileText,
  Wheat,
  Sparkles,
  Camera,
  Type,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { resolveCustomizationAssetUrl } from "@/lib/3d/storage-assets";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOrderStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "delivered":
      return {
        label: "Delivered",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
        icon: CheckCircle2,
      };
    case "shipped":
      return {
        label: "Shipped",
        classes: "bg-cyan-50 text-cyan-800 border-cyan-200",
        icon: Truck,
      };
    case "processing":
      return {
        label: "Processing",
        classes: "bg-indigo-50 text-indigo-800 border-indigo-200",
        icon: Clock,
      };
    case "confirmed":
      return {
        label: "Confirmed",
        classes: "bg-blue-50 text-blue-800 border-blue-200",
        icon: CheckCircle2,
      };
    case "pending":
      return {
        label: "Pending Confirmation",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
        icon: Clock,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        classes: "bg-stone-100 text-stone-700 border-stone-200",
        icon: AlertCircle,
      };
    case "refunded":
      return {
        label: "Refunded",
        classes: "bg-purple-50 text-purple-800 border-purple-200",
        icon: AlertCircle,
      };
    default:
      return {
        label: status || "Unknown",
        classes: "bg-stone-100 text-stone-800 border-stone-200",
        icon: Clock,
      };
  }
}

function getPaymentStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return {
        label: "Paid",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    case "authorized":
      return {
        label: "Authorized",
        classes: "bg-blue-50 text-blue-800 border-blue-200",
      };
    case "pending":
      return {
        label: "Payment Pending",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "failed":
      return {
        label: "Payment Failed",
        classes: "bg-red-50 text-red-800 border-red-200",
      };
    case "refunded":
      return {
        label: "Refunded",
        classes: "bg-purple-50 text-purple-800 border-purple-200",
      };
    default:
      return {
        label: status || "Pending",
        classes: "bg-stone-100 text-stone-700 border-stone-200",
      };
  }
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;

  // 1. Validate ID format
  if (!id || !UUID_REGEX.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  // 2. Cryptographically verify authenticated session server-side
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(`/login?next=/account/orders/${id}`);
  }

  // 3. Query order explicitly scoped to customer_id = user.id (defense in depth + RLS)
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (orderError || !order) {
    notFound();
  }

  // 4. Query order line items for this specific order
  const { data: rawItems } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const items = rawItems ?? [];

  const orderStatus = getOrderStatusBadge(order.order_status);
  const paymentStatus = getPaymentStatusBadge(order.payment_status);
  const StatusIcon = orderStatus.icon;

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to My Account</span>
          </Link>
        </div>

        {/* Order Header Summary Card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                  Order #{order.order_number}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${orderStatus.classes}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span>{orderStatus.label}</span>
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${paymentStatus.classes}`}
                >
                  {paymentStatus.label}
                </span>
              </div>

              <p className="mt-2 text-xs text-stone-500 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                <span>Placed on {formatDate(order.created_at)}</span>
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                Total Amount
              </span>
              <span className="font-display text-2xl font-bold text-stone-900">
                {formatINR(Number(order.total_amount))}
              </span>
            </div>
          </div>

          {/* Customer Notice if present */}
          {order.customer_notes && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <strong className="font-semibold">Your Delivery Instructions:</strong>{" "}
                <span>{order.customer_notes}</span>
              </div>
            </div>
          )}
        </div>

        {/* Main Grid: Order Items & Delivery Details */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: Items Ordered (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Products Card */}
            <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-stone-100 px-6 py-4 bg-stone-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-stone-600" />
                  <h2 className="font-display text-sm font-bold text-stone-900">
                    Items in this Order ({items.length})
                  </h2>
                </div>
                <span className="text-xs text-stone-500">
                  Calvin domestic flour mill
                </span>
              </div>

              <div className="divide-y divide-stone-100">
                {items.map((item) => {
                  const customDetails =
                    item.customisation_details &&
                    typeof item.customisation_details === "object" &&
                    Object.keys(item.customisation_details).length > 0
                      ? item.customisation_details
                      : null;

                  return (
                    <div key={item.id} className="p-6 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h3 className="font-display font-bold text-stone-900 text-sm sm:text-base">
                            {item.product_name}
                          </h3>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            {item.variant_name && (
                              <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-700">
                                Variant: {item.variant_name}
                              </span>
                            )}
                            {item.sku && (
                              <span className="text-stone-400">
                                SKU: {item.sku}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right whitespace-nowrap">
                          <span className="font-display font-bold text-stone-900 text-sm sm:text-base">
                            {formatINR(Number(item.line_total))}
                          </span>
                          <span className="block text-xs text-stone-500">
                            {formatINR(Number(item.unit_price))} × {item.quantity}
                          </span>
                        </div>
                      </div>

                      {/* Customization Details if applied */}
                      {customDetails && (
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-xs text-stone-700 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-amber-200/50 pb-2">
                            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-[11px] uppercase tracking-wider">
                              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                              <span>Custom Personalization Artwork</span>
                            </div>
                            {customDetails._mode === "demonstration" && (
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 border border-amber-300">
                                Visual Prototype
                              </span>
                            )}
                          </div>

                          {(() => {
                            const snap = (customDetails._snapshot && typeof customDetails._snapshot === "object"
                              ? customDetails._snapshot
                              : typeof customDetails._snapshot === "string"
                              ? (() => {
                                  try {
                                    return JSON.parse(customDetails._snapshot as string);
                                  } catch {
                                    return {};
                                  }
                                })()
                              : {}) as Record<string, unknown>;

                            const previewPath =
                              (customDetails._preview_thumbnail_path as string) ||
                              (customDetails._preview_storage_path as string) ||
                              (snap.preview_storage_path as string) ||
                              (customDetails._preview_image as string) ||
                              "";

                            const flatPath =
                              (customDetails._flat_artwork_path as string) ||
                              (customDetails._flat_artwork_storage_path as string) ||
                              (snap.flat_artwork_storage_path as string) ||
                              (customDetails._flat_artwork_url as string) ||
                              "";

                            const textLayers =
                              (customDetails._text_layers as Array<Record<string, unknown>>) ||
                              (snap.text_layers as Array<Record<string, unknown>>) ||
                              [];

                            const allLayers =
                              (customDetails._layers as Array<Record<string, unknown>>) ||
                              (snap.layers as Array<Record<string, unknown>>) ||
                              [];

                            const textItem =
                              textLayers[0] ||
                              allLayers.find((l) => l.type === "text" || l.text);
                            const inscription =
                              (textItem?.text as string) ||
                              (customDetails.family_name_engraving as string) ||
                              "";

                            return (
                              <>
                                <div className="flex flex-col sm:flex-row gap-4 items-start">
                                  {Boolean(previewPath) && (
                                    <div className="shrink-0 text-center">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={resolveCustomizationAssetUrl(previewPath)}
                                        alt="Custom front panel design"
                                        className="h-28 w-28 rounded-lg border border-amber-300 bg-stone-900 object-contain p-1 shadow-2xs"
                                      />
                                      <span className="block mt-1 text-[10px] font-bold uppercase text-stone-500">
                                        3D Preview
                                      </span>
                                    </div>
                                  )}

                                  {Boolean(flatPath) && (
                                    <div className="shrink-0 text-center">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={resolveCustomizationAssetUrl(flatPath)}
                                        alt="Canonical flat artwork"
                                        className="h-28 w-28 rounded-lg border border-stone-200 bg-white object-contain p-1 shadow-2xs"
                                      />
                                      <span className="block mt-1 text-[10px] font-bold uppercase text-stone-500">
                                        Flat Artwork
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex-1 min-w-0 space-y-2">
                                    {typeof customDetails._customization_summary === "string" && (
                                      <p className="text-xs font-semibold text-stone-900 leading-snug">
                                        {customDetails._customization_summary}
                                      </p>
                                    )}

                                    {/* Prominent Custom Inscription Highlight */}
                                    {Boolean(inscription) && (
                                      <div className="rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                          <Type className="h-3 w-3 text-amber-600" />
                                          <span>Custom Inscription</span>
                                        </div>
                                        <p
                                          className="mt-1 text-base font-bold text-stone-900"
                                          style={{
                                            fontFamily: (textItem?.fontFamily as string) || "'Noto Serif Devanagari', serif",
                                            color: (textItem?.color as string) || (textItem?.fill as string) || "#b45309",
                                          }}
                                        >
                                          &ldquo;{inscription}&rdquo;
                                        </p>
                                        <p className="text-[10px] text-stone-500 mt-0.5">
                                          Font: {(textItem?.fontFamily as string) || "Standard"} • Size: {String(textItem?.fontSize || 28)}pt
                                        </p>
                                      </div>
                                    )}

                                    {customDetails._mode === "demonstration" && (
                                      <p className="text-[11px] text-amber-900 leading-snug">
                                        Note: Configured on the provisional CALVIN-COMPACT-01 prototype (380 × 620 mm door panel). Final factory dimensions will be calibrated prior to manufacturing release.
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Customer's Uploaded Photographs if preserved */}
                                {Array.isArray(customDetails._original_assets) && customDetails._original_assets.length > 0 && (
                                  <div className="pt-2 border-t border-amber-200/50">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1.5 flex items-center gap-1">
                                      <Camera className="h-3 w-3" />
                                      <span>Uploaded Photographs ({customDetails._original_assets.length})</span>
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {customDetails._original_assets.map((asset: Record<string, unknown>, idx: number) => {
                                        const pathOrUrl = (asset.storagePath as string) || (asset.imageUrl as string);
                                        if (!pathOrUrl) return null;
                                        return (
                                          <div key={idx} className="relative group">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={resolveCustomizationAssetUrl(pathOrUrl)}
                                              alt={`Original upload ${idx + 1}`}
                                              className="h-14 w-14 rounded border border-amber-300 bg-white object-cover"
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}

                              {Object.entries(customDetails).filter(([k]) => !k.startsWith("_")).length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 text-[11px]">
                                  {Object.entries(customDetails)
                                    .filter(([k, v]) => !k.startsWith("_") && v !== null && v !== "" && v !== undefined)
                                    .map(([key, val]) => (
                                      <div key={key} className="truncate">
                                        <span className="font-medium text-stone-500 capitalize">
                                          {key.replace(/_/g, " ")}:
                                        </span>{" "}
                                        <span className="text-stone-900 font-semibold">
                                          {typeof val === "object" ? JSON.stringify(val) : String(val)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Delivery Address Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-bold text-stone-900">
                    Shipping &amp; Delivery Details
                  </h2>
                  <p className="text-xs text-stone-500">
                    Destination confirmed at checkout
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs leading-relaxed text-stone-700">
                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Recipient
                  </span>
                  <p className="mt-1 font-medium text-stone-900 text-sm">
                    {order.customer_name}
                  </p>
                  <p className="text-stone-600">{order.phone}</p>
                  <p className="text-stone-600">{order.email}</p>
                </div>

                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Delivery Address
                  </span>
                  <div className="mt-1 space-y-0.5 text-stone-800">
                    <p>{order.shipping_address_line1}</p>
                    {order.shipping_address_line2 && (
                      <p>{order.shipping_address_line2}</p>
                    )}
                    <p>
                      {order.city}, {order.state} - {order.postal_code}
                    </p>
                    <p className="font-medium text-stone-900">{order.country}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Price Summary & Payment (1 Col) */}
          <div className="space-y-6">
            {/* Price Summary Breakdown Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="font-display text-sm font-bold text-stone-900 border-b border-stone-100 pb-3">
                Order Financial Summary
              </h2>

              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(Number(order.subtotal))}
                  </span>
                </div>

                <div className="flex justify-between text-stone-600">
                  <span>Shipping &amp; Handling</span>
                  <span className="font-medium text-stone-900">
                    {Number(order.shipping_amount) === 0
                      ? "Free Delivery"
                      : formatINR(Number(order.shipping_amount))}
                  </span>
                </div>

                <div className="flex justify-between text-stone-600">
                  <span>GST / Tax</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(Number(order.tax_amount))}
                  </span>
                </div>

                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Discount Applied</span>
                    <span>- {formatINR(Number(order.discount_amount))}</span>
                  </div>
                )}

                <div className="border-t border-stone-200 pt-3 flex justify-between items-baseline">
                  <span className="font-display text-sm font-bold text-stone-900">
                    Grand Total
                  </span>
                  <span className="font-display text-lg font-bold text-stone-900">
                    {formatINR(Number(order.total_amount))}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Record Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm text-xs">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <CreditCard className="h-4 w-4 text-stone-600" />
                <h2 className="font-display text-sm font-bold text-stone-900">
                  Payment Record
                </h2>
              </div>

              <div className="mt-4 space-y-2.5">
                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Payment Status
                  </span>
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${paymentStatus.classes}`}
                  >
                    {paymentStatus.label}
                  </span>
                </div>

                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Payment Provider
                  </span>
                  <span className="mt-0.5 block font-medium text-stone-800">
                    {order.payment_provider || "Standard Checkout"}
                  </span>
                </div>

                {order.payment_reference && (
                  <div>
                    <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                      Payment Reference
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-stone-600 truncate">
                      {order.payment_reference}
                    </span>
                  </div>
                )}

                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-[11px] text-stone-500 leading-relaxed">
                  Currency: {order.currency || "INR"}. Payment records are verified
                  securely and synchronized with our fulfillment desk.
                </div>
              </div>
            </div>

            {/* Brand Assurance Box */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm text-center">
              <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
                <Wheat className="h-5 w-5" />
              </div>
              <h3 className="mt-2 font-display text-xs font-bold text-stone-900">
                Calvin Flour Mill Warranty
              </h3>
              <p className="mt-1 text-[11px] text-stone-500 leading-relaxed">
                Every domestic flour mill is tested for stone alignment and
                temperature control before dispatch.
              </p>
            </div>
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}
