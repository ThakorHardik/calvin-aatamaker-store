/**
 * Re-exports the standardized @supabase/ssr browser client from lib/supabase/client.ts.
 * Preserves createSupabaseBrowserClient for backward compatibility while eliminating
 * duplicate or competing Supabase client instances.
 */
export {
  createClient as createSupabaseBrowserClient,
  createClient,
  supabase,
} from "./supabase/client";
