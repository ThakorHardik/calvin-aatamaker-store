"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  Package,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { generateCartItemId, readSavedCart, saveCart } from "@/lib/cart";
import type { CartItem } from "@/types/cart";

export type RealProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  dimensions_cm: Record<string, string | number | null> | null;
  weight_kg: number | null;
  is_customisable: boolean;
  is_featured: boolean;
  category_name?: string;
  category_slug?: string;
  category_id?: string | null;
  image: string;
};

export type RealCategory = {
  id: string;
  name: string;
  slug: string;
  image_path?: string | null;
};

type HomepageProductCollectionProps = {
  products: RealProduct[];
  categories: RealCategory[];
};

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function HomepageProductCollection({
  products,
  categories,
}: HomepageProductCollectionProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter products based on active category and search
  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const searchableText = `${product.name} ${product.category_name ?? ""} ${
        product.description
      } ${product.sku ?? ""}`.toLowerCase();

      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery);

      const matchesCategory =
        activeCategory === "all" ||
        (activeCategory === "customisable"
          ? product.is_customisable
          : product.category_id === activeCategory ||
            product.category_slug === activeCategory);

      return matchesQuery && matchesCategory;
    });
  }, [products, query, activeCategory]);

  function addToCart(product: RealProduct) {
    try {
      const cart = readSavedCart();
      const itemId = generateCartItemId(product.id, null, null);
      const existingIndex = cart.findIndex((item) => item.id === itemId);

      const currentQty =
        existingIndex >= 0 ? Number(cart[existingIndex].quantity) || 0 : 0;

      if (currentQty + 1 > product.stock_quantity) {
        showToast(
          `Only ${product.stock_quantity} unit(s) available for this model.`
        );
        return;
      }

      const cartItem: CartItem = {
        id: itemId,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        unitPrice: Number(product.price),
        quantity: currentQty + 1,
        variantId: null,
        variantName: null,
        sku: product.sku,
        customisationDetails: null,
      };

      if (existingIndex >= 0) {
        cart[existingIndex] = cartItem;
      } else {
        cart.push(cartItem);
      }

      saveCart(cart);
      showToast(`${product.name} added to cart`);
    } catch {
      showToast("Unable to update cart. Please try again.");
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }

  return (
    <section
      id="shop"
      className="relative overflow-hidden bg-[#f8f5ef] px-5 py-16 sm:py-20 lg:py-28"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-stone-900 px-5 py-3.5 text-xs font-semibold text-white shadow-2xl transition animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <Link
            href="/cart"
            className="ml-2 rounded-lg bg-red-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-800 transition"
          >
            View Cart
          </Link>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        {/* Editorial Heading */}
        <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#b91f32]">
              <span className="h-px w-8 bg-[#b91f32]" />
              THE CALVIN COLLECTION
            </div>

            <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#211d1c] sm:text-5xl lg:text-6xl font-display">
              Thoughtful by design.
              <br />
              <span className="font-normal italic text-[#b91f32]">
                Made for your home.
              </span>
            </h2>
          </div>

          <div className="lg:justify-self-end lg:pb-1">
            <p className="max-w-md text-sm leading-7 text-stone-600 sm:text-base">
              Discover domestic Aatamakers designed around everyday Indian
              kitchens. Natural stone-ground flour, continuous cooling, and
              compact elegance.
            </p>

            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 border-b border-[#b91f32] pb-2 text-sm font-semibold text-[#a51c2d] transition hover:gap-3"
            >
              Explore the full collection
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>

        {/* Collection Toolbar */}
        <div className="mt-10 flex flex-col gap-5 border-y border-stone-300 py-5 sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter products"
          >
            <button
              type="button"
              aria-pressed={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              className={`rounded-full px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
                activeCategory === "all"
                  ? "bg-[#261f1e] text-white"
                  : "border border-stone-300 bg-transparent text-stone-600 hover:border-stone-500 hover:text-stone-900"
              }`}
            >
              All products
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`rounded-full px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
                  activeCategory === cat.id
                    ? "bg-[#261f1e] text-white"
                    : "border border-stone-300 bg-transparent text-stone-600 hover:border-stone-500 hover:text-stone-900"
                }`}
              >
                {cat.name}
              </button>
            ))}

            <button
              type="button"
              aria-pressed={activeCategory === "customisable"}
              onClick={() => setActiveCategory("customisable")}
              className={`rounded-full px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
                activeCategory === "customisable"
                  ? "bg-[#261f1e] text-white"
                  : "border border-stone-300 bg-transparent text-stone-600 hover:border-stone-500 hover:text-stone-900"
              }`}
            >
              Customisable
            </button>
          </div>

          <label className="flex w-full items-center gap-3 border-b border-stone-300 pb-2 sm:max-w-[245px]">
            <Search size={18} className="shrink-0 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search aatamakers..."
              aria-label="Search aatamakers"
              className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs text-stone-500 hover:text-stone-900"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {/* Product Cards Grid */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-stone-200 bg-white p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-stone-300" />
              <h3 className="mt-4 font-display text-lg font-bold text-stone-900">
                No matching aatamakers found
              </h3>
              <p className="mt-2 text-sm text-stone-500">
                Try adjusting your search terms or category selection.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveCategory("all");
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-stone-800 transition"
              >
                Reset filters
              </button>
            </div>
          ) : (
            visibleProducts.map((product) => {
              const dimensions = product.dimensions_cm ?? {};
              const isAvailable = product.stock_quantity > 0;

              return (
                <article
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-[22px] border border-stone-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* Photo area */}
                  <Link
                    href={`/products/${product.slug}`}
                    className="relative block aspect-square bg-[#fbf9f5] overflow-hidden"
                  >
                    <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-1.5">
                      {product.is_featured && (
                        <span className="rounded-full bg-stone-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                          Featured
                        </span>
                      )}
                      {product.is_customisable && (
                        <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                          Customisable
                        </span>
                      )}
                    </div>

                    <Image
                      src={product.image}
                      alt={`${product.name} photo`}
                      width={600}
                      height={600}
                      className="h-full w-full object-contain p-6 sm:p-8 transition duration-500 ease-out group-hover:scale-105"
                    />

                    <span className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-800 shadow-sm transition group-hover:bg-[#b91f32] group-hover:text-white">
                      <ArrowDownRight size={17} />
                    </span>
                  </Link>

                  {/* Product Details */}
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b91f32]">
                      {product.category_name || "Domestic Aatamaker"}
                    </span>

                    <Link href={`/products/${product.slug}`}>
                      <h3 className="mt-1.5 font-display text-lg font-bold text-stone-900 transition hover:text-[#b91f32]">
                        {product.name}
                      </h3>
                    </Link>

                    {product.short_description && (
                      <p className="mt-2 text-xs leading-5 text-stone-600 line-clamp-2">
                        {product.short_description}
                      </p>
                    )}

                    {/* Dimensions strip if available */}
                    {dimensions &&
                      typeof dimensions === "object" &&
                      (dimensions.height || dimensions.width) && (
                        <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] text-stone-500">
                          {dimensions.height && (
                            <span className="rounded-md bg-stone-100 px-2 py-0.5">
                              H: {String(dimensions.height)}cm
                            </span>
                          )}
                          {dimensions.width && (
                            <span className="rounded-md bg-stone-100 px-2 py-0.5">
                              W: {String(dimensions.width)}cm
                            </span>
                          )}
                          {dimensions.depth && (
                            <span className="rounded-md bg-stone-100 px-2 py-0.5">
                              D: {String(dimensions.depth)}cm
                            </span>
                          )}
                        </div>
                      )}

                    {/* Price and Cart Action */}
                    <div className="mt-auto pt-5 border-t border-stone-100 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-xl font-bold text-stone-900">
                            {formatINR(Number(product.price))}
                          </span>
                          {product.compare_at_price &&
                            Number(product.compare_at_price) >
                              Number(product.price) && (
                              <span className="text-xs text-stone-400 line-through">
                                {formatINR(Number(product.compare_at_price))}
                              </span>
                            )}
                        </div>
                        <span
                          className={`mt-0.5 block text-[10px] font-medium ${
                            isAvailable ? "text-emerald-700" : "text-red-700"
                          }`}
                        >
                          {isAvailable
                            ? `In Stock (${product.stock_quantity})`
                            : "Out of Stock"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        disabled={!isAvailable}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#b91f32] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={15} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}

          {/* Personalisation Callout Card */}
          <article
            id="personalise"
            className="relative isolate flex min-h-[380px] flex-col justify-between overflow-hidden rounded-[22px] bg-[#8f1727] p-6 text-white sm:p-8"
          >
            <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_80%_10%,rgba(224,87,95,0.8),transparent_48%),linear-gradient(145deg,#bd2033_0%,#971829_58%,#701420_100%)]" />

            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ffe4ac]">
                <Sparkles size={13} />
                <span>Made Personal</span>
              </span>
              <ArrowDownRight size={20} className="text-[#ffe4ac]" />
            </div>

            <div className="my-auto py-6">
              <h3 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Personalise your Aatamaker
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#ffd8dc]">
                Add custom family motifs, door front finishes, or bespoke
                engraving to seamlessly match your modular kitchen.
              </p>
            </div>

            <Link
              href="/products?customisable=true"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-bold text-[#8f1727] shadow-sm transition hover:bg-[#fff0f2]"
            >
              <span>Explore Custom Models</span>
              <ArrowRight size={14} />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
