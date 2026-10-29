"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Heart,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { supabase } from "@/lib/supabase/client";

type ProductImage = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock_quantity: number;
  options: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  dimensions_cm: Record<string, string | number | null>;
  weight_kg: number | null;
  is_customisable: boolean;
  is_featured: boolean;
  categories: { name: string } | null;
  product_images: ProductImage[];
  product_variants: ProductVariant[];
};

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
};

const CART_KEY = "calvin-aatamaker-cart";

function storageImageUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return supabase.storage.from("product-media").getPublicUrl(path).data
    .publicUrl;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function variantDescription(variant: ProductVariant) {
  const options = Object.entries(variant.options ?? {})
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);

  return options.length
    ? `${variant.name} · ${options.join(" · ")}`
    : variant.name;
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [savedForLater, setSavedForLater] = useState(false);

  const loadProduct = useCallback(async () => {
    if (!slug) return;

    setLoading(true);
    setError("");
    setProduct(null);
    setSelectedImage(0);
    setSelectedVariantId("");
    setQuantity(1);

    try {
      const { data, error: queryError } = await supabase
        .from("products")
        .select(
          `
          id,
          category_id,
          name,
          slug,
          sku,
          short_description,
          description,
          price,
          compare_at_price,
          stock_quantity,
          dimensions_cm,
          weight_kg,
          is_customisable,
          is_featured,
          categories(name),
          product_images(
            id,
            storage_path,
            alt_text,
            is_primary,
            sort_order
          ),
          product_variants(
            id,
            name,
            sku,
            price,
            stock_quantity,
            options,
            is_active,
            sort_order
          )
        `,
        )
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (queryError) {
        console.error("Product details query failed:", queryError.message);
        setError("We couldn't load this product. Please try again.");
        return;
      }

      if (!data) {
        setError("This product is unavailable or could not be found.");
        return;
      }

      const item = data as unknown as Product;

      item.product_images = (item.product_images ?? []).sort((a, b) => {
        if (a.is_primary !== b.is_primary) {
          return a.is_primary ? -1 : 1;
        }

        return a.sort_order - b.sort_order;
      });

      item.product_variants = (item.product_variants ?? [])
        .filter((variant) => variant.is_active)
        .sort((a, b) => a.sort_order - b.sort_order);

      setProduct(item);
    } catch (err) {
      console.error("Unable to load product:", err);
      setError("Something went wrong while loading this product.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const images = useMemo(() => {
    if (!product) return [];

    return product.product_images.map((image) => ({
      id: image.id,
      url: storageImageUrl(image.storage_path),
      alt: image.alt_text || product.name,
    }));
  }, [product]);

  const selectedVariant =
    product?.product_variants.find(
      (variant) => variant.id === selectedVariantId,
    ) ?? null;

  const currentPrice = selectedVariant?.price ?? product?.price ?? 0;

  const currentStock = selectedVariant
    ? selectedVariant.stock_quantity
    : (product?.stock_quantity ?? 0);

  const isAvailable = currentStock > 0;
  const visibleImage = images[selectedImage];

  function addToCart() {
    if (!product || !isAvailable || adding) return;

    setAdding(true);
    setCartMessage("");

    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed)) {
        throw new Error("The saved cart is invalid.");
      }

      const cart = parsed as CartItem[];
      const itemId = `${product.id}:${selectedVariant?.id ?? "default"}`;

      const existingIndex = cart.findIndex((item) => item.id === itemId);

      const currentQuantity =
        existingIndex >= 0 ? Number(cart[existingIndex].quantity) || 0 : 0;

      if (currentQuantity + quantity > currentStock) {
        setCartMessage(
          `Only ${currentStock} unit(s) are currently available for this selection.`,
        );
        return;
      }

      const cartItem: CartItem = {
        id: itemId,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: visibleImage?.url ?? null,
        unitPrice: Number(currentPrice),
        quantity,
        variantId: selectedVariant?.id ?? null,
        variantName: selectedVariant?.name ?? null,
        sku: selectedVariant?.sku ?? product.sku,
      };

      if (existingIndex >= 0) {
        cart[existingIndex] = {
          ...cart[existingIndex],
          ...cartItem,
          quantity: currentQuantity + quantity,
        };
      } else {
        cart.push(cartItem);
      }

      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      window.dispatchEvent(new Event("calvin-cart-updated"));

      setCartMessage(`${product.name} added to your cart.`);
    } catch (err) {
      console.error("Unable to update cart:", err);
      setCartMessage("We couldn't update your cart. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#faf8f4]">
        <StorefrontHeader />

        <div className="flex min-h-[50vh] items-center justify-center px-5">
          <div className="text-center">
            <LoaderCircle
              size={30}
              className="mx-auto animate-spin text-red-700"
            />
            <p className="mt-4 text-sm text-stone-500">
              Loading product details…
            </p>
          </div>
        </div>

        <StorefrontFooter />
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="min-h-screen bg-[#faf8f4]">
        <StorefrontHeader />

        <div className="flex min-h-[50vh] items-center justify-center px-5 py-12">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <Package size={38} className="mx-auto text-stone-300" />

            <h1 className="mt-4 text-2xl font-bold">Product unavailable</h1>

            <p className="mt-2 text-sm leading-6 text-stone-500">
              {error || "This product is not available right now."}
            </p>

            <button
              type="button"
              onClick={() => void loadProduct()}
              className="mt-5 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>

            <Link
              href="/products"
              className="mt-4 block text-sm font-semibold text-red-700"
            >
              Back to all products
            </Link>
          </div>
        </div>

        <StorefrontFooter />
      </main>
    );
  }

  const dimensions = product.dimensions_cm ?? {};

  const specifications = [
    { label: "Height", value: dimensions.height, unit: "cm" },
    { label: "Width", value: dimensions.width, unit: "cm" },
    { label: "Depth", value: dimensions.depth, unit: "cm" },
    {
      label: "Weight",
      value: product.weight_kg,
      unit: "kg",
    },
    {
      label: "Product SKU",
      value: selectedVariant?.sku ?? product.sku,
      unit: "",
    },
  ].filter(
    (item) =>
      item.value !== null &&
      item.value !== undefined &&
      String(item.value).trim() !== "",
  );

  return (
    <main className="min-h-screen bg-[#faf8f4] text-stone-900">
      <StorefrontHeader />

      <div className="mx-auto max-w-7xl px-5 py-7 sm:py-10">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 transition hover:text-red-700"
        >
          <ArrowLeft size={16} />
          Back to Aatamakers
        </Link>

        <div className="mt-6 grid items-start gap-9 lg:grid-cols-2 lg:gap-14">
          {/* Product image gallery and specifications */}
          <section>
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-stone-200 bg-white p-5 sm:p-10">
              {visibleImage ? (
                <Image
                  key={visibleImage.id}
                  src={visibleImage.url}
                  alt={visibleImage.alt}
                  width={900}
                  height={900}
                  unoptimized
                  priority
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center text-stone-300">
                  <Package size={64} />
                  <p className="mt-3 text-sm">No product image available</p>
                </div>
              )}

              {product.is_featured && (
                <span className="absolute left-5 top-5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">
                  Featured product
                </span>
              )}
            </div>

            {images.length > 1 && (
              <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedImage(index)}
                    aria-label={`View image ${index + 1}`}
                    aria-pressed={selectedImage === index}
                    className={`flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-white p-2 ${
                      selectedImage === index
                        ? "border-red-700 ring-2 ring-red-100"
                        : "border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    <Image
                      src={image.url}
                      alt={image.alt}
                      width={160}
                      height={160}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold">Product specifications</h2>

              {specifications.length > 0 ? (
                <dl className="mt-4 divide-y divide-stone-100">
                  {specifications.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <dt className="text-stone-500">{item.label}</dt>

                      <dd className="text-right font-semibold text-stone-900">
                        {item.value} {item.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-500">
                  Detailed specifications will be added by the store team.
                </p>
              )}
            </div>
          </section>

          {/* Product information and purchase controls */}
          <section className="lg:sticky lg:top-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">
              {product.categories?.name ?? "Calvin Aatamaker"}
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {product.name}
            </h1>

            {product.short_description && (
              <p className="mt-4 text-base leading-7 text-stone-600">
                {product.short_description}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-end gap-3">
              <span className="text-3xl font-bold">
                {formatINR(Number(currentPrice))}
              </span>

              {product.compare_at_price !== null &&
                Number(product.compare_at_price) > Number(currentPrice) && (
                  <span className="pb-1 text-base text-stone-400 line-through">
                    {formatINR(Number(product.compare_at_price))}
                  </span>
                )}
            </div>

            {product.compare_at_price !== null &&
              Number(product.compare_at_price) > Number(currentPrice) && (
                <p className="mt-2 text-sm font-semibold text-emerald-700">
                  Save{" "}
                  {formatINR(
                    Number(product.compare_at_price) - Number(currentPrice),
                  )}
                </p>
              )}

            <div className="mt-5 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isAvailable ? "bg-emerald-500" : "bg-red-500"
                }`}
              />

              <span
                className={`text-sm font-semibold ${
                  isAvailable ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {isAvailable
                  ? currentStock <= 5
                    ? `Only ${currentStock} left in stock`
                    : "In stock and available to order"
                  : "Currently out of stock"}
              </span>
            </div>

            {product.sku && (
              <p className="mt-2 text-xs text-stone-400">
                Product code: {product.sku}
              </p>
            )}

            {product.product_variants.length > 0 && (
              <div className="mt-7">
                <label
                  htmlFor="product-variant"
                  className="mb-2 block text-sm font-semibold"
                >
                  Select model or variant
                </label>

                <div className="relative">
                  <select
                    id="product-variant"
                    value={selectedVariantId}
                    onChange={(event) => {
                      setSelectedVariantId(event.target.value);
                      setQuantity(1);
                      setCartMessage("");
                    }}
                    className="w-full appearance-none rounded-xl border border-stone-300 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100"
                  >
                    <option value="">Choose an option</option>

                    {product.product_variants.map((variant) => (
                      <option
                        key={variant.id}
                        value={variant.id}
                        disabled={variant.stock_quantity <= 0}
                      >
                        {variantDescription(variant)}
                        {variant.stock_quantity <= 0 ? " — Out of stock" : ""}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={17}
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-500"
                  />
                </div>
              </div>
            )}

            <div className="mt-7">
              <label className="mb-2 block text-sm font-semibold">
                Quantity
              </label>

              <div className="flex h-12 w-36 items-center justify-between rounded-xl border border-stone-300 bg-white px-2">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-stone-100 disabled:opacity-30"
                >
                  <Minus size={16} />
                </button>

                <span className="text-sm font-semibold">{quantity}</span>

                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={quantity >= currentStock}
                  onClick={() =>
                    setQuantity((value) => Math.min(currentStock, value + 1))
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-stone-100 disabled:opacity-30"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {product.product_variants.length > 0 && !selectedVariant && (
              <p className="mt-3 text-xs text-stone-500">
                Choose an available model or variant to continue.
              </p>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={addToCart}
                disabled={
                  !isAvailable ||
                  adding ||
                  (product.product_variants.length > 0 && !selectedVariant)
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-4 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {adding ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <ShoppingBag size={18} />
                )}

                {adding
                  ? "Adding to cart…"
                  : isAvailable
                    ? "Add to cart"
                    : "Out of stock"}
              </button>

              <button
                type="button"
                aria-pressed={savedForLater}
                aria-label={
                  savedForLater ? "Remove from wishlist" : "Save to wishlist"
                }
                onClick={() => setSavedForLater((value) => !value)}
                className={`flex items-center justify-center rounded-xl border px-4 py-3 transition ${
                  savedForLater
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <Heart
                  size={19}
                  fill={savedForLater ? "currentColor" : "none"}
                />
              </button>
            </div>

            {cartMessage && (
              <div
                role="status"
                className={`mt-4 rounded-xl border p-3 text-sm ${
                  cartMessage.includes("added")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {cartMessage}

                {cartMessage.includes("added") && (
                  <Link
                    href="/cart"
                    className="ml-2 inline-flex items-center gap-1 font-bold underline"
                  >
                    View cart <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            )}

            <div className="mt-6 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Truck size={20} className="mt-0.5 shrink-0 text-red-700" />

                <div>
                  <p className="text-sm font-semibold">Delivery information</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Delivery charges and estimates are confirmed at checkout.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={20}
                  className="mt-0.5 shrink-0 text-red-700"
                />

                <div>
                  <p className="text-sm font-semibold">Secure checkout</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Payment options will be shown during checkout.
                  </p>
                </div>
              </div>
            </div>

            {product.is_customisable && (
              <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">
                  Personalisation planned for this product
                </p>

                <p className="mt-1 text-xs leading-5 text-red-700">
                  The custom photo editor is still being developed. Customer
                  artwork ordering will be enabled when the personalisation
                  studio is ready.
                </p>
              </div>
            )}

            <div className="mt-8 border-t border-stone-200 pt-6">
              <h2 className="text-lg font-bold">About this product</h2>

              <div className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-600">
                {product.description ||
                  product.short_description ||
                  "More product information will be added soon."}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-10 border-t border-stone-200 pt-5">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-900"
          >
            <ArrowLeft size={16} />
            Continue shopping
          </Link>
        </div>
      </div>

      <StorefrontFooter />
    </main>
  );
}
