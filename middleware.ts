import { type NextRequest } from "next/server";
import { updateSession, safeRedirect } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, claims, supabase } = await updateSession(request);

  const isAdminSubroute =
    pathname.startsWith("/admin/") && pathname !== "/admin";
  const isAdminRoot = pathname === "/admin";

  // 1. Unauthenticated access to protected admin subroutes -> redirect to /admin sign-in
  if (isAdminSubroute && !claims?.sub) {
    const loginUrl = new URL("/admin", request.url);
    return safeRedirect(loginUrl, supabaseResponse);
  }

  // 2. Role verification for admin routes (both /admin and /admin/*)
  if (claims?.sub && (isAdminSubroute || isAdminRoot)) {
    if (!supabase) {
      const homeUrl = new URL("/", request.url);
      return safeRedirect(homeUrl, supabaseResponse);
    }

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", claims.sub)
        .maybeSingle();

      const isAdmin = !error && profile?.role === "admin";

      // Block authenticated non-admin customers from admin routes -> redirect to storefront
      if (!isAdmin) {
        const homeUrl = new URL("/", request.url);
        return safeRedirect(homeUrl, supabaseResponse);
      }
    } catch (err) {
      console.error("Admin role verification in middleware failed:", err);
      const homeUrl = new URL("/", request.url);
      return safeRedirect(homeUrl, supabaseResponse);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
