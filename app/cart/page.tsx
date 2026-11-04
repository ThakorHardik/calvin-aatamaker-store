"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Minus,
  Plus,
  Rotate3d,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { supabase } from "@/lib/supabase/client";
import {
  CART_UPDATED_EVENT,
  readSavedCart,
  saveCart,
} from "@/lib/cart";
import type { CartItem } from "@/types/cart";
import { computeCustomizationPriceDelta, type ProductCustomizationConfig } from "@/types/customization";
import { resolveCustomizationAssetUrl } from "@/lib/3d/storage-assets";

type DbProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  customization_config?: ProductCustomizationConfig | null;
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

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [notice, setNotice] = useState("");
  const isInternalUpdateRef = useRef(false);

  const loadCart = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    }
    setSyncError("");

    const savedItems = readSavedCart();

    if (savedItems.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const productIds = [...new Set(savedItems.map((item) => item.productId))];

      let productData: DbProduct[] | null = null;
      let productError: { message: string } | null = null;

      const initialCartRes = await supabase
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
            customization_config,
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

      if (initialCartRes.error && initialCartRes.error.message.includes("customization_config")) {
        console.warn("customization_config column pending migration, querying base product columns for cart:", initialCartRes.error.message);
        const retryCartRes = await supabase
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
        productData = (retryCartRes.data ?? []) as unknown as DbProduct[];
        productError = retryCartRes.error;
      } else {
        productData = (initialCartRes.data ?? []) as unknown as DbProduct[];
        productError = initialCartRes.error;
      }

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
            "We couldn't verify your machine options. Please retry before checkout.",
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
            unavailableReason: "This machine is no longer available.",
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
              unavailableReason: "This machine option is no longer available.",
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

        // Keep the image selected by the shopper or fall back to primary
        const preservedImage =
          item.image ||
          (primaryImage ? productImageUrl(primaryImage.storage_path) : null);

        const baseUnitPrice = price;
        let customDelta = 0;
        if (item.customisationDetails && Object.keys(item.customisationDetails).length > 0) {
          customDelta = computeCustomizationPriceDelta(product.customization_config, item.customisationDetails);
          price = baseUnitPrice + customDelta;
        }

        return {
          ...item,
          name: product.name,
          slug: product.slug,
          unitPrice: price,
          baseUnitPrice,
          customisationPriceDelta: customDelta,
          sku: currentSku ?? item.sku,
          variantName: currentVariantName ?? item.variantName,
          image: preservedImage,
          availableStock: stock,
          unavailable: stock <= 0,
          unavailableReason: stock <= 0 ? "Currently out of stock." : undefined,
          // Explicitly preserve 3D personalization attributes
          isCustomized: item.isCustomized,
          designId: item.designId,
          modelCode: item.modelCode,
          modelVersion: item.modelVersion,
          surfaceKey: item.surfaceKey,
          customPreviewUrl: item.customPreviewUrl,
          designSnapshot: item.designSnapshot,
          customizationMode: item.customizationMode,
          customisationDetails: item.customisationDetails ?? null,
        };
      });

      setItems(refreshedItems);
      isInternalUpdateRef.current = true;
      saveCart(refreshedItems);
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 150);
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
    void loadCart(true);

    const handleCartUpdate = () => {
      if (isInternalUpdateRef.current) return;
      void loadCart(false);
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    window.addEventListener("storage", handleCartUpdate);

    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdate);
      window.removeEventListener("storage", handleCartUpdate);
    };
  }, [loadCart]);

  function changeQuantity(itemId: string, nextQuantity: number) {
    setNotice("");
    if (nextQuantity < 1) return;

    setItems((currentItems) => {
      let stockExceeded = false;
      const updatedItems = currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        if (
          item.availableStock !== undefined &&
          nextQuantity > item.availableStock
        ) {
          stockExceeded = true;
          return item;
        }

        return {
          ...item,
          quantity: nextQuantity,
        };
      });

      if (stockExceeded) {
        const target = currentItems.find((it) => it.id === itemId);
        setNotice(
          `Only ${target?.availableStock ?? 0} unit(s) are currently available.`,
        );
        return currentItems;
      }

      isInternalUpdateRef.current = true;
      saveCart(updatedItems);
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 150);
      return updatedItems;
    });
  }

  function removeItem(itemId: string) {
    setNotice("");
    setItems((currentItems) => {
      const updatedItems = currentItems.filter((item) => item.id !== itemId);
      isInternalUpdateRef.current = true;
      saveCart(updatedItems);
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 150);
      setNotice("Machine removed from your cart.");
      return updatedItems;
    });
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
            Review your machines and options before proceeding to checkout.
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
            Verifying machines and live inventory…
          </div>
        ) : items.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-stone-200 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-700">
              <ShoppingBag size={28} />
            </div>

            <h2 className="mt-5 text-2xl font-bold">Your cart is empty</h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
              Explore our premium domestic flour mills and add an Aatamaker that suits your home.
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
                      className="relative flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f5f2ed] p-3 sm:h-36 sm:w-36"
                    >
                      {item.customPreviewUrl ? (
                        <div className="relative h-full w-full flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveCustomizationAssetUrl(item.customPreviewUrl)}
                            alt={`${item.name} custom 3D machine preview`}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = "none";
                              const fallback = target.parentElement?.querySelector(".custom-preview-fallback") as HTMLElement | null;
                              if (fallback) fallback.style.display = "flex";
                            }}
                          />
                          <div className="custom-preview-fallback hidden absolute inset-0 flex-col items-center justify-center p-2 text-center bg-stone-100 text-stone-500 rounded-lg">
                            <Rotate3d size={20} className="text-stone-400 mb-1" />
                            <span className="text-[10px] font-medium leading-tight text-stone-600">
                              Preview unavailable — reopen studio
                            </span>
                          </div>
                          <span className="absolute bottom-1 right-1 rounded-md bg-amber-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
                            Custom 3D
                          </span>
                        </div>
                      ) : item.isCustomized ? (
                        <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center bg-stone-100 text-stone-500 rounded-lg">
                          <Rotate3d size={20} className="text-stone-400 mb-1" />
                          <span className="text-[10px] font-medium leading-tight text-stone-600">
                            Preview unavailable — reopen studio
                          </span>
                        </div>
                      ) : item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={240}
                          height={240}
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
                          Option: <span className="font-medium text-stone-800">{item.variantName}</span>
                        </p>
                      )}

                      {item.sku && (
                        <p className="mt-1 text-xs text-stone-500">
                          SKU: {item.sku}
                        </p>
                      )}

                      {/* Customization callout with detailed breakdown */}
                      {item.customisationDetails &&
                        Object.keys(item.customisationDetails).length > 0 && (
                          <div className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/60 p-3 text-xs text-amber-950 space-y-2">
                            <div className="flex items-center justify-between font-bold text-amber-900 text-[11px] uppercase tracking-wider pb-1.5 border-b border-amber-200/50">
                              <span className="flex items-center gap-1.5">
                                <Sparkles size={12} className="text-amber-700" />
                                Bespoke 3D Personalisation
                              </span>
                              {item.customisationPriceDelta && item.customisationPriceDelta > 0 ? (
                                <span className="font-mono text-amber-800 font-semibold">
                                  +{formatINR(item.customisationPriceDelta)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-700 font-medium">Included</span>
                              )}
                            </div>

                            {/* Summary description if generated */}
                            {typeof item.customisationDetails._customization_summary === "string" && (
                              <p className="text-[11px] text-stone-700 font-medium leading-relaxed italic">
                                {item.customisationDetails._customization_summary}
                              </p>
                            )}

                            {/* Demonstration prototype notice */}
                            {(item.customizationMode === "demonstration" || item.customisationDetails._mode === "demonstration") && (
                              <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100/70 px-2 py-1 text-[10px] text-amber-900 font-medium">
                                <AlertCircle size={12} className="shrink-0 text-amber-700" />
                                <span>Visual Demonstration Prototype (Provisional Dimensions: 480 × 340 × 880 mm)</span>
                              </div>
                            )}

                            {/* Option fields grid (filtered from system metadata keys starting with _) */}
                            {Object.entries(item.customisationDetails).filter(([k]) => !k.startsWith("_")).length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] pt-0.5">
                                {Object.entries(item.customisationDetails)
                                  .filter(([k, v]) => !k.startsWith("_") && v !== null && v !== "" && v !== undefined)
                                  .map(([k, v]) => (
                                    <div key={k} className="truncate">
                                      <span className="text-stone-500 capitalize">{k.replace(/_/g, " ")}: </span>
                                      <span className="font-semibold text-stone-900">{String(v)}</span>
                                    </div>
                                  ))}
                              </div>
                            )}

                            <div className="pt-1 flex items-center justify-between border-t border-amber-200/40">
                              <Link
                                href={`/products/${item.slug}/customize?editDesignId=${item.designId || ""}${item.variantId ? `&variant=${item.variantId}` : ""}`}
                                className="text-[11px] font-semibold text-[#b91f32] hover:underline inline-flex items-center gap-1"
                              >
                                Review or edit personalisation in studio →
                              </Link>
                              {item.modelCode && (
                                <span className="text-[10px] text-stone-400 font-mono">
                                  Model: {item.modelCode}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                      {item.unavailable ? (
                        <p className="mt-3 text-sm font-semibold text-red-700">
                          {item.unavailableReason}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm font-semibold text-emerald-700">
                          In stock ({item.availableStock ?? 0} available)
                        </p>
                      )}

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex h-10 items-center rounded-xl border border-stone-300">
                          <button
                            type="button"
                            data-testid={`btn-decrease-qty-${item.id}`}
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
                            data-testid={`btn-increase-qty-${item.id}`}
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
                        data-testid={`btn-remove-item-${item.id}`}
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
                    <span>Delivery</span>
                    <span className="font-semibold text-emerald-700">FREE</span>
                  </div>

                  <div className="flex justify-between gap-4 text-stone-600">
                    <span>GST (Included)</span>
                    <span className="font-semibold text-stone-900">₹0 extra</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-stone-200 pt-5">
                  <span className="font-bold">Total Amount</span>

                  <span className="text-xl font-bold text-red-700">
                    {formatINR(subtotal)}
                  </span>
                </div>

                {hasUnavailableItems && (
                  <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-800">
                    Please remove out-of-stock items before proceeding to checkout.
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
                  Secure checkout with instant order confirmation.
                </p>
              </section>

              <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <Truck size={20} className="mt-0.5 shrink-0 text-red-700" />

                  <div>
                    <p className="text-sm font-semibold">
                      Fast pan-India delivery
                    </p>

                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      Carefully packaged and insured courier delivery directly to your doorstep.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={20}
                    className="mt-0.5 shrink-0 text-red-700"
                  />

                  <div>
                    <p className="text-sm font-semibold">1-Year Brand Warranty</p>

                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      Authentic CALVIN AATAMAKER warranty and customer support.
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
