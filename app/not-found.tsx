import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 py-16 text-center">
      <span className="rounded-full bg-red-100 px-3 py-1 font-mono text-xs font-bold uppercase text-red-700">
        404 — Not Found
      </span>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
        Page Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-stone-600">
        The requested page or machine record could not be located on the CALVIN store.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-red-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-red-800 transition"
        >
          Return to Homepage
        </Link>
        <Link
          href="/products"
          className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition"
        >
          Browse Products
        </Link>
      </div>
    </div>
  );
}
