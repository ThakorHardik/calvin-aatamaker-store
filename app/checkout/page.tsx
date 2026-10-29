"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

const CART_KEY = "calvin-aatamaker-cart";

type CartItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  variantId: string | null;
};

type OrderResult = {
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

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          setItems(
            parsed.filter(
              (item): item is CartItem =>
                item !== null &&
                typeof item === "object" &&
                typeof item.productId === "string" &&
                typeof item.name === "string" &&
                Number.isInteger(item.quantity) &&
                item.quantity > 0,
            ),
          );
        }
      }
    } catch {
      setError(
        "We could not read your saved cart. Please return to your cart.",
      );
    } finally {
      setLoading(false);
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
      setError("Your cart is empty. Add a product before checkout.");
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
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Could not create the order. Please try again.");
        return;
      }

      setOrder({
        orderNumber: data.orderNumber,
        totalAmount: data.totalAmount,
        message: data.message,
      });

      localStorage.removeItem(CART_KEY);
      window.dispatchEvent(new Event("calvin-cart-updated"));
    } catch {
      setError(
        "Could not connect to checkout. Check the development server and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#faf8f4]">
        <StorefrontHeader />

        <div className="flex min-h-[45vh] items-center justify-center px-5">
          <div className="text-center">
            <LoaderCircle
              size={28}
              className="mx-auto animate-spin text-red-700"
            />
            <p className="mt-4 text-sm text-stone-500">
              Preparing your checkout…
            </p>
          </div>
        </div>

        <StorefrontFooter />
      </main>
    );
  }

  if (order) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-stone-900">
        <StorefrontHeader />

        <div className="mx-auto flex max-w-7xl items-center justify-center px-5 py-12 sm:py-16">
          <section className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600" />

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Order confirmation
            </p>

            <h1 className="mt-2 text-3xl font-bold">Order created</h1>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Your development order has been saved successfully.
            </p>

            <div className="mt-6 rounded-2xl bg-stone-50 p-5 text-left">
              <div className="flex flex-wrap justify-between gap-3 py-2 text-sm">
                <span className="text-stone-500">Order number</span>
                <strong className="break-all">{order.orderNumber}</strong>
              </div>

              <div className="flex justify-between gap-4 py-2 text-sm">
                <span className="text-stone-500">Order total</span>
                <strong>{formatINR(order.totalAmount)}</strong>
              </div>

              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                Payment is pending. No payment has been collected. This is a
                development checkout.
              </p>
            </div>

            <p className="mt-4 text-xs leading-5 text-stone-500">
              {order.message}
            </p>

            <Link
              href="/products"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800"
            >
              Continue shopping
              <ArrowRight size={16} />
            </Link>
          </section>
        </div>

        <StorefrontFooter />
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-stone-900">
        <StorefrontHeader />

        <div className="mx-auto flex min-h-[45vh] max-w-7xl items-center justify-center px-5 py-12">
          <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
              <AlertCircle size={26} />
            </div>

            <h1 className="mt-5 text-2xl font-bold">Your cart is empty</h1>

            <p className="mt-3 text-sm leading-6 text-stone-500">
              Please add an Aatamaker before starting checkout.
            </p>

            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800"
            >
              Browse products
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
            Almost there
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Checkout</h1>

          <p className="mt-2 text-sm text-stone-500">
            Enter your delivery information to create a development order.
          </p>
        </div>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[1fr_360px]">
          <form onSubmit={submitCheckout} className="space-y-6">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
              <h2 className="text-lg font-bold">Contact information</h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium sm:col-span-2">
                  Full name *
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
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
                    placeholder="9876543210"
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
                    placeholder="House / flat, street, area"
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
                  Address line 2
                  <input
                    maxLength={200}
                    autoComplete="address-line2"
                    placeholder="Landmark (optional)"
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
                  State *
                  <input
                    required
                    maxLength={100}
                    autoComplete="address-level1"
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
                  Order notes (optional)
                  <textarea
                    rows={3}
                    maxLength={500}
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
                <strong>Development checkout only.</strong> Shipping and tax
                rules are not configured, and Razorpay is not connected. Do not
                use this form for real customer orders.
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-4 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {submitting ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <ShieldCheck size={18} />
              )}

              {submitting ? "Creating order…" : "Create development order"}
            </button>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold">Order summary</h2>

              <div className="mt-4 divide-y divide-stone-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between gap-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        Quantity: {item.quantity}
                      </p>
                    </div>

                    <span className="shrink-0 font-semibold">
                      {formatINR(Number(item.unitPrice) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex justify-between gap-4 border-t border-stone-200 pt-4 text-sm">
                <span className="text-stone-600">Estimated subtotal</span>
                <strong>{formatINR(estimatedSubtotal)}</strong>
              </div>

              <p className="mt-3 text-xs leading-5 text-stone-500">
                The server recalculates prices and checks stock before creating
                the order.
              </p>
            </section>
          </aside>
        </div>
      </div>

      <StorefrontFooter />
    </main>
  );
}
