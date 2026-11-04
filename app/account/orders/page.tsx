import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  Eye,
  Sparkles,
  ArrowRight,
  ShoppingBag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

export const dynamic = "force-dynamic";

type OrderItemSummary = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  customisation_details: Record<string, unknown> | null;
};

type OrderRecord = {
  id: string;
  order_number: string;
  total_amount: number;
  currency: string;
  order_status: string;
  payment_status: string;
  created_at: string;
  order_items: OrderItemSummary[];
};

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
        label: "Pending",
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

export default async function CustomerOrdersPage() {
  const supabase = await createClient();

  // 1. Authenticate customer
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/account/orders");
  }

  // 2. Fetch customer's orders strictly scoped to user.id
  const { data: rawOrders } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      total_amount,
      currency,
      order_status,
      payment_status,
      created_at,
      order_items (
        id,
        product_name,
        variant_name,
        quantity,
        customisation_details
      )
    `
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  const orders: OrderRecord[] = (rawOrders ?? []) as unknown as OrderRecord[];

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Account Overview</span>
          </Link>
          <span className="text-xs text-stone-500">
            {orders.length} Total Order{orders.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Page Header */}
        <div className="border-b border-stone-200 pb-6 mb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-red-700">
            Purchase History
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl mt-1">
            My Orders
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Track status, delivery progress, and personalized machine configurations.
          </p>
        </div>

        {/* Orders Listing */}
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center shadow-sm">
            <ShoppingBag className="mx-auto h-12 w-12 text-stone-300" />
            <h2 className="mt-4 font-display text-lg font-bold text-stone-900">
              No orders found
            </h2>
            <p className="mt-1 text-sm text-stone-500 max-w-sm mx-auto">
              You haven&apos;t placed any orders yet. Discover our premium domestic flour mills.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3 text-sm font-semibold text-white hover:bg-red-800 transition"
            >
              <span>Explore Aatamakers</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusBadge = getOrderStatusBadge(order.order_status);
              const paymentBadge = getPaymentStatusBadge(order.payment_status);
              const StatusIcon = statusBadge.icon;
              const hasCustom = order.order_items?.some(
                (it) => it.customisation_details && Object.keys(it.customisation_details).length > 0
              );
              const hasDemo = order.order_items?.some(
                (it) => it.customisation_details?._mode === "demonstration"
              );

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm hover:border-stone-300 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-100 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-display font-bold text-base text-stone-900">
                          Order #{order.order_number}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusBadge.classes}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          <span>{statusBadge.label}</span>
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${paymentBadge.classes}`}
                        >
                          {paymentBadge.label}
                        </span>
                        {hasCustom && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                            <Sparkles className="h-3 w-3 text-amber-600" />
                            <span>Bespoke Design</span>
                          </span>
                        )}
                        {hasDemo && (
                          <span className="inline-flex items-center rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 border border-stone-200">
                            Demo Prototype
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-stone-500 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" />
                        <span>Placed on {formatDate(order.created_at)}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6">
                      <div className="text-left sm:text-right">
                        <span className="block text-xs font-medium text-stone-500">
                          Total
                        </span>
                        <span className="font-display font-bold text-lg text-stone-900">
                          {formatINR(Number(order.total_amount))}
                        </span>
                      </div>

                      <Link
                        href={`/account/orders/${order.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View Details</span>
                      </Link>
                    </div>
                  </div>

                  {/* Order Items Preview */}
                  <div className="pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">
                      Items Ordered
                    </p>
                    <ul className="space-y-1.5">
                      {order.order_items?.map((item) => {
                        const custom = item.customisation_details;
                        const textLayers = (custom?._text_layers as Array<Record<string, unknown>>) || [];
                        const allLayers = (custom?._layers as Array<Record<string, unknown>>) || [];
                        const inscription = (textLayers[0]?.text as string) || (allLayers.find((l) => l.type === "text" || l.text)?.text as string) || (custom?.family_name_engraving as string) || "";

                        return (
                          <li
                            key={item.id}
                            className="text-xs text-stone-700 flex flex-wrap items-center justify-between gap-2"
                          >
                            <span className="font-medium text-stone-900">
                              {item.product_name}
                              {item.variant_name ? ` (${item.variant_name})` : ""}
                              {" "}× {item.quantity}
                              {Boolean(inscription) && (
                                <span className="ml-2 font-normal text-amber-800">
                                  • Inscription: &ldquo;{inscription}&rdquo;
                                </span>
                              )}
                            </span>
                            {Boolean(item.customisation_details?._customization_summary) && (
                              <span className="text-[11px] text-amber-800 italic">
                                {String(item.customisation_details?._customization_summary)}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <StorefrontFooter />
    </div>
  );
}
