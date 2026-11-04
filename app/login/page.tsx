"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
  User,
  Wheat,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

type AuthMode = "signin" | "register" | "forgot";

/**
 * Validates redirect destination to prevent open-redirect vulnerabilities.
 */
function sanitizeRedirect(path: string | null): string {
  if (!path) return "/account";
  if (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\") &&
    !path.includes("\\")
  ) {
    return path;
  }
  return "/account";
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawMode = searchParams.get("mode");
  const initialMode: AuthMode =
    rawMode === "register"
      ? "register"
      : rawMode === "forgot"
      ? "forgot"
      : "signin";

  const nextParam = searchParams.get("next");
  const targetNext = sanitizeRedirect(nextParam);

  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingExistingSession, setCheckingExistingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // On mount, check if customer is already signed in
  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (isMounted) {
          if (user) {
            router.replace(targetNext);
            return;
          }
          setCheckingExistingSession(false);
        }
      } catch {
        if (isMounted) {
          setCheckingExistingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [supabase, router, targetNext]);

  // Keep query param in sync with tab when changed manually
  function handleModeChange(newMode: AuthMode) {
    setError(null);
    setSuccessNotice(null);
    setMode(newMode);
  }

  // Handle Sign In submission
  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Please enter both your email address and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (signInError) {
        if (signInError.message.toLowerCase().includes("invalid login")) {
          setError(
            "Incorrect email or password. Please verify your credentials or reset your password."
          );
        } else if (
          signInError.message.toLowerCase().includes("email not confirmed")
        ) {
          setError(
            "Your email address has not been confirmed yet. Please check your inbox for the confirmation link."
          );
        } else {
          setError(signInError.message);
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        // Refresh router cache and navigate to target destination
        router.refresh();
        router.push(targetNext);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setLoading(false);
    }
  }

  // Handle Registration submission
  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError("Please enter your full name.");
      return;
    }

    if (!cleanEmail) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify your password entry.");
      return;
    }

    setLoading(true);

    try {
      // Direct redirect URL through callback to target
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        targetNext
      )}`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (signUpError) {
        if (
          signUpError.message.toLowerCase().includes("already registered") ||
          signUpError.message.toLowerCase().includes("already exists")
        ) {
          setError(
            "An account with this email address already exists. Please sign in or use password reset."
          );
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      // If user session is returned immediately (e.g. email confirmations disabled in dev), redirect
      if (data.session) {
        router.refresh();
        router.push(targetNext);
        return;
      }

      // If Supabase requires email verification
      setSuccessNotice(
        `Account created successfully! We sent a confirmation link to ${cleanEmail}. Please click the link to confirm your account and sign in.`
      );
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      setLoading(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setLoading(false);
    }
  }

  // Handle Forgot Password submission
  async function handleForgotPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter the email address associated with your account.");
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/auth/callback?next=/auth/update-password`;

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: redirectUrl,
        });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSuccessNotice(
        `If an account exists for ${cleanEmail}, you will receive a password reset link shortly. Please check your inbox and spam folder.`
      );
      setLoading(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setLoading(false);
    }
  }

  if (checkingExistingSession) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-stone-400" />
        <p className="mt-4 text-sm text-stone-500">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
            <Wheat className="h-6 w-6" aria-hidden="true" />
          </div>

          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            {mode === "signin"
              ? "Customer Sign In"
              : mode === "register"
              ? "Create Your Account"
              : "Reset Your Password"}
          </h1>

          <p className="mt-2 text-sm text-stone-600">
            {mode === "signin"
              ? "Access your Calvin Aatamaker order history and profile"
              : mode === "register"
              ? "Register to track orders and save your delivery details"
              : "Enter your account email to receive a secure recovery link"}
          </p>
        </div>

        {/* Tab Switcher for Sign In / Register */}
        {mode !== "forgot" && (
          <div className="mt-6 flex rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => handleModeChange("signin")}
              className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition ${
                mode === "signin"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("register")}
              className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition ${
                mode === "register"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              New Customer
            </button>
          </div>
        )}

        {/* Success Alert */}
        {successNotice && (
          <div
            className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
            role="status"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="leading-relaxed">{successNotice}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* SIGN IN FORM */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="signin-email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Email Address
              </label>
              <div className="relative mt-1.5">
                <input
                  id="signin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                />
                <Mail className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-stone-400" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="signin-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => handleModeChange("forgot")}
                  className="text-xs font-medium text-red-700 hover:text-red-800 transition hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative mt-1.5">
                <input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
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

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* REGISTRATION FORM */}
        {mode === "register" && (
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="register-name"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Full Name
              </label>
              <div className="relative mt-1.5">
                <input
                  id="register-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rajesh Sharma"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                />
                <User className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-stone-400" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Email Address
              </label>
              <div className="relative mt-1.5">
                <input
                  id="register-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                />
                <Mail className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-stone-400" />
              </div>
            </div>

            <div>
              <label
                htmlFor="register-password"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
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
                htmlFor="register-confirm"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Confirm Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="register-confirm"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-700"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? (
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
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {mode === "forgot" && (
          <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Your Account Email
              </label>
              <div className="relative mt-1.5">
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 pr-10 text-sm text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100"
                />
                <Mail className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-stone-400" />
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
                    <span>Sending reset link...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    <span>Send Password Reset Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => handleModeChange("signin")}
                className="text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
              >
                Remember your password? Return to Sign In
              </button>
            </div>
          </form>
        )}

        {/* Trust & Security Badge */}
        <div className="mt-8 border-t border-stone-100 pt-5 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-stone-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Encrypted customer authentication powered by Supabase</span>
          </div>

          <div className="mt-2 text-[11px] text-stone-400">
            Need administrator access?{" "}
            <Link href="/admin" className="text-stone-600 hover:underline">
              Go to Admin sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />
      <main className="flex-1 flex items-center justify-center">
        <Suspense
          fallback={
            <div className="py-24 text-center text-sm text-stone-500">
              Loading authentication...
            </div>
          }
        >
          <LoginFormContent />
        </Suspense>
      </main>
      <StorefrontFooter />
    </div>
  );
}
