"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  Package,
  Plus,
} from "lucide-react";
import { generateCartItemId, readSavedCart, saveCart } from "@/lib/cart";
import type { CartItem } from "@/types/cart";
import type { RealProduct } from "@/components/homepage-product-collection";

interface CategoryProductGridProps {
  products: RealProduct[];
  categoryName: string;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CategoryProductGrid({
  products,
  categoryName,
}: CategoryProductGridProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-[#EAE3D8] bg-white p-12 text-center">
        <Package className="mx-auto h-12 w-12 text-[#8A827D]" />
        <h2 className="mt-4 font-display text-xl font-bold text-[#141211]">
          No products in {categoryName} yet
        </h2>
        <p className="mt-2 text-sm text-[#5E5854]">
          Products are being curated for this collection. Explore our full catalog
          below.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#141211] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#BD2031]"
        >
          <span>Browse All Models</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div>
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

      {/* Product Cards Grid */}
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const dimensions = product.dimensions_cm ?? {};
          const isAvailable = product.stock_quantity > 0;

          return (
            <article
              key={product.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[#EAE3D8] bg-white shadow-[0_2px_6px_rgba(20,18,17,0.03)] transition-all duration-300 hover:border-[#D9B88F] hover:shadow-[0_12px_28px_rgba(20,18,17,0.08)]"
            >
              {/* Photo Area */}
              <Link
                href={`/products/${product.slug}`}
                className="relative block aspect-square overflow-hidden bg-[#FAF8F5]"
              >
                <div className="absolute left-3.5 top-3.5 z-10 flex flex-wrap gap-1.5">
                  {product.is_featured && (
                    <span className="rounded-full bg-[#141211] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Featured
                    </span>
                  )}
                  {product.is_customisable && (
                    <span className="rounded-full border border-[#D9B88F] bg-[#FAF2E8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8C6239]">
                      Customisable
                    </span>
                  )}
                </div>

                <Image
                  src={product.image}
                  alt={`${product.name} photo`}
                  width={600}
                  height={600}
                  className="h-full w-full object-contain p-6 sm:p-8 transition-transform duration-500 ease-out group-hover:scale-105"
                />

                <span className="absolute bottom-3.5 right-3.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE3D8] bg-white text-[#141211] shadow-2xs transition-all duration-200 group-hover:border-[#BD2031] group-hover:bg-[#BD2031] group-hover:text-white">
                  <ArrowDownRight size={17} />
                </span>
              </Link>

              {/* Product Details */}
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#BD2031]">
                  {product.category_name}
                </span>

                <Link href={`/products/${product.slug}`}>
                  <h3 className="mt-1.5 font-display text-lg font-bold text-[#141211] transition-colors group-hover:text-[#BD2031]">
                    {product.name}
                  </h3>
                </Link>

                {product.short_description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#5E5854]">
                    {product.short_description}
                  </p>
                )}

                {/* Dimensions */}
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
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#141211] px-4 py-2.5 text-xs font-semibold text-white shadow-2xs transition-all duration-200 hover:bg-[#BD2031] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={15} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
