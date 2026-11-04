import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Validates a redirect path to prevent open redirect vulnerabilities.
 * Ensures the target is a relative path within the origin.
 */
function sanitizeRedirect(path: string | null): string {
  if (!path) return "/account";

  // Must start with a single slash and avoid protocol-relative "//" or backslash escapes
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const errorParam = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next");

  // Determine the intended destination safely
  let targetPath = sanitizeRedirect(nextParam);

  // If this is a password recovery flow, prioritize the password update route
  if (type === "recovery" || targetPath.includes("update-password")) {
    targetPath = "/auth/update-password";
  }

  // Handle errors provided directly by Supabase Auth (e.g. expired magic link)
  if (errorParam || errorDescription) {
    const errorUrl = new URL("/auth/auth-code-error", requestUrl.origin);
    if (errorDescription) {
      errorUrl.searchParams.set("message", errorDescription);
    } else if (errorParam) {
      errorUrl.searchParams.set("message", errorParam);
    }
    return NextResponse.redirect(errorUrl);
  }

  // If an authorization code is present, exchange it for a verified session
  if (code) {
    try {
      const supabase = await createClient();
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error(
          "Auth code exchange error:",
          exchangeError.message || exchangeError
        );
        const errorUrl = new URL("/auth/auth-code-error", requestUrl.origin);
        errorUrl.searchParams.set(
          "message",
          "Your verification link is invalid or has expired. Please sign in or request a new link."
        );
        return NextResponse.redirect(errorUrl);
      }

      // Successful exchange: navigate to sanitized target
      const destination = new URL(targetPath, requestUrl.origin);
      return NextResponse.redirect(destination);
    } catch (err) {
      console.error("Unexpected error during auth callback handling:", err);
      const errorUrl = new URL("/auth/auth-code-error", requestUrl.origin);
      errorUrl.searchParams.set(
        "message",
        "An unexpected error occurred during verification. Please try again."
      );
      return NextResponse.redirect(errorUrl);
    }
  }

  // No code and no explicit error: fallback redirect to sign-in
  const loginUrl = new URL("/login", requestUrl.origin);
  return NextResponse.redirect(loginUrl);
}

