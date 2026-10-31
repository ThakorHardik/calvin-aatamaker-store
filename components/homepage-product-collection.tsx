"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  Plus,
  Search,
  Sparkles,
  Wheat,
} from "lucide-react";

import { formatINR, type Product } from "@/lib/mock-data";

type HomepageProductCollectionProps = {
  products: Product[];
  query: string;
  setQuery: (value: string) => void;
  activeFilter: string;
  setActiveFilter: (value: string) => void;
  addToCart: (product: Product) => void;
  showToast: (message: string) => void;
  loading?: boolean;
  error?: string;
};

export default function HomepageProductCollection({
  products,
  query,
  setQuery,
  activeFilter,
  setActiveFilter,
  addToCart,
  showToast,
  loading = false,
  error = "",
}: HomepageProductCollectionProps) {
  return (
    <section
      id="shop"
      className="relative overflow-hidden bg-[#f8f5ef] px-5 py-16 sm:py-20 lg:py-28"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#b91f32]">
              <span className="h-px w-8 bg-[#b91f32]" />
              THE CALVIN COLLECTION
            </div>

            <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#211d1c] sm:text-5xl lg:text-6xl">
              Thoughtful by design.
              <br />
              <span className="font-normal italic text-[#b91f32]">
                Made for your home.
              </span>
            </h2>
          </div>

          <div className="lg:justify-self-end lg:pb-1">
            <p className="max-w-md text-sm leading-7 text-stone-600 sm:text-base">
              Discover domestic Aatamakers designed around everyday kitchens.
              Explore product details, compare available options and find a
              model that suits your home.
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

        <div className="mt-10 flex flex-col gap-5 border-y border-stone-300 py-5 sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter products"
          >
            {["All products", "Customisable"].map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={activeFilter === filter}
                onClick={() => setActiveFilter(filter)}
                className={
                  "rounded-full px-4 py-2.5 text-xs font-semibold transition sm:text-sm " +
                  (activeFilter === filter
                    ? "bg-[#261f1e] text-white"
                    : "border border-stone-300 bg-transparent text-stone-600 hover:border-stone-500 hover:text-stone-900")
                }
              >
                {filter}
              </button>
            ))}
          </div>

          <label className="flex w-full items-center gap-3 border-b border-stone-300 pb-2 sm:max-w-[245px]">
            <Search size={17} className="shrink-0 text-stone-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find your Aatamaker"
              aria-label="Search collection"
              className="w-full min-w-0 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="text-xs font-semibold text-[#b91f32]"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {loading ? (
          <div
            className="mt-7 grid gap-5 lg:grid-cols-2 lg:gap-6"
            aria-label="Loading products"
          >
            {[0, 1].map((item) => (
              <div
                key={item}
                className="animate-pulse overflow-hidden rounded-[22px] border border-stone-200 bg-white"
              >
                <div className="aspect-[4/3] bg-stone-200" />
                <div className="space-y-3 p-6">
                  <div className="h-3 w-1/3 rounded bg-stone-200" />
                  <div className="h-6 w-2/3 rounded bg-stone-200" />
                  <div className="h-4 w-full rounded bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-800"
          >
            {error}
          </div>
        ) : products.length > 0 ? (
          <div className="mt-7 grid items-stretch gap-5 lg:grid-cols-2 lg:gap-6">
            {products.map((product, index) => (
              <article
                key={product.id}
                className="group flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-stone-200/80 bg-white transition duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_22px_65px_rgba(42,28,22,0.09)]"
              >
                <Link
                  href={"/products/" + product.slug}
                  aria-label={"View " + product.name}
                  className="block"
                >
                  <div className="relative isolate aspect-[4/3] overflow-hidden bg-[#eee5d8]">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,255,255,0.9),rgba(238,229,216,0.15)_66%)]" />

                    <div className="absolute left-5 top-5 z-10 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-800 backdrop-blur-sm">
                        {product.badge || "The collection"}
                      </span>

                      {index === 0 && (
                        <span className="rounded-full bg-[#b91f32] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                          Discover
                        </span>
                      )}
                    </div>

                    <Image
                      src={product.image}
                      alt={product.name + " product photo"}
                      width={900}
                      height={900}
                      className="relative z-0 h-full w-full object-contain p-7 transition duration-500 ease-out group-hover:scale-[1.035] sm:p-10"
                    />

                    <span className="absolute bottom-5 left-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#b91f32]" />
                      Product details
                    </span>

                    <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-stone-800 transition group-hover:bg-[#b91f32] group-hover:text-white">
                      <ArrowDownRight size={19} />
                    </span>
                  </div>
                </Link>

                <div className="flex flex-1 flex-col p-5 sm:p-7">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b91f32]">
                    {product.category}
                  </div>

                  <Link href={"/products/" + product.slug}>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#211d1c] transition hover:text-[#b91f32] sm:text-2xl">
                      {product.name}
                    </h3>
                  </Link>

                  <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500">
                    {product.description}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      { label: "H", value: product.dimensions.height },
                      { label: "W", value: product.dimensions.width },
                      { label: "D", value: product.dimensions.depth },
                    ].map((dimension) => (
                      <span
                        key={dimension.label}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#f7f3ed] px-3 py-2 text-xs text-stone-600"
                      >
                        <span className="font-bold text-[#b91f32]">
                          {dimension.label}
                        </span>
                        {dimension.value}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-stone-100 pt-5">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-400">
                        Price
                      </span>
                      <strong className="mt-1 block text-2xl font-semibold tracking-tight text-[#211d1c]">
                        {formatINR(product.price)}
                      </strong>
                      <span className="mt-1 block text-[10px] leading-4 text-stone-400">
                        {product.stock > 0
                          ? product.stock + " available"
                          : "Currently unavailable"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={product.stock < 1}
                      aria-label={
                        product.stock > 0
                          ? "Add " + product.name + " to cart"
                          : product.name + " is out of stock"
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#b91f32] px-4 text-xs font-bold text-white transition hover:bg-[#94192a] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 sm:px-5 sm:text-sm"
                    >
                      <Plus size={17} />
                      {product.stock > 0 ? "Add to cart" : "Out of stock"}
                    </button>
                  </div>
                </div>
              </article>
            ))}

            <article
              id="personalise"
              className="relative isolate flex min-h-[490px] flex-col overflow-hidden rounded-[22px] bg-[#8f1727] p-6 text-white sm:p-9 lg:min-h-[unset]"
            >
              <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_80%_10%,rgba(224,87,95,0.8),transparent_48%),linear-gradient(145deg,#bd2033_0%,#971829_58%,#701420_100%)]" />
              <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full border border-white/10" />
              <div className="absolute -right-8 top-8 -z-10 h-52 w-52 rounded-full border border-white/10" />
              <div className="absolute -bottom-32 -left-20 -z-10 h-80 w-80 rounded-full border border-white/10" />

              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.19em] text-[#ffe4ac]">
                  <Sparkles size={15} />
                  Made personal
                </span>
                <ArrowDownRight size={22} className="text-[#ffe4ac]" />
              </div>

              <div className="flex flex-1 flex-col justify-center py-8">
                <div className="flex justify-center">
                  <div className="relative flex h-36 w-28 rotate-[-5deg] flex-col items-center justify-center border-[5px] border-[#e8b55d] bg-[#ab1d2f] shadow-[0_18px_45px_rgba(39,0,5,0.22)] transition duration-500 group-hover:rotate-0">
                    <Wheat
                      size={44}
                      strokeWidth={1.2}
                      className="text-[#fff1cb]"
                    />
                    <span className="mt-3 text-center text-[10px] font-bold uppercase leading-4 tracking-[0.2em] text-[#fff1cb]">
                      MADE
                      <br />
                      BY YOU
                    </span>
                  </div>
                  <span className="ml-3 mt-2 text-2xl text-[#f4c873]">✳</span>
                </div>

                <div className="mt-10 max-w-lg">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffe4ac]">
                    YOUR DESIGN, YOUR STORY
                  </div>
                  <h3 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                    Aatamaker,
                    <br />
                    <span className="font-normal italic text-[#ffd28a]">
                      with your touch.
                    </span>
                  </h3>
                  <p className="mt-4 max-w-md text-sm leading-7 text-white/80">
                    A product personalisation studio is planned for selected
                    models. Customers will be able to preview their own artwork
                    on the front panel before placing an order.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      showToast(
                        "The personalisation studio is our next development phase.",
                      )
                    }
                    className="mt-6 inline-flex items-center gap-3 rounded-full bg-[#fff4dd] px-5 py-3.5 text-xs font-bold text-[#841628] transition hover:bg-white sm:text-sm"
                  >
                    Personalisation studio
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/20 pt-4 text-[9px] font-semibold uppercase tracking-[0.19em] text-white/60">
                <span>CALVIN / PERSONAL STUDIO</span>
                <span>COMING NEXT</span>
              </div>
            </article>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center rounded-2xl border border-stone-200 bg-white px-5 py-16 text-center">
            <Search size={28} className="text-stone-400" />
            <h3 className="mt-4 text-xl font-semibold text-stone-900">
              {query || activeFilter !== "All products"
                ? "No matching Aatamakers"
                : "Our collection is being prepared"}
            </h3>
            <p className="mt-2 text-sm text-stone-500">
              {query || activeFilter !== "All products"
                ? "Try another search or show all available products."
                : "Published products will appear here as soon as they are ready."}
            </p>
            {(query || activeFilter !== "All products") && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveFilter("All products");
                }}
                className="mt-5 rounded-full bg-[#b91f32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#94192a]"
              >
                Show all products
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
