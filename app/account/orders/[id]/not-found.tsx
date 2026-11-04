import Link from "next/link";
import { PackageX, ArrowLeft, ShoppingBag } from "lucide-react";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

export default function OrderNotFound() {
  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />

      <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
        <div className="w-full max-w-md text-center rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <PackageX className="h-7 w-7" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Order Not Found
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            This order could not be found or does not belong to your account.
            Please verify the order number or return to your order history.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/account"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-stone-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to My Account</span>
            </Link>

            <Link
              href="/products"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              <ShoppingBag className="h-4 w-4 text-stone-500" />
              <span>Browse Aatamakers</span>
            </Link>
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}

