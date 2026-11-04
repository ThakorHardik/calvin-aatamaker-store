"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, RefreshCw, Home } from "lucide-react";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const rawMessage = searchParams.get("message");

  const message =
    rawMessage ||
    "The authentication link you clicked is invalid, has already been used, or has expired. For your security, authentication and password reset links are single-use and time-limited.";

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 sm:py-24">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm text-center sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-700">
          <AlertCircle className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Verification Link Expired
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:text-base">
          {message}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
          >
            <span>Go to Sign In</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/login?mode=forgot"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4 text-stone-500" />
            <span>Request New Reset Link</span>
          </Link>

          <Link
            href="/"
            className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Return to storefront homepage</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />
      <main className="flex-1 flex items-center justify-center">
        <Suspense
          fallback={
            <div className="py-20 text-center text-sm text-stone-500">
              Loading error details...
            </div>
          }
        >
          <AuthErrorContent />
        </Suspense>
      </main>
      <StorefrontFooter />
    </div>
  );
}
