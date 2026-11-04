import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles authenticated sign-out requests via POST.
 * Defends against CSRF logout attacks by strictly disallowing state mutations on GET.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.error("Signout error:", err);
  }

  // 303 See Other ensures browser follows redirect with a GET request
  const redirectUrl = new URL("/", request.nextUrl.origin);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

/**
 * Rejects GET requests to prevent third-party cross-site logout triggers (e.g. <img src="/auth/signout">).
 */
export async function GET() {
  return new NextResponse(
    JSON.stringify({
      error: "Method Not Allowed",
      message: "Sign out requires a POST request.",
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "POST",
      },
    }
  );
}

