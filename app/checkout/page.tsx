"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { supabase } from "@/lib/supabase/client";
import { clearCart, readSavedCart } from "@/lib/cart";
import type { CartItem } from "@/types/cart";
import { resolveCustomizationAssetUrl } from "@/lib/3d/storage-assets";

type OrderResult = {
  orderId?: string;
  orderNumber: string;
  totalAmount: number;
  message: string;
};

const initialForm = {
  customerName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  notes: "",
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function generateCryptoUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [form, setForm] = useState(initialForm);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Stable client idempotency token to prevent double submissions
  const idempotencyKeyRef = useRef<string>("");

  useEffect(() => {
    idempotencyKeyRef.current = generateCryptoUUID();

    try {
      const savedItems = readSavedCart();
      setItems(savedItems);
    } catch {
      setError("We could not read your saved cart. Please return to your cart.");
    } finally {
      setLoading(false);
    }

    // Auto-fill logged-in customer identity if session exists
    try {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setIsAuthenticated(true);
          const fullName =
            (user.user_metadata?.full_name as string) ||
            (user.user_metadata?.name as string) ||
            "";

          setForm((prev) => ({
            ...prev,
            email: prev.email || user.email || "",
            customerName: prev.customerName || fullName,
          }));
        }
      });
    } catch (err) {
      console.warn("Auth prefetch skipped in checkout:", err);
    }
  }, []);

  const estimatedSubtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Number(item.unitPrice || 0) * item.quantity,
        0,
      ),
    [items],
  );

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (items.length === 0) {
      setError("Your cart is empty. Add an Aatamaker before checkout.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          idempotencyKey: idempotencyKeyRef.current,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
            customisationDetails: item.customisationDetails ?? null,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Could not create the order. Please try again.");
        return;
      }

      setOrder({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        totalAmount: data.totalAmount,
        message: data.message,
      });

      // Clear cart and rotate idempotency key immediately upon successful placement
      clearCart();
      idempotencyKeyRef.current = generateCryptoUUID();
    } catch {
      setError(
        "Could not connect to the checkout server. Please check your network and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-stone-900">
        <StorefrontHeader />
        <div className="flex min-h-[50vh] items-center justify-center gap-3 text-stone-500">
          <LoaderCircle size={22} className="animate-spin" />
          Preparing checkout…
        </div>
        <StorefrontFooter />
      </main>
    );
  }

  // 1. Order Confirmation Screen
  if (order) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-stone-900">
        <StorefrontHeader />

        <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-5 py-12">
          <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={36} />
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Order Confirmed
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Thank you for your order!
            </h1>

            <p className="mt-2 text-sm text-stone-600">
              We have received your order and are preparing it for assembly and shipment.
            </p>

            <div className="mt-6 rounded-2xl border border-stone-200 bg-[#faf8f4] p-5 text-left">
              <div className="flex justify-between gap-4 border-b border-stone-200 pb-3 text-sm">
                <span className="text-stone-500">Order number</span>
                <strong className="font-mono text-stone-900">{order.orderNumber}</strong>
              </div>

              <div className="flex justify-between gap-4 py-3 text-sm">
                <span className="text-stone-500">Order total</span>
                <strong className="text-stone-900">{formatINR(order.totalAmount)}</strong>
              </div>

              <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-sm">
                <span className="text-stone-500">Payment status</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                  Payment Pending (Development)
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-stone-500">
              {order.message}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isAuthenticated && order.orderId ? (
                <Link
                  href={`/account/orders/${order.orderId}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-6 py-3 font-semibold text-white hover:bg-red-800 transition"
                >
                  View Order Details
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link
                  href="/products"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-6 py-3 font-semibold text-white hover:bg-red-800 transition"
                >
                  Continue Shopping
                  <ArrowRight size={16} />
                </Link>
              )}

              {isAuthenticated && (
                <Link
                  href="/products"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
                >
                  Continue Shopping
                </Link>
              )}
            </div>
          </section>
        </div>

        <StorefrontFooter />
      </main>
    );
  }

  // 2. Empty Cart Screen
  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-stone-900">
        <StorefrontHeader />

        <div className="mx-auto flex min-h-[45vh] max-w-7xl items-center justify-center px-5 py-12">
          <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
              <ShoppingBag size={26} />
            </div>

            <h1 className="mt-5 text-2xl font-bold">Your cart is empty</h1>

            <p className="mt-3 text-sm leading-6 text-stone-500">
              Please add an Aatamaker before starting checkout.
            </p>

            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800"
            >
              Browse machines
              <ArrowRight size={16} />
            </Link>

            <Link
              href="/cart"
              className="mt-4 block text-sm font-semibold text-stone-500 hover:text-red-700"
            >
              Return to cart
            </Link>
          </section>
        </div>

        <StorefrontFooter />
      </main>
    );
  }

  // 3. Checkout Form & Order Summary
  return (
    <main className="min-h-screen bg-[#faf8f4] text-stone-900">
      <StorefrontHeader />

      <div className="mx-auto max-w-7xl px-5 py-8 sm:py-10">
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-red-700"
        >
          <ArrowLeft size={16} />
          Back to cart
        </Link>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">
            Order placement
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Checkout</h1>

          <p className="mt-2 text-sm text-stone-500">
            Enter your delivery information to place your order with CALVIN AATAMAKER.
          </p>
        </div>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[1fr_380px]">
          <form onSubmit={submitCheckout} className="space-y-6">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Contact information</h2>
                {isAuthenticated && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Signed In
                  </span>
                )}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium sm:col-span-2">
                  Full name *
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
                    placeholder="Enter recipient full name"
                    className={inputClass}
                    value={form.customerName}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        customerName: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium">
                  Email address *
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    placeholder="name@example.com"
                    className={inputClass}
                    value={form.email}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        email: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium">
                  Mobile number *
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    autoComplete="tel-national"
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    className={inputClass}
                    value={form.phone}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        phone: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10),
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
              <h2 className="text-lg font-bold">Delivery address</h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium sm:col-span-2">
                  Address line 1 *
                  <input
                    required
                    maxLength={200}
                    autoComplete="address-line1"
                    placeholder="Flat / house number, building, street"
                    className={inputClass}
                    value={form.address1}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        address1: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium sm:col-span-2">
                  Address line 2 (optional)
                  <input
                    maxLength={200}
                    autoComplete="address-line2"
                    placeholder="Landmark, colony, or area"
                    className={inputClass}
                    value={form.address2}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        address2: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium">
                  City *
                  <input
                    required
                    maxLength={100}
                    autoComplete="address-level2"
                    placeholder="City"
                    className={inputClass}
                    value={form.city}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        city: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium">
                  State / Territory *
                  <input
                    required
                    maxLength={100}
                    autoComplete="address-level1"
                    placeholder="State (e.g. Gujarat, Maharashtra)"
                    className={inputClass}
                    value={form.state}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        state: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium">
                  PIN code *
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="postal-code"
                    placeholder="6-digit PIN"
                    className={inputClass}
                    value={form.postalCode}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        postalCode: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6),
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-medium">
                  Country
                  <input
                    disabled
                    value="India"
                    className={`${inputClass} bg-stone-50 text-stone-500`}
                  />
                </label>

                <label className="block text-sm font-medium sm:col-span-2">
                  Delivery instructions / notes (optional)
                  <textarea
                    rows={3}
                    maxLength={500}
                    placeholder="Any specific delivery instructions"
                    className={inputClass}
                    value={form.notes}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        notes: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />

              <p>
                <strong>Development checkout environment:</strong> Live payment collection is paused. Orders placed will be recorded as pending payment without real credit/debit card charges.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-4 text-sm font-bold text-white hover:bg-red-800 transition disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {submitting ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <ShieldCheck size={18} />
              )}

              {submitting ? "Confirming order…" : "Place Order"}
            </button>
          </form>

          {/* Right Summary Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-6">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold">Order summary</h2>

              <div className="mt-4 divide-y divide-stone-100">
                {items.map((item) => {
                  const rawPreview =
                    item.customPreviewUrl ||
                    (item.customisationDetails?._preview_storage_path as string | undefined) ||
                    (item.customisationDetails?._preview_image as string | undefined);
                  const previewImage = rawPreview ? resolveCustomizationAssetUrl(rawPreview) : null;
                  const isDemo = item.customizationMode === "demonstration" || item.customisationDetails?._mode === "demonstration";
                  const summaryText = typeof item.customisationDetails?._customization_summary === "string"
                    ? item.customisationDetails._customization_summary
                    : null;
                  const nonSystemEntries = item.customisationDetails
                    ? Object.entries(item.customisationDetails).filter(([k, v]) => !k.startsWith("_") && v !== null && v !== "" && v !== undefined)
                    : [];

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 py-3 text-sm"
                    >
                      {previewImage ? (
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100 border border-amber-300">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewImage}
                            alt={`${item.name} custom artwork`}
                            className="h-full w-full object-contain p-0.5"
                          />
                        </div>
                      ) : item.image ? (
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100 border border-stone-200">
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            className="object-contain p-1"
                          />
                        </div>
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-stone-900 truncate">{item.name}</p>

                        {item.variantName && (
                          <p className="text-xs text-stone-500">
                            Option: {item.variantName}
                          </p>
                        )}

                        {item.customisationDetails &&
                          Object.keys(item.customisationDetails).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                  <Sparkles size={10} className="text-amber-600" />
                                  3D Personalized
                                </span>
                                {isDemo && (
                                  <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-medium text-amber-900 border border-amber-300/60">
                                    Demo Prototype
                                  </span>
                                )}
                              </div>
                              {summaryText && (
                                <p className="text-[11px] text-stone-700 italic leading-tight">
                                  {summaryText}
                                </p>
                              )}
                              {nonSystemEntries.length > 0 && (
                                <p className="text-[11px] text-stone-500 truncate">
                                  {nonSystemEntries
                                    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                          )}

                        <p className="mt-1 text-xs text-stone-500">
                          Qty: {item.quantity} × {formatINR(Number(item.unitPrice))}
                        </p>
                      </div>

                      <span className="shrink-0 font-bold text-stone-900">
                        {formatINR(Number(item.unitPrice) * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 space-y-2 border-t border-stone-200 pt-4 text-sm">
                <div className="flex justify-between gap-4 text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-stone-900">
                    {formatINR(estimatedSubtotal)}
                  </span>
                </div>

                <div className="flex justify-between gap-4 text-stone-600">
                  <span>Delivery</span>
                  <span className="font-semibold text-emerald-700">FREE</span>
                </div>

                <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-base">
                  <span className="font-bold text-stone-900">Total</span>
                  <strong className="font-bold text-red-700">
                    {formatINR(estimatedSubtotal)}
                  </strong>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-stone-500">
                Authoritative prices and inventory are cryptographically verified by the server during order creation.
              </p>
            </section>
          </aside>
        </div>
      </div>

      <StorefrontFooter />
    </main>
  );
}
