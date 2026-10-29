"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { supabase } from "@/lib/supabase/client";

const CART_KEY = "calvin-aatamaker-cart";

type CartItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  variantId: string | null;
  variantName: string | null;
  sku: string | null;
  availableStock?: number;
  unavailable?: boolean;
  unavailableReason?: string;
};

type DbProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  product_images: {
    id: string;
    storage_path: string;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }[];
};

type DbVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock_quantity: number;
  is_active: boolean;
};

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function productImageUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return supabase.storage.from("product-media").getPublicUrl(path).data
    .publicUrl;
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<CartItem>;

  return (
    typeof item.id === "string" &&
    typeof item.productId === "string" &&
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    (typeof item.image === "string" || item.image === null) &&
    typeof item.unitPrice === "number" &&
    Number.isFinite(item.unitPrice) &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    (typeof item.variantId === "string" || item.variantId === null) &&
    (typeof item.variantName === "string" || item.variantName === null) &&
    (typeof item.sku === "string" || item.sku === null)
  );
}

function readSavedCart(): CartItem[] {
  try {
    const saved = localStorage.getItem(CART_KEY);

    if (!saved) {
      return [];
    }

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isCartItem);
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("calvin-cart-updated"));
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCart = useCallback(async () => {
    setLoading(true);
    setSyncError("");

    const savedItems = readSavedCart();

    if (savedItems.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const productIds = [...new Set(savedItems.map((item) => item.productId))];

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select(
          `
            id,
            name,
            slug,
            sku,
            price,
            stock_quantity,
            is_active,
            product_images(
              id,
              storage_path,
              alt_text,
              is_primary,
              sort_order
            )
          `,
        )
        .in("id", productIds)
        .eq("is_active", true);

      if (productError) {
        setItems(savedItems);
        setSyncError(
          "We couldn't verify current prices and stock. Please retry before proceeding to checkout.",
        );
        return;
      }

      const products = (productData ?? []) as unknown as DbProduct[];

      const productMap = new Map(
        products.map((product) => [product.id, product]),
      );

      const variantIds = [
        ...new Set(
          savedItems
            .map((item) => item.variantId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      let variantMap = new Map<string, DbVariant>();

      if (variantIds.length > 0) {
        const { data: variantData, error: variantError } = await supabase
          .from("product_variants")
          .select(
            `
              id,
              product_id,
              name,
              sku,
              price,
              stock_quantity,
              is_active
            `,
          )
          .in("id", variantIds);

        if (variantError) {
          setItems(savedItems);
          setSyncError(
            "We couldn't verify your product options. Please retry before checkout.",
          );
          return;
        }

        const variants = (variantData ?? []) as DbVariant[];

        variantMap = new Map(variants.map((variant) => [variant.id, variant]));
      }

      const refreshedItems = savedItems.map((item): CartItem => {
        const product = productMap.get(item.productId);

        if (!product) {
          return {
            ...item,
            unavailable: true,
            availableStock: 0,
            unavailableReason: "This product is no longer available.",
          };
        }

        let price = Number(product.price);
        let stock = product.stock_quantity;
        let currentSku = product.sku;
        let currentVariantName: string | null = null;

        if (item.variantId) {
          const variant = variantMap.get(item.variantId);

          if (
            !variant ||
            !variant.is_active ||
            variant.product_id !== product.id
          ) {
            return {
              ...item,
              name: product.name,
              unavailable: true,
              availableStock: 0,
              unavailableReason: "This product option is no longer available.",
            };
          }

          price = Number(variant.price ?? product.price);
          stock = variant.stock_quantity;
          currentSku = variant.sku ?? product.sku;
          currentVariantName = variant.name;
        }

        const images = [...(product.product_images ?? [])].sort((a, b) => {
          if (a.is_primary !== b.is_primary) {
            return a.is_primary ? -1 : 1;
          }

          return a.sort_order - b.sort_order;
        });

        const primaryImage = images[0];

        // Keep the image selected by the shopper.
        // Use the primary product image only as a fallback.
        const preservedImage =
          item.image ||
          (primaryImage ? productImageUrl(primaryImage.storage_path) : null);

        return {
          ...item,
          name: product.name,
          slug: product.slug,
          unitPrice: price,
          sku: currentSku ?? item.sku,
          variantName: currentVariantName ?? item.variantName,
          image: preservedImage,
          availableStock: stock,
          unavailable: stock <= 0,
          unavailableReason: stock <= 0 ? "Currently out of stock." : undefined,
        };
      });

      setItems(refreshedItems);

      // Update the saved cart without dispatching another
      // cart event, preventing unnecessary reloads.
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(refreshedItems));
      } catch {
        setNotice(
          "Your cart was updated for this visit, but could not be saved in this browser.",
        );
      }
    } catch (error) {
      console.error("Cart verification failed:", error);

      setItems(savedItems);
      setSyncError(
        "We couldn't verify your cart right now. Please retry before proceeding to checkout.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCart();

    const handleCartUpdate = () => {
      void loadCart();
    };

    window.addEventListener("calvin-cart-updated", handleCartUpdate);

    window.addEventListener("storage", handleCartUpdate);

    return () => {
      window.removeEventListener("calvin-cart-updated", handleCartUpdate);

      window.removeEventListener("storage", handleCartUpdate);
    };
  }, [loadCart]);

  function changeQuantity(itemId: string, nextQuantity: number) {
    setNotice("");

    const updatedItems = items.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      if (nextQuantity < 1) {
        return item;
      }

      if (
        item.availableStock !== undefined &&
        nextQuantity > item.availableStock
      ) {
        setNotice(
          `Only ${item.availableStock} unit(s) are currently available.`,
        );

        return item;
      }

      return {
        ...item,
        quantity: nextQuantity,
      };
    });

    setItems(updatedItems);

    try {
      saveCart(updatedItems);
    } catch {
      setNotice("Unable to save your cart change in this browser.");
    }
  }

  function removeItem(itemId: string) {
    const updatedItems = items.filter((item) => item.id !== itemId);

    setItems(updatedItems);

    try {
      saveCart(updatedItems);
      setNotice("Item removed from your cart.");
    } catch {
      setNotice(
        "The item was removed from this view but could not be saved in this browser.",
      );
    }
  }

  const subtotal = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + (!item.unavailable ? item.unitPrice * item.quantity : 0),
        0,
      ),
    [items],
  );

  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);

  const hasUnavailableItems = items.some((item) => item.unavailable);

  return (
    <main className="min-h-screen bg-[#faf8f4] text-stone-900">
      <StorefrontHeader />

      <div className="mx-auto max-w-7xl px-5 py-9 sm:py-12">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-red-700"
        >
          <ArrowLeft size={16} />
          Continue shopping
        </Link>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">
            Your selection
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Shopping cart
          </h1>

          <p className="mt-2 text-sm text-stone-500">
            Review your products and quantities before checkout.
          </p>
        </div>

        {notice && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700"
          >
            {notice}
          </div>
        )}

        {syncError && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <AlertCircle size={19} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p>{syncError}</p>

              <button
                type="button"
                onClick={() => void loadCart()}
                className="mt-2 font-semibold underline"
              >
                Retry verification
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-3 text-stone-500">
            <LoaderCircle size={22} className="animate-spin" />
            Verifying products and prices…
          </div>
        ) : items.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-stone-200 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-700">
              <ShoppingBag size={28} />
            </div>

            <h2 className="mt-5 text-2xl font-bold">Your cart is empty</h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
              Explore our collection and add an Aatamaker that suits your home.
            </p>

            <Link
              href="/products"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3 font-semibold text-white hover:bg-red-800"
            >
              Explore products
              <ArrowRight size={16} />
            </Link>
          </section>
        ) : (
          <div className="mt-8 grid items-start gap-7 lg:grid-cols-[1fr_360px]">
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 className="font-bold">Cart items</h2>

                <span className="text-sm text-stone-500">
                  {totalQuantity} item(s)
                </span>
              </div>

              <div className="divide-y divide-stone-100">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start"
                  >
                    <Link
                      href={`/products/${item.slug}`}
                      className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f5f2ed] p-3 sm:h-36 sm:w-36"
                    >
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={240}
                          height={240}
                          unoptimized
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <PackagePlaceholder />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${item.slug}`}
                        className="font-bold transition hover:text-red-700"
                      >
                        {item.name}
                      </Link>

                      {item.variantName && (
                        <p className="mt-1 text-xs text-stone-500">
                          Option: {item.variantName}
                        </p>
                      )}

                      {item.sku && (
                        <p className="mt-1 text-xs text-stone-500">
                          SKU: {item.sku}
                        </p>
                      )}

                      {item.unavailable ? (
                        <p className="mt-3 text-sm font-semibold text-red-700">
                          {item.unavailableReason}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm font-semibold text-emerald-700">
                          In stock
                        </p>
                      )}

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex h-10 items-center rounded-xl border border-stone-300">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name}`}
                            disabled={item.quantity <= 1}
                            onClick={() =>
                              changeQuantity(item.id, item.quantity - 1)
                            }
                            className="flex h-full w-10 items-center justify-center hover:bg-stone-50 disabled:opacity-30"
                          >
                            <Minus size={14} />
                          </button>

                          <span className="min-w-8 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name}`}
                            disabled={
                              item.unavailable ||
                              item.quantity >= (item.availableStock ?? 0)
                            }
                            onClick={() =>
                              changeQuantity(item.id, item.quantity + 1)
                            }
                            className="flex h-full w-10 items-center justify-center hover:bg-stone-50 disabled:opacity-30"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="text-right">
                          <p className="font-bold">
                            {item.unavailable
                              ? "Unavailable"
                              : formatINR(item.unitPrice * item.quantity)}
                          </p>

                          {!item.unavailable && (
                            <p className="mt-1 text-xs text-stone-500">
                              {formatINR(item.unitPrice)} each
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="border-t border-stone-100 bg-stone-50 px-5 py-4">
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-900"
                >
                  <ArrowLeft size={15} />
                  Continue shopping
                </Link>
              </div>
            </section>

            <aside className="space-y-4 lg:sticky lg:top-6">
              <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
                <h2 className="text-lg font-bold">Order summary</h2>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 text-stone-600">
                    <span>Subtotal</span>
                    <span className="font-semibold text-stone-900">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4 text-stone-600">
                    <span>Shipping</span>
                    <span>At checkout</span>
                  </div>

                  <div className="flex justify-between gap-4 text-stone-600">
                    <span>Tax</span>
                    <span>At checkout</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-5">
                  <span className="font-bold">Subtotal</span>

                  <span className="text-xl font-bold">
                    {formatINR(subtotal)}
                  </span>
                </div>

                {hasUnavailableItems && (
                  <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-800">
                    Remove unavailable items before proceeding to checkout.
                  </p>
                )}

                {syncError && (
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Verify current prices and stock before proceeding.
                  </p>
                )}

                <button
                  type="button"
                  disabled={
                    loading ||
                    Boolean(syncError) ||
                    hasUnavailableItems ||
                    items.length === 0
                  }
                  onClick={() => window.location.assign("/checkout")}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-4 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  Proceed to checkout
                  <ArrowRight size={17} />
                </button>

                <p className="mt-3 text-center text-xs leading-5 text-stone-500">
                  Online payment integration will be added separately.
                </p>
              </section>

              <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <Truck size={20} className="mt-0.5 shrink-0 text-red-700" />

                  <div>
                    <p className="text-sm font-semibold">
                      Delivery information
                    </p>

                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      Delivery charges and estimates will be confirmed during
                      checkout.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={20}
                    className="mt-0.5 shrink-0 text-red-700"
                  />

                  <div>
                    <p className="text-sm font-semibold">Payment information</p>

                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      The approved payment gateway will be connected in a later
                      step.
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>

      <StorefrontFooter />
    </main>
  );
}

function PackagePlaceholder() {
  return (
    <div className="text-center text-xs text-stone-400">
      Product image unavailable
    </div>
  );
}
