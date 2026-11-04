"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  Package,
  MapPin,
  CreditCard,
  FileText,
  Sparkles,
  Camera,
  ExternalLink,
  ShieldAlert,
  Layers,
  Type,
  Maximize2,
  RefreshCw,
  Sliders,
  Rotate3d,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle2,
  Lock,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase/client";
import { resolveCustomizationAssetUrl } from "@/lib/3d/storage-assets";
import { isDevelopmentTestOrder } from "@/lib/orders/test-order";
import type { CanvasLayer } from "@/types/3d-model";

const Interactive3DOrderViewerModal = dynamic(
  () =>
    import("@/components/admin/interactive-3d-order-viewer-modal").then(
      (m) => m.Interactive3DOrderViewerModal
    ),
  { ssr: false }
);

type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

type OrderLine = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  customisation_details: Record<string, unknown> | null;
};

type Order = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  email: string;
  phone: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  subtotal: number;
  shipping_amount: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  order_status: OrderStatus;
  payment_status: string;
  payment_provider: string | null;
  payment_reference: string | null;
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  is_test_order?: boolean | null;
  order_items: OrderLine[];
};

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

const statusLabels: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
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

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [statusError, setStatusError] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>("pending");
  const [active3DModalItem, setActive3DModalItem] = useState<OrderLine | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [derivedArtworkMap, setDerivedArtworkMap] = useState<Record<string, string>>({});
  const [isDerivingArtwork, setIsDerivingArtwork] = useState<Record<string, boolean>>({});
  const [savingArtifact, setSavingArtifact] = useState<Record<string, boolean>>({});
  const [saveArtifactStatus, setSaveArtifactStatus] = useState<
    Record<string, { type: "success" | "error"; message: string } | null>
  >({});
  const [activeLightboxArtwork, setActiveLightboxArtwork] = useState<{
    imageUrl: string;
    title: string;
    itemId: string;
    isDerived: boolean;
    surfaceDimensions: { width: number; height: number };
  } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeLightboxArtwork) {
          setActiveLightboxArtwork(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLightboxArtwork]);

  const toggleDetails = (itemId: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const deriveFlatArtworkForItem = useCallback(
    async (item: OrderLine) => {
      const custom = item.customisation_details ?? {};
      const snap = (
        custom._snapshot && typeof custom._snapshot === "object"
          ? custom._snapshot
          : typeof custom._snapshot === "string"
          ? (() => {
              try {
                return JSON.parse(custom._snapshot as string);
              } catch {
                return {};
              }
            })()
          : {}
      ) as Record<string, unknown>;

      const allLayers =
        (custom._layers as Array<Record<string, unknown>>) ||
        (snap.layers as Array<Record<string, unknown>>) ||
        [];

      const textLayers =
        (custom._text_layers as Array<Record<string, unknown>>) ||
        (snap.text_layers as Array<Record<string, unknown>>) ||
        [];

      const originalAssets =
        (custom._original_assets as Array<Record<string, unknown>>) ||
        (snap.original_assets as Array<Record<string, unknown>>) ||
        [];

      const rawList: Array<Record<string, unknown>> =
        allLayers.length > 0 ? [...allLayers] : [...textLayers];

      if (!rawList.some((l) => l.type === "photo") && originalAssets.length > 0) {
        const firstAsset = originalAssets[0];
        const assetPath =
          (firstAsset.storagePath as string) || (firstAsset.imageUrl as string);
        if (assetPath) {
          rawList.unshift({
            id: "photo_derived_01",
            type: "photo",
            name: (firstAsset.name as string) || "Customer Photograph",
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 1,
            x: 0.1,
            y: 0.35,
            width: 0.8,
            height: 0.45,
            rotationDeg: 0,
            storagePath: assetPath,
            imageUrl: resolveCustomizationAssetUrl(assetPath),
            crop: firstAsset.crop,
          });
        }
      }

      setIsDerivingArtwork((prev) => ({ ...prev, [item.id]: true }));

      try {
        const normalizedLayers: CanvasLayer[] = rawList.map((l, idx) => {
          const isPhoto =
            l.type === "photo" || Boolean(l.storagePath) || Boolean(l.imageUrl);

          if (isPhoto) {
            const pathOrUrl =
              (l.storagePath as string) || (l.imageUrl as string) || "";
            return {
              id: (l.id as string) || `layer_${idx}`,
              type: "photo" as const,
              name: (l.name as string) || `Photo Layer ${idx + 1}`,
              visible: l.visible !== false,
              locked: Boolean(l.locked),
              opacity: typeof l.opacity === "number" ? l.opacity : 1,
              zIndex: typeof l.zIndex === "number" ? l.zIndex : idx,
              x:
                typeof l.x === "number"
                  ? l.x > 1
                    ? l.x / 1024
                    : l.x
                  : 0.1,
              y:
                typeof l.y === "number"
                  ? l.y > 1
                    ? l.y / 1670
                    : l.y
                  : 0.35,
              width:
                typeof l.width === "number"
                  ? l.width > 1
                    ? l.width / 1024
                    : l.width
                  : 0.8,
              height:
                typeof l.height === "number"
                  ? l.height > 1
                    ? l.height / 1670
                    : l.height
                  : 0.45,
              rotationDeg:
                typeof l.rotationDeg === "number"
                  ? l.rotationDeg
                  : Number(l.rotation) || 0,
              imageUrl: resolveCustomizationAssetUrl(pathOrUrl),
              storagePath: pathOrUrl,
              sourceWidthPx: Number(l.sourceWidthPx) || 1024,
              sourceHeightPx: Number(l.sourceHeightPx) || 1024,
              crop:
                (l.crop as {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                }) || undefined,
            };
          }

          const txt = (l.text as string) || "";
          return {
            id: (l.id as string) || `layer_${idx}`,
            type: "text" as const,
            name: (l.name as string) || `Text Layer ${idx + 1}`,
            visible: l.visible !== false,
            locked: Boolean(l.locked),
            opacity: typeof l.opacity === "number" ? l.opacity : 1,
            zIndex: typeof l.zIndex === "number" ? l.zIndex : idx,
            x:
              typeof l.x === "number"
                ? l.x > 1
                  ? l.x / 1024
                  : l.x
                : 0.1,
            y:
              typeof l.y === "number"
                ? l.y > 1
                  ? l.y / 1670
                  : l.y
                : 0.18,
            width:
              typeof l.width === "number"
                ? l.width > 1
                  ? l.width / 1024
                  : l.width
                : 0.8,
            height:
              typeof l.height === "number"
                ? l.height > 1
                  ? l.height / 1670
                  : l.height
                : 0.1,
            rotationDeg:
              typeof l.rotationDeg === "number"
                ? l.rotationDeg
                : Number(l.rotation) || 0,
            text: txt,
            fontFamily: (l.fontFamily as string) || "Cinzel, serif",
            fontSizePt: Number(l.fontSizePt) || Number(l.fontSize) || 28,
            fillColorHex:
              (l.fillColorHex as string) ||
              (l.fill as string) ||
              (l.color as string) ||
              "#b45309",
            textAlign: (
              (l.textAlign as string) ||
              (l.align as string) ||
              "center"
            ).toLowerCase() as "left" | "center" | "right",
            fontWeight: (
              (l.fontWeight as string) || "bold"
            ).toLowerCase() as "normal" | "bold",
          };
        });

        const { renderCanonicalFlatArtworkDataUrl } = await import("@/lib/3d/canonical-artwork");
        const dataUrl = await renderCanonicalFlatArtworkDataUrl(
          normalizedLayers,
          {
            finish:
              (snap.finish as string) ||
              (custom.finish as string) ||
              "matte_black",
            includeBranding: true,
            watermark:
              "CALVIN AATAMAKER • PROTOTYPE SPECIFICATION (380 × 620 mm)",
          }
        );

        if (dataUrl) {
          setDerivedArtworkMap((prev) => ({ ...prev, [item.id]: dataUrl }));
        }
      } catch (err) {
        console.error("Error generating derived flat artwork:", err);
      } finally {
        setIsDerivingArtwork((prev) => ({ ...prev, [item.id]: false }));
      }
    },
    []
  );

  const handleSaveDerivedArtwork = async (itemId: string) => {
    const dataUrl = derivedArtworkMap[itemId];
    if (!dataUrl || !order) return;

    setSavingArtifact((prev) => ({ ...prev, [itemId]: true }));
    setSaveArtifactStatus((prev) => ({ ...prev, [itemId]: null }));

    try {
      const res = await fetch("/api/admin/orders/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          orderItemId: itemId,
          artifactType: "flat_artwork",
          dataUrl,
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setSaveArtifactStatus((prev) => ({
          ...prev,
          [itemId]: {
            type: "success",
            message: `Saved to storage: ${result.storagePath}`,
          },
        }));
      } else {
        setSaveArtifactStatus((prev) => ({
          ...prev,
          [itemId]: {
            type: "error",
            message: result.error || "Failed to save derived artifact.",
          },
        }));
      }
    } catch (err) {
      setSaveArtifactStatus((prev) => ({
        ...prev,
        [itemId]: {
          type: "error",
          message: err instanceof Error ? err.message : "Network error",
        },
      }));
    } finally {
      setSavingArtifact((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.replace("/admin");
        return;
      }

      const response = await fetch(`/api/admin/orders?id=${orderId}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Failed to load order.");
        return;
      }

      const loadedOrder = payload.order as Order;
      setOrder(loadedOrder);
      setSelectedStatus(loadedOrder.order_status);

      for (const it of loadedOrder.order_items || []) {
        const c = it.customisation_details;
        if (!c) continue;
        const fp = (c._flat_artwork_path as string) || (c._flat_artwork_storage_path as string) || "";
        if (!fp) {
          deriveFlatArtworkForItem(it);
        }
      }
    } catch (err) {
      console.error("Failed to load order:", err);
      setError("Network error while connecting to admin service.");
    } finally {
      setLoading(false);
    }
  }, [orderId, deriveFlatArtworkForItem]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const handleUpdateStatus = async () => {
    if (!order) return;
    setUpdatingStatus(true);
    setStatusNotice("");
    setStatusError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setStatusError("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          orderStatus: selectedStatus,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setStatusError(payload.error ?? "Could not update order status.");
        return;
      }

      setStatusNotice(`Order status successfully updated to ${statusLabels[selectedStatus]}.`);
      setOrder((prev) => (prev ? { ...prev, order_status: selectedStatus } : null));
    } catch (err) {
      console.error("Status update error:", err);
      setStatusError("Failed to update status due to network error.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-red-700" />
          <p className="mt-3 text-sm font-semibold text-stone-600">Loading order records...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
          <h2 className="mt-3 text-lg font-bold text-red-900">Order Access Error</h2>
          <p className="mt-1 text-sm text-red-700">{error || "Order not found."}</p>
          <div className="mt-5">
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Orders Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Determine order characteristics
  const customizedItems = order.order_items.filter(
    (item) => item.customisation_details && Object.keys(item.customisation_details).length > 0,
  );
  const standardItems = order.order_items.filter(
    (item) => !item.customisation_details || Object.keys(item.customisation_details).length === 0,
  );

  const isCustomized = customizedItems.length > 0;
  const isMixed = customizedItems.length > 0 && standardItems.length > 0;
  const orderType = isMixed ? "Mixed Order" : isCustomized ? "Bespoke Customized" : "Standard Machine";

  const hasPrototypeDemo = customizedItems.some((item) => {
    const d = item.customisation_details;
    return d && (d._mode === "demonstration" || d._prototype_warning === "UNVERIFIED_FACTORY_MEASUREMENTS");
  });

  const isTestOrder = isDevelopmentTestOrder(order);

  return (
    <div className="min-h-screen bg-stone-50 pb-20 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Navigation & Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/orders"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              title="Return to order list"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-red-700">
                  {orderType}
                </span>
                {isTestOrder && (
                  <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-red-800 border border-red-300">
                    TEST ORDER
                  </span>
                )}
                <span className="text-stone-300">•</span>
                <span className="text-xs text-stone-500">Placed {formatDate(order.created_at)}</span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900">
                Order {order.order_number}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                order.order_status === "delivered"
                  ? "bg-emerald-100 text-emerald-800"
                  : order.order_status === "shipped"
                    ? "bg-cyan-100 text-cyan-800"
                    : order.order_status === "processing"
                      ? "bg-indigo-100 text-indigo-800"
                      : order.order_status === "confirmed"
                        ? "bg-blue-100 text-blue-800"
                        : order.order_status === "cancelled"
                          ? "bg-stone-200 text-stone-700"
                          : "bg-amber-100 text-amber-800"
              }`}
            >
              Status: {statusLabels[order.order_status]}
            </span>

            <span className="rounded-full bg-stone-200/80 px-3 py-1 text-xs font-bold text-stone-700">
              Payment: {order.payment_status?.toUpperCase() ?? "PENDING"}
            </span>
          </div>
        </div>

        {/* Development Test Order Warning Banner */}
        {isTestOrder && (
          <div className="mb-6 rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-700" />
              <div>
                <h3 className="font-display text-base font-bold text-red-950">
                  ⚠️ DEVELOPMENT TEST ORDER — DO NOT FULFIL / SHIP
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-red-800">
                  This order was created exclusively during automated engineering verification in the shared development database.
                  It represents non-commercial test data and must <strong>never</strong> be fulfilled, manufactured, or dispatched to any recipient.
                </p>
                <p className="mt-2 text-xs font-semibold text-red-900">
                  <strong>Fulfillment Locked:</strong> The server-side API strictly blocks advancing this order to &ldquo;Confirmed&rdquo;, &ldquo;Processing&rdquo;, &ldquo;Shipped&rdquo;, or &ldquo;Delivered&rdquo;. It may only remain pending or be marked cancelled.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Prototype Safety Warning Banner */}
        {hasPrototypeDemo && (
          <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-700" />
              <div>
                <h3 className="font-display text-base font-bold text-amber-950">
                  ⚠️ Prototype Demonstration Order (CALVIN-COMPACT-01)
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  This order contains bespoke personalizations built on the prototype 3D machine model.
                  Printable surface dimensions are based on demonstration coordinates (380 × 620 mm) and have
                  not yet undergone factory caliper verification.
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-900">
                  <strong>Strict Safety Control:</strong> The system enforces a server-side lock preventing this
                  order from being advanced to &ldquo;Processing&rdquo;, &ldquo;Shipped&rdquo;, or &ldquo;Delivered&rdquo;
                  until factory verification is completed.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Column: Details, Products, Customizations (2 Cols) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Section C: Ordered Products */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-sm font-bold text-stone-900">
                      Ordered Products &amp; Items ({order.order_items.length})
                    </h2>
                    <p className="text-xs text-stone-500">Standard machines &amp; bespoke customizations</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 divide-y divide-stone-100">
                {order.order_items.map((item, idx) => {
                  const custom = item.customisation_details;
                  const hasCustom = custom && Object.keys(custom).length > 0;
                  const previewPath =
                    (custom?._preview_thumbnail_path as string) ||
                    (custom?._preview_storage_path as string) ||
                    (custom?._flat_artwork_path as string) ||
                    (custom?._flat_artwork_storage_path as string) ||
                    (custom?._preview_image as string) ||
                    "";

                  const inscriptionText =
                    (custom?._text_layers as Array<Record<string, unknown>>)?.[0]?.text ||
                    (custom?._layers as Array<Record<string, unknown>>)?.find((l) => l.type === "text" || l.text)?.text ||
                    (custom?.family_name_engraving as string) ||
                    "";

                  return (
                    <div key={item.id || idx} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {previewPath ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveCustomizationAssetUrl(previewPath)}
                              alt="Customized machine preview"
                              className="h-16 w-16 rounded-xl border border-amber-300 bg-stone-900 object-contain p-1"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-stone-200 bg-stone-100 text-stone-400">
                              <Package className="h-8 w-8" />
                            </div>
                          )}

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display text-sm font-bold text-stone-900">
                                {item.product_name}
                              </h3>
                              {hasCustom ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  <Sparkles className="h-2.5 w-2.5" /> Bespoke Customized
                                </span>
                              ) : (
                                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                                  Standard Production
                                </span>
                              )}
                            </div>

                            <p className="mt-0.5 text-xs text-stone-500">
                              SKU: {item.sku || "N/A"}{" "}
                              {item.variant_name && `• Option: ${item.variant_name}`}
                            </p>

                            {Boolean(inscriptionText) && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                                  <Type className="h-3 w-3 text-amber-700" />
                                  Inscription: &ldquo;{String(inscriptionText)}&rdquo;
                                </span>
                              </div>
                            )}

                            <p className="mt-1 text-xs text-stone-700">
                              Quantity: <span className="font-bold">{item.quantity}</span> ×{" "}
                              {formatINR(Number(item.unit_price))}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-display text-sm font-bold text-stone-900">
                            {formatINR(Number(item.line_total))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section D: Customized Design Inspection */}
            {isCustomized && (
              <div className="space-y-6">
                <div className="rounded-2xl border-2 border-amber-300 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2.5 border-b border-amber-100 pb-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-sm font-bold text-stone-900">
                        Section D — Bespoke Design Inspection &amp; Factory Specifications
                      </h2>
                      <p className="text-xs text-stone-500">
                        Immutable customer configuration snapshot for review &amp; factory preparation
                      </p>
                    </div>
                  </div>

                  {customizedItems.map((item, itemIdx) => {
                    const custom = item.customisation_details ?? {};
                    const snap = (custom._snapshot && typeof custom._snapshot === "object"
                      ? custom._snapshot
                      : typeof custom._snapshot === "string"
                      ? (() => {
                          try {
                            return JSON.parse(custom._snapshot as string);
                          } catch {
                            return {};
                          }
                        })()
                      : {}) as Record<string, unknown>;

                    const previewPath =
                      (custom._preview_thumbnail_path as string) ||
                      (custom._preview_storage_path as string) ||
                      (snap.preview_storage_path as string) ||
                      (custom._preview_image as string) ||
                      "";

                    const flatPath =
                      (custom._flat_artwork_path as string) ||
                      (custom._flat_artwork_storage_path as string) ||
                      (snap.flat_artwork_storage_path as string) ||
                      (custom._flat_artwork_url as string) ||
                      (snap.flat_artwork_url as string) ||
                      "";

                    const originalAssets =
                      (custom._original_assets as Array<Record<string, unknown>>) ||
                      (snap.original_assets as Array<Record<string, unknown>>) ||
                      [];

                    const textLayers =
                      (custom._text_layers as Array<Record<string, unknown>>) ||
                      (snap.text_layers as Array<Record<string, unknown>>) ||
                      [];

                    const allLayers =
                      (custom._layers as Array<Record<string, unknown>>) ||
                      (snap.layers as Array<Record<string, unknown>>) ||
                      [];

                    const dims: { width: number; height: number } = {
                      width: Number(
                        (custom._surface_dimensions_mm as Record<string, number>)?.width ??
                        (snap.surface_dimensions_mm as Record<string, number>)?.width ??
                        380
                      ),
                      height: Number(
                        (custom._surface_dimensions_mm as Record<string, number>)?.height ??
                        (snap.surface_dimensions_mm as Record<string, number>)?.height ??
                        620
                      ),
                    };
                    const modelCode =
                      (custom._model_code as string) ||
                      (snap.model_code as string) ||
                      "CALVIN-COMPACT-01";
                    const surfaceKey =
                      (custom._surface_key as string) ||
                      (snap.surface_key as string) ||
                      "front-door-panel";

                    // Extract all text elements across textLayers, allLayers, and options
                    const distinctTextItems: Array<{
                      text: string;
                      fontFamily: string;
                      fontSize: number | string;
                      fontWeight: string;
                      color: string;
                      align: string;
                      x?: string;
                      y?: string;
                    }> = [];

                    for (const tl of textLayers) {
                      const txt = (tl.text as string) || "";
                      if (txt.trim()) {
                        distinctTextItems.push({
                          text: txt,
                          fontFamily: (tl.fontFamily as string) || "Cinzel, serif",
                          fontSize: tl.fontSize ? `${tl.fontSize} pt` : "28 pt",
                          fontWeight: (tl.fontWeight as string) || "Bold",
                          color: (tl.color as string) || (tl.fill as string) || "#b45309",
                          align: (tl.align as string) || (tl.textAlign as string) || "Center",
                          x: tl.x !== undefined ? `${Math.round(Number(tl.x) * 100)}%` : undefined,
                          y: tl.y !== undefined ? `${Math.round(Number(tl.y) * 100)}%` : undefined,
                        });
                      }
                    }

                    for (const al of allLayers) {
                      if (al.type === "text") {
                        const txt = (al.text as string) || "";
                        if (txt.trim() && !distinctTextItems.some((d) => d.text === txt)) {
                          distinctTextItems.push({
                            text: txt,
                            fontFamily: (al.fontFamily as string) || "Cinzel, serif",
                            fontSize: al.fontSize ? `${al.fontSize} pt` : "28 pt",
                            fontWeight: (al.fontWeight as string) || "Bold",
                            color: (al.color as string) || (al.fill as string) || (al.fillColorHex as string) || "#b45309",
                            align: (al.textAlign as string) || (al.align as string) || "Center",
                            x: al.x !== undefined ? `${Math.round(Number(al.x) * 100)}%` : undefined,
                            y: al.y !== undefined ? `${Math.round(Number(al.y) * 100)}%` : undefined,
                          });
                        }
                      }
                    }

                    const engravingOption = (custom.family_name_engraving as string) || ((snap.options as Record<string, unknown>)?.family_name_engraving as string);
                    if (engravingOption && !distinctTextItems.some((d) => d.text === engravingOption)) {
                      distinctTextItems.push({
                        text: engravingOption,
                        fontFamily: "Noto Serif Devanagari / Cinzel",
                        fontSize: "Standard Laser Engraving",
                        fontWeight: "Bold",
                        color: "#b45309",
                        align: "Center",
                      });
                    }

                    return (
                      <div key={item.id || itemIdx} className="mt-6 space-y-6 border-t border-stone-200 pt-6 first:border-0 first:pt-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-base font-bold text-stone-900">
                            Customization for &ldquo;{item.product_name}&rdquo;
                          </h3>
                          <span className="font-mono text-xs text-stone-500">Item #{itemIdx + 1}</span>
                        </div>

                        {/* D.1 & D.4: Visual Previews (3D Machine Preview & Flat Canvas) */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {/* D.1: Final 3D Machine Render */}
                          <div className="rounded-xl border border-stone-200 bg-stone-900 p-4 text-center">
                            <div className="flex items-center justify-between">
                              <span className="inline-block rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-stone-950 uppercase tracking-wider">
                                Final 3D Machine Preview
                              </span>
                              {previewPath && (
                                <a
                                  href={resolveCustomizationAssetUrl(previewPath)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                                >
                                  <Maximize2 className="h-3 w-3" /> Full Size
                                </a>
                              )}
                            </div>
                            <div className="relative mt-3 flex min-h-[220px] items-center justify-center">
                              {previewPath ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={resolveCustomizationAssetUrl(previewPath)}
                                  alt="3D Customized Machine"
                                  className="max-h-56 max-w-full rounded-lg object-contain shadow-lg"
                                />
                              ) : (
                                <p className="text-xs text-stone-400">No 3D snapshot recorded.</p>
                              )}
                              <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-amber-400">
                                PROTOTYPE DEMO
                              </div>
                            </div>
                            <p className="mt-2 text-[11px] text-stone-400">
                              Front perspective rendered on {modelCode}
                            </p>

                            {/* Button to open interactive 3D model */}
                            <button
                              type="button"
                              onClick={() => setActive3DModalItem(item)}
                              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400 shadow-sm transition"
                            >
                              <Rotate3d className="h-4 w-4" />
                              <span>View Full 3D Preview (Interactive)</span>
                            </button>
                          </div>

                          {/* D.4: Canonical Flat Artwork */}
                          {(() => {
                            const currentArtworkUrl = flatPath
                              ? resolveCustomizationAssetUrl(flatPath)
                              : derivedArtworkMap[item.id] || "";
                            const isArtworkDerived = !flatPath;

                            return (
                              <div className="rounded-xl border border-stone-200 bg-stone-100 p-4 text-center">
                                <div className="flex items-center justify-between">
                                  <span className="inline-block rounded bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                                    Canonical Flat Artwork
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {currentArtworkUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveLightboxArtwork({
                                            imageUrl: currentArtworkUrl,
                                            title: item.product_name,
                                            itemId: item.id,
                                            isDerived: isArtworkDerived,
                                            surfaceDimensions: dims,
                                          });
                                          setLightboxZoom(1);
                                        }}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-800 hover:text-stone-950 bg-white border border-stone-300 rounded px-2 py-0.5 shadow-xs transition"
                                      >
                                        <Maximize2 className="h-3 w-3 text-stone-600" /> Inspect High-Res
                                      </button>
                                    )}
                                    {flatPath ? (
                                      <a
                                        href={resolveCustomizationAssetUrl(flatPath)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:text-red-800"
                                      >
                                        <ExternalLink className="h-3 w-3" /> Raw
                                      </a>
                                    ) : derivedArtworkMap[item.id] ? (
                                      <a
                                        href={derivedArtworkMap[item.id]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={`artwork_${order.order_number}_item_${item.id.slice(0, 8)}.png`}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-900"
                                      >
                                        <Download className="h-3 w-3" /> PNG
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="relative mt-3 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white p-2">
                                  {flatPath ? (
                                    <div
                                      onClick={() => {
                                        setActiveLightboxArtwork({
                                          imageUrl: resolveCustomizationAssetUrl(flatPath),
                                          title: item.product_name,
                                          itemId: item.id,
                                          isDerived: false,
                                          surfaceDimensions: dims,
                                        });
                                        setLightboxZoom(1);
                                      }}
                                      className="group relative cursor-pointer w-full flex items-center justify-center"
                                      title="Click to view full-resolution lightbox"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={resolveCustomizationAssetUrl(flatPath)}
                                        alt="Flat canvas artwork"
                                        className="max-h-52 max-w-full object-contain transition-transform group-hover:scale-[1.02]"
                                      />
                                      <div className="absolute inset-0 bg-stone-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                                        <span className="text-white text-xs font-bold flex items-center gap-1.5 bg-stone-900/90 px-3 py-1.5 rounded-md shadow-md backdrop-blur-xs">
                                          <Maximize2 className="h-3.5 w-3.5" /> Enlarge Lightbox
                                        </span>
                                      </div>
                                    </div>
                                  ) : derivedArtworkMap[item.id] ? (
                                    <div
                                      onClick={() => {
                                        setActiveLightboxArtwork({
                                          imageUrl: derivedArtworkMap[item.id],
                                          title: item.product_name,
                                          itemId: item.id,
                                          isDerived: true,
                                          surfaceDimensions: dims,
                                        });
                                        setLightboxZoom(1);
                                      }}
                                      className="group relative cursor-pointer w-full space-y-2"
                                      title="Click to view full-resolution lightbox"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={derivedArtworkMap[item.id]}
                                        alt="Derived flat canvas artwork"
                                        className="max-h-48 max-w-full object-contain mx-auto transition-transform group-hover:scale-[1.02]"
                                      />
                                      <div className="flex items-center justify-center gap-2">
                                        <span className="inline-block rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[9px] font-bold text-amber-900">
                                          Derived On-Demand (Non-Mutating)
                                        </span>
                                      </div>
                                      <div className="absolute inset-0 bg-stone-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                                        <span className="text-white text-xs font-bold flex items-center gap-1.5 bg-stone-900/90 px-3 py-1.5 rounded-md shadow-md backdrop-blur-xs">
                                          <Maximize2 className="h-3.5 w-3.5" /> Enlarge Lightbox
                                        </span>
                                      </div>
                                    </div>
                                  ) : isDerivingArtwork[item.id] ? (
                                    <div className="flex flex-col items-center justify-center gap-2 py-8">
                                      <RefreshCw className="h-5 w-5 animate-spin text-amber-700" />
                                      <p className="text-xs font-semibold text-stone-600">Rendering on-demand artwork...</p>
                                    </div>
                                  ) : (
                                    <div className="p-4 text-center">
                                      <p className="text-xs text-stone-500">Historical order — flat artwork was not captured when this order was placed.</p>
                                      <button
                                        type="button"
                                        onClick={() => deriveFlatArtworkForItem(item)}
                                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-stone-800"
                                      >
                                        <RefreshCw className="h-3 w-3" /> Generate On-Demand Preview
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Click to Open Artwork Lightbox Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (currentArtworkUrl) {
                                      setActiveLightboxArtwork({
                                        imageUrl: currentArtworkUrl,
                                        title: item.product_name,
                                        itemId: item.id,
                                        isDerived: isArtworkDerived,
                                        surfaceDimensions: dims,
                                      });
                                      setLightboxZoom(1);
                                    }
                                  }}
                                  disabled={!currentArtworkUrl}
                                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-800 shadow-xs transition disabled:opacity-40"
                                >
                                  <Maximize2 className="h-4 w-4 text-amber-400" />
                                  <span>Open Artwork Lightbox (Zoom &amp; Fit)</span>
                                </button>

                                {!flatPath && (
                                  <div className="mt-2 text-left bg-amber-50/70 border border-amber-200/60 rounded-lg p-2.5">
                                    <p className="text-[10px] text-amber-900 font-medium leading-relaxed">
                                      <strong>Notice:</strong> Historical order — flat artwork was not captured when this order was placed. Rendered on-demand from the immutable order snapshot layers.
                                    </p>
                                    {derivedArtworkMap[item.id] && (
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={savingArtifact[item.id]}
                                          onClick={() => handleSaveDerivedArtwork(item.id)}
                                          className="inline-flex items-center gap-1.5 rounded bg-amber-700 hover:bg-amber-800 text-white px-2 py-1 text-[10px] font-bold disabled:opacity-50 transition"
                                        >
                                          {savingArtifact[item.id] ? (
                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <CheckCircle2 className="h-3 w-3" />
                                          )}
                                          Save Derived Flat Artwork to Storage
                                        </button>
                                        {saveArtifactStatus[item.id] && (
                                          <span
                                            className={`text-[10px] font-medium ${
                                              saveArtifactStatus[item.id]?.type === "success"
                                                ? "text-emerald-700 font-bold"
                                                : "text-red-700"
                                            }`}
                                          >
                                            {saveArtifactStatus[item.id]?.message}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <p className="mt-2 text-[11px] text-stone-500">
                                  Printable area: {dims.width} × {dims.height} mm (Bleed: 15 mm)
                                </p>
                              </div>
                            );
                          })()}
                        </div>

                        {/* D.2: Original Customer Uploaded Photographs */}
                        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-800">
                              <Camera className="h-4 w-4 text-amber-700" />
                              Original Uploaded Customer Photographs ({originalAssets.length})
                            </h4>
                            <span className="text-[11px] text-stone-500">Fresh signed asset URLs</span>
                          </div>

                          {originalAssets.length === 0 ? (
                            <p className="mt-2 text-xs text-stone-500 italic">No customer photos uploaded for this design.</p>
                          ) : (
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {originalAssets.map((asset, aIdx) => {
                                const storagePath = (asset.storagePath as string) || (asset.imageUrl as string) || "";
                                const assetUrl = resolveCustomizationAssetUrl(storagePath);
                                const fileName = (asset.name as string) || `Uploaded Asset ${aIdx + 1}`;
                                const fileSize = asset.size ? `${Math.round(Number(asset.size) / 1024)} KB` : "N/A";
                                const mime = (asset.mimeType as string) || "image/*";

                                return (
                                  <div key={aIdx} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2.5 shadow-sm">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={assetUrl}
                                      alt={fileName}
                                      className="h-14 w-14 rounded border border-stone-200 object-cover"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-bold text-stone-900">{fileName}</p>
                                      <p className="text-[11px] text-stone-500">{mime} • {fileSize}</p>
                                      <a
                                        href={assetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:text-red-800"
                                      >
                                        <ExternalLink className="h-3 w-3" /> Open Full Resolution
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* D.3: Custom Inscription & Typography Breakdown */}
                        <div className="rounded-xl border border-stone-200 bg-amber-50/40 p-4">
                          <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-950">
                              <Type className="h-4 w-4 text-amber-700" />
                              Custom Text Inscription &amp; Door Engraving ({distinctTextItems.length})
                            </h4>
                            <span className="text-[11px] font-medium text-amber-800">
                              Production Typography Specification
                            </span>
                          </div>

                          {distinctTextItems.length === 0 ? (
                            <p className="mt-3 text-xs text-stone-500 italic">No custom text inscriptions configured for this machine.</p>
                          ) : (
                            <div className="mt-3 space-y-3">
                              {distinctTextItems.map((ti, tIdx) => (
                                <div key={tIdx} className="rounded-lg border border-amber-200 bg-white p-4 shadow-xs">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                                    <div className="space-y-0.5">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                        Customer Inscription Text #{tIdx + 1}
                                      </span>
                                      <div
                                        className="text-2xl font-bold tracking-tight text-stone-900"
                                        style={{
                                          fontFamily: ti.fontFamily,
                                          color: ti.color || "#1C1917",
                                        }}
                                      >
                                        &ldquo;{ti.text}&rdquo;
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-1.5 border border-stone-200">
                                      <span
                                        className="h-4 w-4 rounded-full border border-stone-300 shadow-xs"
                                        style={{ backgroundColor: ti.color }}
                                      />
                                      <span className="font-mono text-xs font-semibold text-stone-800">{ti.color}</span>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Font Family</span>
                                      <p className="font-medium text-stone-900 truncate" title={ti.fontFamily}>{ti.fontFamily}</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Font Size / Weight</span>
                                      <p className="font-medium text-stone-900">{ti.fontSize} • {ti.fontWeight}</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Alignment</span>
                                      <p className="font-medium text-stone-900 capitalize">{ti.align}</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Position on Panel</span>
                                      <p className="font-mono font-medium text-stone-900">
                                        {ti.x && ti.y ? `X: ${ti.x}, Y: ${ti.y}` : "Door Upper Center"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* D.3: Text & Layer Breakdown */}
                        <div className="rounded-xl border border-stone-200 bg-white p-4">
                          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-800">
                            <Layers className="h-4 w-4 text-stone-600" />
                            Layer Architecture &amp; Typography Breakdown
                          </h4>

                          {allLayers.length === 0 && textLayers.length === 0 ? (
                            <p className="mt-2 text-xs text-stone-500 italic">No structured layers found.</p>
                          ) : (
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold text-stone-600">
                                  <tr>
                                    <th className="px-3 py-2">Layer</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Content / Details</th>
                                    <th className="px-3 py-2">Typography / Styling</th>
                                    <th className="px-3 py-2">Position &amp; Scale</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100">
                                  {(allLayers.length > 0 ? allLayers : textLayers).map((layer, lIdx) => {
                                    const type = (layer.type as string) || "text";
                                    const text = (layer.text as string) || "";
                                    const font = (layer.fontFamily as string) || "Default";
                                    const size = layer.fontSize ? `${layer.fontSize}px` : "N/A";
                                    const color = (layer.fill as string) || (layer.color as string) || "#000000";
                                    const x = layer.x !== undefined ? Math.round(Number(layer.x)) : "N/A";
                                    const y = layer.y !== undefined ? Math.round(Number(layer.y)) : "N/A";
                                    const rotation = layer.rotation !== undefined ? `${Math.round(Number(layer.rotation))}°` : "0°";

                                    return (
                                      <tr key={lIdx} className="hover:bg-stone-50/50">
                                        <td className="px-3 py-2 font-mono font-medium text-stone-500">#{lIdx + 1}</td>
                                        <td className="px-3 py-2">
                                          <span className="inline-flex items-center gap-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-700">
                                            {type === "text" ? <Type className="h-2.5 w-2.5" /> : <Layers className="h-2.5 w-2.5" />}
                                            {type}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 font-medium text-stone-900">
                                          {text ? (
                                            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px]">
                                              &ldquo;{text}&rdquo;
                                            </span>
                                          ) : (
                                            <span className="text-stone-400">Image Asset Layer</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-stone-600">
                                          {type === "text" ? (
                                            <div className="flex items-center gap-2">
                                              <span>{font} ({size})</span>
                                              <span
                                                className="inline-block h-3 w-3 rounded-full border border-stone-300"
                                                style={{ backgroundColor: color }}
                                                title={color}
                                              />
                                            </div>
                                          ) : (
                                            <span className="text-stone-400">—</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[11px] text-stone-500">
                                          X:{x} Y:{y} Rot:{rotation}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* D.5: Machine Options & Specification List */}
                        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-800">
                            <Sliders className="h-4 w-4 text-stone-600" />
                            Machine Options &amp; Surface Specifications
                          </h4>
                          <div className="mt-3 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-500">Model Code</span>
                              <p className="font-mono font-bold text-stone-900">{modelCode}</p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-500">Surface Key</span>
                              <p className="font-mono font-bold text-stone-900">{surfaceKey}</p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-500">Dimensions</span>
                              <p className="font-bold text-stone-900">{dims.width} × {dims.height} mm</p>
                              <span className="text-[9px] text-amber-700">(Visual Prototype)</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-500">Surcharge</span>
                              <p className="font-bold text-emerald-700">
                                {formatINR(Number(item.unit_price) - Number(item.line_total / item.quantity))}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Task 3: Expandable Complete Design Details Panel */}
                        <div className="rounded-xl border border-stone-200 bg-white shadow-xs overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleDetails(item.id)}
                            className="flex w-full items-center justify-between p-4 bg-stone-50 hover:bg-stone-100/80 transition text-left"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
                                <Layers className="h-4 w-4" />
                              </div>
                              <div>
                                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-stone-900">
                                  View Complete Design Details ({1 + distinctTextItems.length + (originalAssets.length || 1)} Total Layers)
                                </h4>
                                <p className="text-[11px] text-stone-500">
                                  Protected brand logo, custom typography, and high-resolution uploaded photographs
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                              <span>{expandedDetails[item.id] ? "Collapse Details" : "Expand All Layers"}</span>
                              {expandedDetails[item.id] ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </button>

                          {expandedDetails[item.id] && (
                            <div className="p-4 space-y-6 border-t border-stone-200 bg-white">
                              {/* 1. Protected CALVIN Brand Logo */}
                              <div className="rounded-xl border border-amber-300 bg-amber-50/30 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                                  <div className="flex items-center gap-2">
                                    <Lock className="h-4 w-4 text-amber-700" />
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                                      Layer #1 — Protected Official Brand Emblem (CALVIN)
                                    </h5>
                                  </div>
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                                    <ShieldAlert className="h-3 w-3" /> Mandatory Factory Trademark
                                  </span>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                  <div className="flex items-center justify-center rounded-lg border border-amber-200 bg-stone-900 p-3">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src="/images/calvin-aatamaker-logo.png"
                                      alt="CALVIN official logo emblem"
                                      className="max-h-12 max-w-full object-contain filter invert brightness-125"
                                    />
                                  </div>
                                  <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Anchor Position</span>
                                      <p className="font-semibold text-stone-900">Fixed Top-Center</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Dimensions</span>
                                      <p className="font-semibold text-stone-900">120 mm × 30 mm</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Status</span>
                                      <p className="font-bold text-amber-900">Locked / Non-Deletable</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Door Position</span>
                                      <p className="font-mono text-[11px] text-stone-700">X: Center (50%), Y: Top 5%</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Asset Path</span>
                                      <p className="font-mono text-[11px] text-stone-700">/images/calvin-aatamaker-logo.png</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-stone-400">Factory Constraint</span>
                                      <p className="text-[11px] text-amber-800">Must not be obscured</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 2. All Text Layers */}
                              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                                  <div className="flex items-center gap-2">
                                    <Type className="h-4 w-4 text-amber-700" />
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                                      Custom Typography &amp; Inscription Layers ({distinctTextItems.length})
                                    </h5>
                                  </div>
                                  <span className="text-[11px] text-stone-500">Vector &amp; Engraving Precision</span>
                                </div>

                                {distinctTextItems.length === 0 ? (
                                  <p className="mt-3 text-xs text-stone-500 italic">No custom text inscriptions on this machine.</p>
                                ) : (
                                  <div className="mt-3 space-y-3">
                                    {distinctTextItems.map((ti, tIdx) => (
                                      <div key={tIdx} className="rounded-lg border border-stone-200 bg-white p-3.5 shadow-xs">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                                          <span className="text-[11px] font-bold text-stone-900">
                                            Text Layer #{tIdx + 1}: &ldquo;{ti.text}&rdquo;
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span
                                              className="inline-block h-3.5 w-3.5 rounded-full border border-stone-300"
                                              style={{ backgroundColor: ti.color }}
                                            />
                                            <span className="font-mono text-xs font-bold text-stone-800">{ti.color}</span>
                                          </div>
                                        </div>
                                        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                          <div>
                                            <span className="text-[10px] uppercase font-bold text-stone-400">Font Family</span>
                                            <p className="font-semibold text-stone-900 truncate">{ti.fontFamily}</p>
                                          </div>
                                          <div>
                                            <span className="text-[10px] uppercase font-bold text-stone-400">Font Size &amp; Weight</span>
                                            <p className="font-semibold text-stone-900">{ti.fontSize} • {ti.fontWeight}</p>
                                          </div>
                                          <div>
                                            <span className="text-[10px] uppercase font-bold text-stone-400">Alignment</span>
                                            <p className="font-semibold text-stone-900 capitalize">{ti.align}</p>
                                          </div>
                                          <div>
                                            <span className="text-[10px] uppercase font-bold text-stone-400">Normalized Coordinates</span>
                                            <p className="font-mono text-stone-700">{ti.x && ti.y ? `X: ${ti.x}, Y: ${ti.y}` : "Center"}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 3. All Photo Layers */}
                              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                                  <div className="flex items-center gap-2">
                                    <Camera className="h-4 w-4 text-amber-700" />
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                                      Customer Photographic Layers ({originalAssets.length})
                                    </h5>
                                  </div>
                                  <span className="text-[11px] text-stone-500">Full Resolution Originals</span>
                                </div>

                                {originalAssets.length === 0 ? (
                                  <p className="mt-3 text-xs text-stone-500 italic">No photographic assets uploaded for this machine.</p>
                                ) : (
                                  <div className="mt-3 space-y-3">
                                    {originalAssets.map((asset, aIdx) => {
                                      const storagePath = (asset.storagePath as string) || (asset.imageUrl as string) || "";
                                      const assetUrl = resolveCustomizationAssetUrl(storagePath);
                                      const fileName = (asset.name as string) || `Customer Upload ${aIdx + 1}`;
                                      const fileSize = asset.size ? `${Math.round(Number(asset.size) / 1024)} KB` : "N/A";
                                      const mime = (asset.mimeType as string) || "image/*";
                                      const crop = asset.crop as Record<string, number> | undefined;

                                      return (
                                        <div key={aIdx} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-xs">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={assetUrl}
                                            alt={fileName}
                                            className="h-16 w-16 rounded border border-stone-200 object-cover shrink-0"
                                          />
                                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                            <div>
                                              <span className="text-[10px] uppercase font-bold text-stone-400">File Details</span>
                                              <p className="font-bold text-stone-900 truncate">{fileName}</p>
                                              <p className="text-[11px] text-stone-500">{mime} • {fileSize}</p>
                                            </div>
                                            <div>
                                              <span className="text-[10px] uppercase font-bold text-stone-400">Crop / Scaling</span>
                                              <p className="font-mono text-[11px] text-stone-700">
                                                {crop ? `Crop: ${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%` : "Full Fit (Uncropped)"}
                                              </p>
                                              <p className="text-[11px] text-stone-500">Rotation: 0° • Scale: 100%</p>
                                            </div>
                                            <div className="flex items-center sm:justify-end">
                                              <a
                                                href={assetUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1.5 text-xs font-semibold transition"
                                              >
                                                <ExternalLink className="h-3.5 w-3.5" /> Open Full Resolution
                                              </a>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section B: Customer Information & Delivery Address */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-bold text-stone-900">
                    Section B — Customer Information &amp; Delivery Destination
                  </h2>
                  <p className="text-xs text-stone-500">Shipping, billing contact and dispatch notes</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 text-xs text-stone-700">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Customer Details
                  </span>
                  <p className="mt-1 font-bold text-stone-900 text-sm">{order.customer_name}</p>
                  <p className="mt-0.5 text-stone-600">Email: {order.email}</p>
                  <p className="text-stone-600">Phone: {order.phone}</p>
                  <p className="mt-2 text-[11px] text-stone-400">
                    Account: {order.customer_id ? `Registered (${order.customer_id.slice(0, 8)}...)` : "Guest Checkout"}
                  </p>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Shipping Address
                  </span>
                  <div className="mt-1 space-y-0.5 text-stone-800">
                    <p>{order.shipping_address_line1}</p>
                    {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                    <p>
                      {order.city}, {order.state} - <span className="font-bold">{order.postal_code}</span>
                    </p>
                    <p className="font-medium text-stone-900">{order.country}</p>
                  </div>
                </div>
              </div>

              {order.customer_notes && (
                <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                    <FileText className="h-4 w-4 text-stone-500" />
                    <span>Customer &amp; System Dispatch Notes</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-stone-800 leading-relaxed">
                    {order.customer_notes}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Section A (Order Financial Summary & Status Controls) */}
          <div className="space-y-6">
            {/* Status Management & Manufacturing Safety Controls */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="font-display text-sm font-bold text-stone-900 border-b border-stone-100 pb-3">
                Order Status Controls
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="order-status-select" className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                    Update Order Lifecycle Status
                  </label>
                  <select
                    id="order-status-select"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
                    className="mt-1.5 block w-full rounded-xl border border-stone-300 bg-stone-50 p-2.5 text-sm font-semibold text-stone-900 focus:border-red-700 focus:bg-white focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((status) => {
                      const isLockedForTest =
                        isTestOrder &&
                        (status === "confirmed" ||
                          status === "processing" ||
                          status === "shipped" ||
                          status === "delivered");
                      const isLockedForProto =
                        hasPrototypeDemo &&
                        (status === "processing" ||
                          status === "shipped" ||
                          status === "delivered");
                      const isDisabled = isLockedForTest || isLockedForProto;

                      return (
                        <option key={status} value={status} disabled={isDisabled}>
                          {statusLabels[status]}{" "}
                          {isLockedForTest
                            ? "(Locked - Test Order)"
                            : isLockedForProto
                            ? "(Locked - Prototype)"
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {isTestOrder && (
                  <p className="rounded-lg bg-red-50 p-2 text-[11px] text-red-800 leading-normal border border-red-200">
                    <strong>Test Order Fulfillment Lock:</strong> Development test orders cannot be confirmed, processed, shipped, or delivered.
                  </p>
                )}

                {hasPrototypeDemo && !isTestOrder && (
                  <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 leading-normal border border-amber-200">
                    <strong>Manufacturing Safety Lock:</strong> &ldquo;Processing&rdquo;, &ldquo;Shipped&rdquo;, and
                    &ldquo;Delivered&rdquo; are locked for prototype orders.
                  </p>
                )}

                {statusError && (
                  <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                    <p className="font-bold">Update Failed</p>
                    <p className="mt-0.5">{statusError}</p>
                  </div>
                )}

                {statusNotice && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
                    {statusNotice}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleUpdateStatus}
                  disabled={updatingStatus || selectedStatus === order.order_status}
                  className="w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-stone-800 disabled:opacity-50"
                >
                  {updatingStatus ? "Saving Changes..." : "Apply Status Update"}
                </button>
              </div>
            </div>

            {/* Section A: Financial Breakdown */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="font-display text-sm font-bold text-stone-900 border-b border-stone-100 pb-3">
                Section A — Financial Summary
              </h2>

              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-stone-900">{formatINR(Number(order.subtotal))}</span>
                </div>

                <div className="flex justify-between text-stone-600">
                  <span>Shipping &amp; Handling</span>
                  <span className="font-medium text-stone-900">
                    {Number(order.shipping_amount) === 0 ? "Free Shipping" : formatINR(Number(order.shipping_amount))}
                  </span>
                </div>

                <div className="flex justify-between text-stone-600">
                  <span>GST / Tax</span>
                  <span className="font-medium text-stone-900">{formatINR(Number(order.tax_amount))}</span>
                </div>

                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="font-semibold">-{formatINR(Number(order.discount_amount))}</span>
                  </div>
                )}

                <div className="border-t border-stone-200 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-stone-900">Total Billed</span>
                    <span className="font-display font-bold text-red-700">{formatINR(Number(order.total_amount))}</span>
                  </div>
                  <span className="block text-[10px] text-stone-400 mt-0.5">INR (₹) All inclusive</span>
                </div>
              </div>
            </div>

            {/* Payment Record Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <CreditCard className="h-4 w-4 text-stone-500" />
                <h2 className="font-display text-sm font-bold text-stone-900">Payment Status</h2>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Status</span>
                  <p className="font-bold uppercase text-amber-700">
                    {order.payment_status || "Pending"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Development mode: Awaiting production payment gateway integration.
                  </p>
                </div>

                {order.payment_reference && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Reference</span>
                    <p className="font-mono text-stone-800">{order.payment_reference}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive 3D Order Viewer Modal */}
      {active3DModalItem && (
        <Interactive3DOrderViewerModal
          isOpen={true}
          onClose={() => setActive3DModalItem(null)}
          orderNumber={order?.order_number || ""}
          productName={active3DModalItem.product_name}
          modelCode={
            (active3DModalItem.customisation_details?._model_code as string) ||
            "CALVIN-COMPACT-01"
          }
          surfaceDimensionsMm={
            (active3DModalItem.customisation_details?._surface_dimensions_mm as {
              width: number;
              height: number;
            }) || { width: 380, height: 620 }
          }
          artworkUrl={
            derivedArtworkMap[active3DModalItem.id] ||
            (active3DModalItem.customisation_details?._flat_artwork_path
              ? resolveCustomizationAssetUrl(
                  active3DModalItem.customisation_details._flat_artwork_path as string
                )
              : "")
          }
          layers={(() => {
            const custom = active3DModalItem.customisation_details ?? {};
            const snap = (
              custom._snapshot && typeof custom._snapshot === "object"
                ? custom._snapshot
                : typeof custom._snapshot === "string"
                ? (() => {
                    try {
                      return JSON.parse(custom._snapshot as string);
                    } catch {
                      return {};
                    }
                  })()
                : {}
            ) as Record<string, unknown>;

            const raw =
              Array.isArray(custom._layers) && custom._layers.length > 0
                ? (custom._layers as Array<Record<string, unknown>>)
                : Array.isArray(snap.layers) && snap.layers.length > 0
                ? (snap.layers as Array<Record<string, unknown>>)
                : [];

            if (raw.length > 0) {
              return raw.map((l) => {
                const storagePath = (l.storagePath as string) || (l.assetPath as string) || "";
                return {
                  ...l,
                  imageUrl: storagePath
                    ? resolveCustomizationAssetUrl(storagePath)
                    : resolveCustomizationAssetUrl(l.imageUrl as string),
                };
              });
            }

            const combined: Array<Record<string, unknown>> = [];
            const assets =
              (custom._original_assets as Array<Record<string, unknown>>) ||
              (snap.original_assets as Array<Record<string, unknown>>) ||
              [];

            for (const asset of assets) {
              const storagePath =
                (asset.storagePath as string) || (asset.imageUrl as string);
              if (storagePath) {
                combined.push({
                  id: "photo_0",
                  type: "photo",
                  name: asset.name || "Customer Photograph",
                  visible: true,
                  x: 0,
                  y: 0,
                  width: 1,
                  height: 1,
                  storagePath,
                  imageUrl: resolveCustomizationAssetUrl(storagePath),
                  crop: asset.crop,
                });
              }
            }

            const texts =
              (custom._text_layers as Array<Record<string, unknown>>) ||
              (snap.text_layers as Array<Record<string, unknown>>) ||
              [];

            for (const t of texts) {
              combined.push({
                ...t,
                type: "text",
                visible: true,
              });
            }

            return combined;
          })()}
          options={
            (active3DModalItem.customisation_details?.options as Record<
              string,
              unknown
            >) || {}
          }
          mode={
            (active3DModalItem.customisation_details?._mode as string) ||
            "demonstration"
          }
        />
      )}

      {/* High-Resolution Flat Artwork Lightbox Modal */}
      {activeLightboxArtwork && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="High-Resolution Flat Artwork Lightbox"
          className="fixed inset-0 z-50 flex flex-col bg-stone-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200"
        >
          {/* Top Bar */}
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 bg-stone-900/90 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="rounded bg-stone-800 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400 border border-stone-700">
                Artwork Lightbox
              </span>
              <div>
                <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span>{activeLightboxArtwork.title}</span>
                  {activeLightboxArtwork.isDerived ? (
                    <span className="rounded bg-amber-900/60 border border-amber-600/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      Derived On-Demand (Non-Mutating)
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-950 border border-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      Captured at Checkout (Immutable)
                    </span>
                  )}
                </h3>
                <p className="font-mono text-[11px] text-stone-400">
                  {activeLightboxArtwork.surfaceDimensions.width} × {activeLightboxArtwork.surfaceDimensions.height} mm (Native Aspect 1 : {(activeLightboxArtwork.surfaceDimensions.height / activeLightboxArtwork.surfaceDimensions.width).toFixed(2)}) • Canvas: 1024 × 1670 px
                </p>
              </div>
            </div>

            {/* Controls & Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center rounded-lg border border-stone-700 bg-stone-800 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setLightboxZoom((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                  disabled={lightboxZoom <= 0.5}
                  title="Zoom Out (-25%)"
                  className="rounded p-1.5 text-stone-300 hover:bg-stone-700 hover:text-white disabled:opacity-40"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[50px] text-center font-mono text-[11px] font-bold text-stone-200">
                  {Math.round(lightboxZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxZoom((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}
                  disabled={lightboxZoom >= 3}
                  title="Zoom In (+25%)"
                  className="rounded p-1.5 text-stone-300 hover:bg-stone-700 hover:text-white disabled:opacity-40"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxZoom(1)}
                  title="Fit to Window (100%)"
                  className="ml-1 rounded border-l border-stone-700 px-2 py-1 font-mono text-[10px] font-bold text-stone-300 hover:bg-stone-700 hover:text-white"
                >
                  Fit 1:1
                </button>
              </div>

              {/* Download */}
              <a
                href={activeLightboxArtwork.imageUrl}
                download={`artwork_${order?.order_number || "order"}_item_${activeLightboxArtwork.itemId.slice(0, 8)}.png`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-700 hover:text-white transition"
              >
                <Download className="h-4 w-4 text-amber-400" />
                <span>Download PNG</span>
              </a>

              {/* Save Derived to Storage if derived */}
              {activeLightboxArtwork.isDerived && (
                <button
                  type="button"
                  disabled={savingArtifact[activeLightboxArtwork.itemId]}
                  onClick={() => handleSaveDerivedArtwork(activeLightboxArtwork.itemId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50 transition"
                >
                  {savingArtifact[activeLightboxArtwork.itemId] ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>Save to Storage</span>
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setActiveLightboxArtwork(null)}
                className="rounded-lg border border-stone-700 bg-stone-800 p-1.5 text-stone-400 hover:bg-stone-700 hover:text-white transition"
                title="Close lightbox (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Main Inspection Viewport */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center bg-[radial-gradient(#292524_1px,transparent_1px)] [background-size:16px_16px]">
            <div
              className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full"
              style={{
                transform: `scale(${lightboxZoom})`,
                transformOrigin: "center center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeLightboxArtwork.imageUrl}
                alt={activeLightboxArtwork.title}
                className="max-h-[78vh] w-auto rounded-lg shadow-2xl border-2 border-stone-700 bg-white object-contain"
                style={{
                  aspectRatio: `${activeLightboxArtwork.surfaceDimensions.width} / ${activeLightboxArtwork.surfaceDimensions.height}`,
                }}
              />
            </div>
          </div>

          {/* Bottom Bar / Engineering Notice */}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-800 bg-stone-900/90 px-4 py-2.5 sm:px-6 text-xs text-stone-400 font-mono">
            <div>
              <span className="font-bold text-amber-400">PROTOTYPE NOTICE:</span> Physical machine dimensions (380 × 620 mm) are factory unverified caliper measurements.
            </div>
            <div>
              {saveArtifactStatus[activeLightboxArtwork.itemId] && (
                <span
                  className={
                    saveArtifactStatus[activeLightboxArtwork.itemId]?.type === "success"
                      ? "text-emerald-400 font-bold"
                      : "text-red-400"
                  }
                >
                  {saveArtifactStatus[activeLightboxArtwork.itemId]?.message}
                </span>
              )}
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}