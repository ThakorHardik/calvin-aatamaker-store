"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  images?: string[];
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

/**
 * Interactive Product Card Gallery with progressive angle hover,
 * touch swipe support, and smooth crossfades.
 */
function ProductCardGallery({
  product,
}: {
  product: RealProduct;
}) {
  const galleryImages = useMemo(() => {
    if (product.images && product.images.length > 0) {
      return product.images;
    }
    return [product.image];
  }, [product.images, product.image]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Auto-cycle through gallery images progressively while hovered
  useEffect(() => {
    if (!isHovered || galleryImages.length <= 1) return;

    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % galleryImages.length);
    }, 1800);

    return () => clearInterval(interval);
  }, [isHovered, galleryImages.length]);

  // Handle cursor scrubbing across horizontal slices of the card
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (galleryImages.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const segment = Math.min(
      galleryImages.length - 1,
      Math.max(0, Math.floor((x / rect.width) * galleryImages.length))
    );
    if (segment !== activeIdx) {
      setActiveIdx(segment);
    }
  }

  // Handle pointer enter/leave
  function handleMouseEnter() {
    setIsHovered(true);
  }

  function handleMouseLeave() {
    setIsHovered(false);
    setActiveIdx(0); // Return to primary product image
  }

  // Touch swipe support for mobile
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || galleryImages.length <= 1) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) > 40) {
      if (deltaX > 0) {
        // Swiped right -> previous image
        setActiveIdx((prev) => (prev > 0 ? prev - 1 : galleryImages.length - 1));
      } else {
        // Swiped left -> next image
        setActiveIdx((prev) => (prev + 1) % galleryImages.length);
      }
    }
    touchStartX.current = null;
  }

  return (
    <div
      className="relative block aspect-[4/3] w-full overflow-hidden bg-[#FAF8F5] select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Product Status Badges (Top Left) */}
      <div className="absolute left-3.5 top-3.5 z-20 flex flex-wrap gap-1.5 pointer-events-none">
        {product.is_featured && (
          <span className="rounded-full bg-[#141211] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
            Featured
          </span>
        )}
        {product.is_customisable && (
          <span className="rounded-full border border-[#D9B88F] bg-[#FAF2E8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8C6239] shadow-xs">
            Customisable
          </span>
        )}
      </div>

      {/* Multi-angle Indicator Badge (Top Right) */}
      {galleryImages.length > 1 && (
        <div className="absolute right-3.5 top-3.5 z-20 rounded-full border border-[#EAE3D8] bg-white/90 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-[#5E5854] shadow-xs pointer-events-none transition-opacity duration-200">
          <span>
            {activeIdx + 1} / {galleryImages.length}
          </span>
        </div>
      )}

      {/* Stacked Images for Smooth Crossfade */}
      <Link
        href={`/products/${product.slug}`}
        aria-label={`View ${product.name} details`}
        className="block h-full w-full"
      >
        {galleryImages.map((src, idx) => (
          <div
            key={`${src}-${idx}`}
            className={`absolute inset-0 transition-opacity duration-300 ease-out ${
              idx === activeIdx
                ? "opacity-100 z-10"
                : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            <Image
              src={src}
              alt={`${product.name} view ${idx + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-contain p-6 sm:p-8 transition-transform duration-500 ease-out group-hover:scale-105"
              priority={idx === 0}
            />
          </div>
        ))}
      </Link>

      {/* Touch/Hover Navigation Arrows (for multiple images) */}
      {galleryImages.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous angle"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveIdx((prev) =>
                prev > 0 ? prev - 1 : galleryImages.length - 1
              );
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#141211] shadow-md transition hover:bg-white active:scale-95 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            aria-label="Next angle"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveIdx((prev) => (prev + 1) % galleryImages.length);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#141211] shadow-md transition hover:bg-white active:scale-95 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <ChevronRight size={16} />
          </button>

          {/* Discreet Position Indicator Dots (Bottom Center) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/80 backdrop-blur-xs shadow-xs pointer-events-none">
            {galleryImages.map((_, dotIdx) => (
              <span
                key={dotIdx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  dotIdx === activeIdx
                    ? "w-4 bg-[#141211]"
                    : "w-1.5 bg-[#DED6CB]"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* Arrow Down-Right Action Link Icon */}
      <span className="absolute bottom-3.5 right-3.5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE3D8] bg-white text-[#141211] shadow-sm transition-all duration-200 group-hover:border-[#BD2031] group-hover:bg-[#BD2031] group-hover:text-white pointer-events-none">
        <ArrowDownRight size={17} />
      </span>
    </div>
  );
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
      className="relative overflow-hidden bg-[#FAF7F2] px-5 py-16 sm:py-20 lg:py-24"
      aria-labelledby="collection-heading"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-[#D9B88F]/30 bg-[#141211] px-5 py-3.5 text-xs font-semibold text-white shadow-2xl transition animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
          <Link
            href="/cart"
            className="ml-2 rounded-lg bg-[#BD2031] px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-[#991B2B]"
          >
            View Cart
          </Link>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        {/* Editorial Heading */}
        <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#BD2031]">
              <span className="h-px w-8 bg-[#BD2031]" />
              THE CALVIN COLLECTION
            </div>

            <h2
              id="collection-heading"
              className="mt-4 font-editorial text-4xl font-normal leading-[1.08] tracking-[-0.02em] text-[#141211] sm:text-5xl lg:text-6xl"
            >
              Thoughtful by design.
              <br />
              <span className="italic text-[#BD2031]">
                Made for your home.
              </span>
            </h2>
          </div>

          <div className="lg:justify-self-end lg:pb-1">
            <p className="max-w-md text-sm leading-relaxed text-[#5E5854] sm:text-base">
              Discover domestic Aatamakers designed around everyday Indian
              kitchens. Natural stone-ground flour, continuous cooling, and
              compact elegance.
            </p>

            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 border-b border-[#BD2031] pb-1.5 text-sm font-semibold text-[#BD2031] transition-all hover:gap-3 hover:text-[#991B2B]"
            >
              Explore the full collection
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>

        {/* Collection Toolbar */}
        <div className="mt-10 flex flex-col gap-4 border-y border-[#EAE3D8] py-4 sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter products"
          >
            <button
              type="button"
              aria-pressed={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                activeCategory === "all"
                  ? "bg-[#141211] text-white shadow-sm"
                  : "border border-[#DED6CB] bg-white text-[#5E5854] hover:border-[#141211] hover:text-[#141211]"
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
                className={`rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                  activeCategory === cat.id
                    ? "bg-[#141211] text-white shadow-sm"
                    : "border border-[#DED6CB] bg-white text-[#5E5854] hover:border-[#141211] hover:text-[#141211]"
                }`}
              >
                {cat.name}
              </button>
            ))}

            <button
              type="button"
              aria-pressed={activeCategory === "customisable"}
              onClick={() => setActiveCategory("customisable")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                activeCategory === "customisable"
                  ? "bg-[#141211] text-white shadow-sm"
                  : "border border-[#DED6CB] bg-white text-[#5E5854] hover:border-[#141211] hover:text-[#141211]"
              }`}
            >
              Customisable
            </button>
          </div>

          <label className="flex w-full items-center gap-2.5 rounded-full border border-[#DED6CB] bg-white px-4 py-2 text-sm sm:max-w-[260px]">
            <Search size={16} className="shrink-0 text-[#8A827D]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search aatamakers..."
              aria-label="Search aatamakers"
              className="w-full bg-transparent text-xs text-[#141211] outline-none placeholder:text-[#8A827D]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-[11px] font-medium text-[#8A827D] hover:text-[#141211]"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {/* Product Cards Grid */}
        <div className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-[#EAE3D8] bg-white p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-[#8A827D]" />
              <h3 className="mt-4 font-display text-lg font-bold text-[#141211]">
                No matching aatamakers found
              </h3>
              <p className="mt-2 text-sm text-[#5E5854]">
                Try adjusting your search terms or category selection.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveCategory("all");
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#141211] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#BD2031]"
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
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#EAE3D8] bg-white shadow-[0_2px_6px_rgba(20,18,17,0.03)] transition-all duration-300 hover:border-[#D9B88F] hover:shadow-[0_12px_28px_rgba(20,18,17,0.08)]"
                >
                  {/* Interactive Multi-angle Photo Gallery */}
                  <ProductCardGallery product={product} />

                  {/* Product Details */}
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#BD2031]">
                      {product.category_name || "Domestic Aatamaker"}
                    </span>

                    <Link href={`/products/${product.slug}`}>
                      <h3 className="mt-1.5 font-display text-lg font-semibold text-[#141211] transition-colors group-hover:text-[#BD2031]">
                        {product.name}
                      </h3>
                    </Link>

                    {product.short_description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#5E5854]">
                        {product.short_description}
                      </p>
                    )}

                    {/* Dimensions strip if available */}
                    {dimensions &&
                      typeof dimensions === "object" &&
                      (dimensions.height || dimensions.width) && (
                        <div className="mt-3.5 flex flex-wrap gap-1.5 text-[11px] text-[#5E5854]">
                          {dimensions.height && (
                            <span className="rounded-md bg-[#F5EFE6] px-2 py-0.5">
                              H: {String(dimensions.height)}cm
                            </span>
                          )}
                          {dimensions.width && (
                            <span className="rounded-md bg-[#F5EFE6] px-2 py-0.5">
                              W: {String(dimensions.width)}cm
                            </span>
                          )}
                          {dimensions.depth && (
                            <span className="rounded-md bg-[#F5EFE6] px-2 py-0.5">
                              D: {String(dimensions.depth)}cm
                            </span>
                          )}
                        </div>
                      )}

                    {/* Price and Cart Action */}
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#F5EFE6] pt-4">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-xl font-bold text-[#141211]">
                            {formatINR(Number(product.price))}
                          </span>
                          {product.compare_at_price &&
                            Number(product.compare_at_price) >
                              Number(product.price) && (
                              <span className="text-xs text-[#8A827D] line-through">
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
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#141211] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#BD2031] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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

          {/* Personalisation Callout Card - Editorial Showpiece */}
          <article
            id="personalise"
            className="relative isolate flex min-h-[380px] flex-col justify-between overflow-hidden rounded-2xl border border-[#D9B88F]/40 bg-[#141211] p-6 text-white shadow-[0_8px_24px_rgba(20,18,17,0.14)] sm:p-8"
          >
            {/* Subtle warm ambient lighting */}
            <div
              className="absolute inset-0 -z-10 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 90% 70% at 85% 15%, rgba(217, 184, 143, 0.22) 0%, transparent 65%), linear-gradient(160deg, #1f1b19 0%, #141211 60%, #0d0c0b 100%)",
              }}
            />

            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D9B88F]/40 bg-[#FAF7F2]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#D9B88F]">
                <Sparkles size={13} className="text-[#D9B88F]" />
                <span>Made Personal</span>
              </span>
              <ArrowDownRight size={20} className="text-[#D9B88F]" />
            </div>

            <div className="my-auto py-6">
              <h3 className="font-editorial text-2xl sm:text-3xl font-normal tracking-tight text-white">
                Personalise your Aatamaker
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#EDE0CF]">
                Add custom family motifs, door front finishes, or bespoke
                engraving to seamlessly match your modular kitchen.
              </p>
            </div>

            <Link
              href="/products?customisable=true"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D9B88F] px-5 py-3 text-xs font-bold text-[#141211] shadow-sm transition-all duration-200 hover:bg-[#EDE0CF]"
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
