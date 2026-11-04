import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { supabaseResponse, claims: null, supabase: null };
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Cryptographically verify identity & refresh session using getClaims()
    // per modern Supabase SSR guidance
    const { data, error } = await supabase.auth.getClaims();
    const claims = !error && data?.claims ? data.claims : null;

    return { supabaseResponse, claims, supabase };
  } catch (err) {
    console.error("Middleware session update failed:", err);
    return { supabaseResponse, claims: null, supabase: null };
  }
}

/**
 * Preserves all refreshed cookies from supabaseResponse when redirecting,
 * ensuring session tokens are never lost across HTTP redirects.
 */
export function safeRedirect(
  url: URL | string,
  supabaseResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}
