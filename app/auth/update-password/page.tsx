"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  LoaderCircle,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Verify that an active session or recovery token exists
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (isMounted) {
          if (user) {
            setHasValidSession(true);
          } else {
            setHasValidSession(false);
          }
          setCheckingSession(false);
        }
      } catch {
        if (isMounted) {
          setHasValidSession(false);
          setCheckingSession(false);
        }
      }
    }

    checkAuth();

    // Listen for auth state changes (e.g. PASSWORD_RECOVERY event)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isMounted && session?.user) {
        setHasValidSession(true);
        setCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message || "Failed to update password. Please try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />

      <main className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
            {checkingSession ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <LoaderCircle className="h-8 w-8 animate-spin text-stone-400" />
                <p className="mt-4 text-sm text-stone-500">
                  Verifying your reset session...
                </p>
              </div>
            ) : !hasValidSession ? (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <AlertCircle className="h-7 w-7" aria-hidden="true" />
                </div>
                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-stone-900">
                  Session Not Found or Expired
                </h1>
                <p className="mt-3 text-sm text-stone-600 leading-relaxed">
                  Your password reset link is invalid or has expired. Please request
                  a new password reset link.
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <Link
                    href="/login?mode=forgot"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    Request New Reset Link
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            ) : success ? (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                </div>
                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-stone-900">
                  Password Updated
                </h1>
                <p className="mt-3 text-sm text-stone-600 leading-relaxed">
                  Your password has been changed successfully. You can now use your
                  new password to access your Calvin Aatamaker account.
                </p>
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={() => router.push("/account")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
                  >
                    <span>Proceed to My Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
                    <Lock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-stone-900">
                    Set New Password
                  </h1>
                  <p className="mt-2 text-sm text-stone-600">
                    Enter and confirm your new secure password below.
                  </p>
                </div>

                {error && (
                  <div
                    className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                    role="alert"
                  >
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-xs font-semibold tracking-wide uppercase text-stone-700"
                    >
                      New Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-700"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-xs font-semibold tracking-wide uppercase text-stone-700"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-700"
                        aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showConfirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
                    >
                      {loading ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          <span>Updating password...</span>
                        </>
                      ) : (
                        <>
                          <span>Update Password</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-stone-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Secure 256-bit encrypted authentication</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}

