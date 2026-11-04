"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Wheat,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { supabase } from "@/lib/supabase/client";

type Category = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
};

type ProductImage = {
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
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
  is_customisable: boolean;
  is_featured: boolean;
  sort_order: number;
  categories: {
    id?: string;
    name: string;
    slug?: string;
  } | null;
  product_images: ProductImage[];
};

type SortOption = "featured" | "price-low" | "price-high" | "name";
type PriceFilter = "all" | "under-20k" | "20k-30k" | "above-30k";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getProductImage(product: Product): string | null {
  const images = [...(product.product_images ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) {
      return a.is_primary ? -1 : 1;
    }
    return a.sort_order - b.sort_order;
  });

  const image = images[0];
  if (!image?.storage_path) return null;

  if (/^https?:\/\//i.test(image.storage_path)) {
    return image.storage_path;
  }

  const clean = image.storage_path
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/product-media\//, "")
    .replace(/^product-media\//, "");

  return supabase.storage.from("product-media").getPublicUrl(clean).data
    .publicUrl;
}

function ProductsContent() {
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState(searchParams.get("search") ?? "");
  const [activeCategory, setActiveCategory] = useState(
    searchParams.get("category") ?? "all"
  );
  const [priceRange, setPriceRange] = useState<PriceFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [customisableOnly, setCustomisableOnly] = useState(
    searchParams.get("customisable") === "true"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [categoryResult, productResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, slug, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),

        supabase
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
            is_customisable,
            is_featured,
            sort_order,
            categories(id, name, slug),
            product_images(
              storage_path,
              alt_text,
              is_primary,
              sort_order
            )
          `
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ]);

      if (productResult.error) {
        throw new Error("We couldn't load the products. Please try again.");
      }

      setProducts((productResult.data ?? []) as unknown as Product[]);

      if (categoryResult.error) {
        setCategories([]);
      } else {
        setCategories((categoryResult.data ?? []) as Category[]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading the catalogue."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts, refreshKey]);

  // Sync state if URL changes
  useEffect(() => {
    const cat = searchParams.get("category");
    if (cat) setActiveCategory(cat);

    const s = searchParams.get("search");
    if (s !== null) setQuery(s);

    const cust = searchParams.get("customisable");
    if (cust === "true") setCustomisableOnly(true);
  }, [searchParams]);

  // Filter and sort products
  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const searchableText = [
        product.name,
        product.sku ?? "",
        product.short_description ?? "",
        product.description ?? "",
        product.categories?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery);

      // Match category by ID or by slug
      const matchesCategory =
        activeCategory === "all" ||
        (activeCategory === "customisable"
          ? product.is_customisable
          : product.category_id === activeCategory ||
            product.categories?.slug === activeCategory);

      const matchesCustomisation = !customisableOnly || product.is_customisable;

      // Price range filtering
      const price = Number(product.price) || 0;
      const matchesPrice =
        priceRange === "all" ||
        (priceRange === "under-20k" && price < 20000) ||
        (priceRange === "20k-30k" && price >= 20000 && price <= 30000) ||
        (priceRange === "above-30k" && price > 30000);

      return (
        matchesQuery &&
        matchesCategory &&
        matchesCustomisation &&
        matchesPrice
      );
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "price-low":
          return Number(a.price) - Number(b.price);

        case "price-high":
          return Number(b.price) - Number(a.price);

        case "name":
          return a.name.localeCompare(b.name);

        case "featured":
        default:
          if (a.is_featured !== b.is_featured) {
            return a.is_featured ? -1 : 1;
          }
          return a.sort_order - b.sort_order;
      }
    });
  }, [products, query, activeCategory, customisableOnly, priceRange, sortBy]);

  function clearFilters() {
    setQuery("");
    setActiveCategory("all");
    setPriceRange("all");
    setCustomisableOnly(false);
    setSortBy("featured");

    window.history.replaceState({}, "", "/products");
  }

  const hasActiveFilters =
    query !== "" ||
    activeCategory !== "all" ||
    priceRange !== "all" ||
    customisableOnly ||
    sortBy !== "featured";

  return (
    <>
      <section className="border-b border-stone-200 bg-[#f5efe5]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:py-16 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b91f32]">
            CALVIN AATAMAKER · THE COLLECTION
          </p>

          <div className="mt-4 grid gap-6 md:grid-cols-[1fr_340px] md:items-end">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl font-display">
                A better way to bring
                <br className="hidden sm:block" />{" "}
                <span className="text-[#b91f32]">freshness home.</span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
                Explore our collection of domestic aatamakers. Natural
                stone-ground flour, continuous cooling, and durable engineering
                made for everyday Indian kitchens.
              </p>
            </div>

            <div className="flex items-center gap-3 border-t border-stone-300 pt-5 md:justify-end md:border-t-0 md:pt-0">
              <Wheat size={26} strokeWidth={1.4} className="text-[#b91f32]" />
              <div>
                <p className="text-sm font-semibold">Made for Indian homes</p>
                <p className="mt-1 text-xs text-stone-500">
                  Thoughtful design for everyday living
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12">
        {/* Search & Header Strip */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b91f32]">
              FIND YOUR AATAMAKER
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl font-display">
              Shop the collection
            </h2>

            <p className="mt-2 text-sm text-stone-500">
              {loading
                ? "Loading the latest collection..."
                : `${visibleProducts.length} ${
                    visibleProducts.length === 1 ? "product" : "products"
                  } available`}
            </p>
          </div>

          <label className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 focus-within:border-[#b91f32] lg:max-w-sm">
            <Search size={18} className="shrink-0 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-stone-400"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="text-xs font-semibold text-stone-500 hover:text-[#b91f32]"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-7 flex flex-col gap-5 border-y border-stone-200 py-5">
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                activeCategory === "all"
                  ? "border-[#b91f32] bg-[#b91f32] text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-[#b91f32]"
              }`}
            >
              All products
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.slug || category.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  activeCategory === category.slug ||
                  activeCategory === category.id
                    ? "border-[#b91f32] bg-[#b91f32] text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:border-[#b91f32]"
                }`}
              >
                {category.name}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setActiveCategory("customisable");
                setCustomisableOnly(false);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                activeCategory === "customisable"
                  ? "border-[#b91f32] bg-[#b91f32] text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-[#b91f32]"
              }`}
            >
              Personalisation
            </button>
          </div>

          {/* Secondary Controls: Price, Customisable, Sorting */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-4">
              {/* Price Filter */}
              <label className="flex items-center gap-2 text-xs font-medium text-stone-600">
                <span>Price:</span>
                <select
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value as PriceFilter)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#b91f32]"
                >
                  <option value="all">All Prices</option>
                  <option value="under-20k">Under ₹20,000</option>
                  <option value="20k-30k">₹20,000 – ₹30,000</option>
                  <option value="above-30k">Above ₹30,000</option>
                </select>
              </label>

              {/* Customisable Only */}
              <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customisableOnly}
                  onChange={(event) =>
                    setCustomisableOnly(event.target.checked)
                  }
                  className="h-4 w-4 rounded accent-[#b91f32]"
                />
                <span>Customisable only</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800 transition"
                >
                  <RotateCcw size={13} />
                  <span>Clear all filters</span>
                </button>
              )}

              {/* Sorting */}
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <SlidersHorizontal size={14} className="text-stone-500" />
                <span className="sr-only">Sort products</span>
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as SortOption)
                  }
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#b91f32]"
                >
                  <option value="featured">Featured first</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-red-800">
              Unable to load the catalogue
            </p>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              className="mt-4 rounded-lg bg-[#b91f32] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991b2b]"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && !error && (
          <div
            className="grid grid-cols-1 gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading products"
          >
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="animate-pulse overflow-hidden rounded-2xl border border-stone-200 bg-white"
              >
                <div className="aspect-[4/3] bg-stone-200" />
                <div className="space-y-3 p-5">
                  <div className="h-3 w-1/3 rounded bg-stone-200" />
                  <div className="h-5 w-3/4 rounded bg-stone-200" />
                  <div className="h-4 w-full rounded bg-stone-200" />
                  <div className="h-4 w-1/2 rounded bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Grid */}
        {!loading && !error && visibleProducts.length > 0 && (
          <div className="grid grid-cols-1 gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => {
              const image = getProductImage(product);
              const inStock = product.stock_quantity > 0;

              return (
                <article
                  key={product.id}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-stone-300 hover:shadow-lg"
                >
                  <Link
                    href={`/products/${product.slug}`}
                    className="block"
                    aria-label={`View ${product.name}`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#f3eee6]">
                      {image ? (
                        <Image
                          src={image}
                          alt={
                            product.product_images?.find(
                              (item) => item.is_primary
                            )?.alt_text || product.name
                          }
                          width={800}
                          height={600}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
                          <Wheat size={36} strokeWidth={1.2} />
                          <span className="text-xs font-medium">
                            Product image coming soon
                          </span>
                        </div>
                      )}

                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        {product.is_featured && (
                          <span className="rounded-full bg-stone-900 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                            Featured
                          </span>
                        )}

                        {product.is_customisable && (
                          <span className="rounded-full bg-[#b91f32] px-3 py-1.5 text-[11px] font-semibold text-white">
                            Personalise
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#b91f32]">
                        {product.categories?.name ?? "Aatamaker"}
                      </p>

                      <h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-stone-900 transition group-hover:text-[#b91f32] font-display">
                        {product.name}
                      </h3>

                      <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-stone-600">
                        {product.short_description ||
                          product.description ||
                          "Discover product details, features and specifications."}
                      </p>
                    </div>
                  </Link>

                  <div className="mt-auto px-5 pb-5 sm:px-6 sm:pb-6">
                    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-stone-100 pt-4">
                      <div>
                        <p className="text-xs text-stone-500">Price</p>

                        <div className="mt-1 flex flex-wrap items-baseline gap-2">
                          <strong className="text-xl font-semibold tracking-tight font-display">
                            {formatINR(Number(product.price) || 0)}
                          </strong>

                          {product.compare_at_price !== null &&
                            Number(product.compare_at_price) >
                              Number(product.price) && (
                              <span className="text-sm text-stone-400 line-through">
                                {formatINR(Number(product.compare_at_price))}
                              </span>
                            )}
                        </div>
                      </div>

                      <span
                        className={`text-xs font-semibold ${
                          inStock ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {inStock ? "In stock" : "Out of stock"}
                      </span>
                    </div>

                    <Link
                      href={`/products/${product.slug}`}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#b91f32] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#991b2b]"
                    >
                      <span>View product</span>
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && visibleProducts.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center sm:py-24">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3e8e8] text-[#b91f32]">
              <Search size={24} />
            </span>

            <h3 className="mt-5 text-xl font-semibold font-display">
              No products found
            </h3>

            <p className="mt-2 max-w-md text-sm leading-6 text-stone-500">
              No products match your current search or filters. Try adjusting
              your search term, price range, or category.
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold hover:border-[#b91f32] hover:text-[#b91f32] transition"
            >
              <Check size={16} />
              <span>Clear all filters</span>
            </button>
          </div>
        )}
      </section>
    </>
  );
}

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-[#faf8f4] text-stone-900">
      <StorefrontHeader />
      <Suspense
        fallback={
          <div className="py-24 text-center text-sm text-stone-500">
            Loading collection...
          </div>
        }
      >
        <ProductsContent />
      </Suspense>
      <StorefrontFooter />
    </main>
  );
}
