"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

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
  customisation_details: Record<string, unknown>;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusStyle(status: OrderStatus) {
  switch (status) {
    case "confirmed":
    case "delivered":
      return "bg-emerald-50 text-emerald-700";
    case "processing":
    case "shipped":
      return "bg-blue-50 text-blue-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-amber-50 text-amber-800";
  }
}

function paymentStyle(status: string) {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-700";
    case "failed":
    case "refunded":
      return "bg-red-50 text-red-700";
    default:
      return "bg-amber-50 text-amber-800";
  }
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    setNeedsSignIn(false);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setError("Unable to check your sign-in session.");
        return;
      }

      if (!session?.access_token) {
        setNeedsSignIn(true);
        return;
      }

      const response = await fetch("/api/admin/orders", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setNeedsSignIn(true);
        } else {
          setError(payload.error ?? "Unable to load orders.");
        }
        return;
      }

      setOrders((payload.orders ?? []) as Order[]);
    } catch (err) {
      console.error("Loading admin orders failed:", err);
      setError("Could not connect to the orders service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "all" || order.order_status === statusFilter;

      const matchesSearch =
        !term ||
        [
          order.order_number,
          order.customer_name,
          order.email,
          order.phone,
          order.postal_code,
        ].some((value) => value?.toLowerCase().includes(term));

      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const pendingCount = orders.filter(
    (order) => order.order_status === "pending",
  ).length;

  const activeCount = orders.filter((order) =>
    ["confirmed", "processing", "shipped"].includes(order.order_status),
  ).length;

  const paidTotal = orders
    .filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + Number(order.total_amount), 0);

  async function updateOrderStatus(order: Order, orderStatus: OrderStatus) {
    if (order.order_status === orderStatus) return;

    setUpdatingId(order.id);
    setError("");
    setNotice("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setNeedsSignIn(true);
        return;
      }

      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          orderStatus,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Unable to update order status.");
        return;
      }

      const updated = payload.order as {
        id: string;
        order_status: OrderStatus;
        updated_at: string;
      };

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                order_status: updated.order_status,
                updated_at: updated.updated_at,
              }
            : item,
        ),
      );

      setSelectedOrder((current) =>
        current?.id === order.id
          ? {
              ...current,
              order_status: updated.order_status,
              updated_at: updated.updated_at,
            }
          : current,
      );

      setNotice(
        `Order ${order.order_number} updated to ${statusLabels[orderStatus]}.`,
      );
    } catch {
      setError("Could not update this order. Please try again.");
    } finally {
      setUpdatingId("");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 text-stone-500">
        <LoaderCircle size={22} className="animate-spin" />
        Loading orders…
      </div>
    );
  }

  if (needsSignIn) {
    return (
      <div className="flex min-h-80 items-center justify-center px-5">
        <section className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <ShieldCheck size={32} className="mx-auto text-red-700" />
          <h1 className="mt-4 text-xl font-bold">
            Administrator sign-in required
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Sign in through the admin dashboard, then return to order
            management.
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-block rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white"
          >
            Go to admin sign-in
          </Link>
        </section>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <header className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
              Store management
            </p>
            <h1 className="mt-1 text-2xl font-bold text-stone-900">Orders</h1>
            <p className="mt-1 text-sm text-stone-500">
              Review customer purchases and manage fulfilment status.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadOrders()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              <RefreshCw size={15} /> Refresh orders
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")} className="font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice("")} className="font-semibold">
              Dismiss
            </button>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total orders"
            value={orders.length}
            caption="Latest 100 orders"
            icon={ShoppingBag}
          />
          <SummaryCard
            title="Awaiting action"
            value={pendingCount}
            caption="Orders still pending"
            icon={Clock3}
          />
          <SummaryCard
            title="In fulfilment"
            value={activeCount}
            caption="Confirmed to shipped"
            icon={Truck}
          />
          <SummaryCard
            title="Payments received"
            value={formatINR(paidTotal)}
            caption="Only orders marked paid"
            icon={CheckCircle2}
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 p-5">
            <div>
              <h2 className="text-lg font-bold">Order register</h2>
              <p className="mt-1 text-sm text-stone-500">
                {filteredOrders.length} matching order(s)
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2.5">
                <Search size={16} className="text-stone-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order or customer"
                  className="w-52 max-w-full text-sm outline-none"
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-700"
                aria-label="Filter by order status"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Package size={36} className="mx-auto text-stone-300" />
              <h3 className="mt-3 text-lg font-bold">No matching orders</h3>
              <p className="mt-1 text-sm text-stone-500">
                Orders created through checkout will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-5 py-4">Order</th>
                    <th className="px-4 py-4">Customer</th>
                    <th className="px-4 py-4">Date</th>
                    <th className="px-4 py-4">Total</th>
                    <th className="px-4 py-4">Payment</th>
                    <th className="px-4 py-4">Order status</th>
                    <th className="px-5 py-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-stone-50/70">
                      <td className="px-5 py-4">
                        <p className="font-bold">{order.order_number}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {order.order_items?.length ?? 0} product line(s)
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{order.customer_name}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {order.email}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {order.phone}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-stone-600">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-4 font-bold">
                        {formatINR(Number(order.total_amount))}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStyle(order.payment_status)}`}
                        >
                          {order.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(order.order_status)}`}
                        >
                          {statusLabels[order.order_status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-white"
                        >
                          <Eye size={14} /> View order
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-stone-500">
          This page shows the latest 100 orders. Payment status is displayed
          separately and cannot be changed from this order-status control.
        </p>
      </div>

      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedOrder(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
                  Order details
                </p>
                <h2 id="order-detail-title" className="mt-1 text-xl font-bold">
                  {selectedOrder.order_number}
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Created {formatDate(selectedOrder.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                className="rounded-lg border border-stone-200 p-2 hover:bg-stone-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <section>
                <h3 className="font-bold">Customer</h3>
                <div className="mt-3 grid gap-3 rounded-xl bg-stone-50 p-4 text-sm sm:grid-cols-2">
                  <DetailField
                    label="Name"
                    value={selectedOrder.customer_name}
                  />
                  <DetailField label="Mobile" value={selectedOrder.phone} />
                  <DetailField label="Email" value={selectedOrder.email} />
                  <DetailField
                    label="Customer account"
                    value={
                      selectedOrder.customer_id
                        ? "Registered account"
                        : "Guest checkout"
                    }
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <MapPin size={17} className="text-red-700" />
                  <h3 className="font-bold">Delivery address</h3>
                </div>
                <div className="mt-3 rounded-xl bg-stone-50 p-4 text-sm leading-6">
                  <p>{selectedOrder.shipping_address_line1}</p>
                  {selectedOrder.shipping_address_line2 && (
                    <p>{selectedOrder.shipping_address_line2}</p>
                  )}
                  <p>
                    {selectedOrder.city}, {selectedOrder.state}{" "}
                    {selectedOrder.postal_code}
                  </p>
                  <p>{selectedOrder.country}</p>
                </div>
                {selectedOrder.customer_notes && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <p className="font-semibold">Customer notes</p>
                    <p className="mt-1 whitespace-pre-wrap leading-6">
                      {selectedOrder.customer_notes}
                    </p>
                  </div>
                )}
              </section>

              <section>
                <h3 className="font-bold">Items ordered</h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-stone-200">
                  {(selectedOrder.order_items ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 p-4 last:border-b-0"
                    >
                      <div>
                        <p className="font-semibold">{item.product_name}</p>
                        {item.sku && (
                          <p className="mt-1 text-xs text-stone-500">
                            SKU: {item.sku}
                          </p>
                        )}
                        {item.variant_name && (
                          <p className="mt-1 text-xs text-stone-500">
                            Variant: {item.variant_name}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-stone-500">
                          {formatINR(Number(item.unit_price))} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-bold">
                        {formatINR(Number(item.line_total))}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl bg-stone-50 p-4">
                <h3 className="font-bold">Payment and total</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <AmountRow
                    label="Subtotal"
                    value={formatINR(Number(selectedOrder.subtotal))}
                  />
                  <AmountRow
                    label="Shipping"
                    value={formatINR(Number(selectedOrder.shipping_amount))}
                  />
                  <AmountRow
                    label="Tax"
                    value={formatINR(Number(selectedOrder.tax_amount))}
                  />
                  <AmountRow
                    label="Discount"
                    value={`−${formatINR(Number(selectedOrder.discount_amount))}`}
                  />
                  <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-base font-bold">
                    <span>Total</span>
                    <span>{formatINR(Number(selectedOrder.total_amount))}</span>
                  </div>
                  <div className="flex justify-between gap-4 pt-2">
                    <span className="text-stone-500">Payment status</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStyle(selectedOrder.payment_status)}`}
                    >
                      {selectedOrder.payment_status}
                    </span>
                  </div>
                </div>
              </section>

              <section>
                <label htmlFor="order-status" className="block font-bold">
                  Fulfilment status
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Change the order&apos;s progress. This does not mark the
                  payment as received.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <select
                    id="order-status"
                    value={selectedOrder.order_status}
                    disabled={updatingId === selectedOrder.id}
                    onChange={(event) =>
                      void updateOrderStatus(
                        selectedOrder,
                        event.target.value as OrderStatus,
                      )
                    }
                    className="min-w-48 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm outline-none focus:border-red-700 disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>

                  {updatingId === selectedOrder.id && (
                    <span className="inline-flex items-center gap-2 text-sm text-stone-500">
                      <LoaderCircle size={16} className="animate-spin" />
                      Saving…
                    </span>
                  )}
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  value,
  caption,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  caption: string;
  icon: typeof Package;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-500">{title}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 break-words text-2xl font-bold text-stone-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-stone-500">{caption}</p>
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 break-words font-medium text-stone-900">{value}</p>
    </div>
  );
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
