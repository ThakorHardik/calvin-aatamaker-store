import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function getCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase URL or publishable key in environment.");
  }

  return { url, anonKey };
}

/**
 * Creates or returns an authenticated Supabase client for browser/client components.
 * Automatically synchronizes session tokens with document.cookie via @supabase/ssr.
 * During SSR prerendering, returns an isolated client to avoid sharing singleton state across requests.
 */
export function createClient(): SupabaseClient {
  const { url, anonKey } = getCredentials();

  if (typeof window === "undefined") {
    return createBrowserClient(url, anonKey);
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}

/**
 * Backward-compatible Supabase client singleton for existing imports.
 * In the browser, delegates directly to the client singleton with cookie persistence.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const instance = createClient();
    const value = Reflect.get(instance, prop, instance);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
