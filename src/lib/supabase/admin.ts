import "server-only";

// =============================================================================
// Supabase service-role client.
//
// Bypasses Row Level Security. Server-side only — the `server-only` import
// above is a build-time guard against this module ever being pulled into a
// client bundle, which would leak the service role key to browsers.
//
// Use this client ONLY for operations that genuinely need admin privileges
// and where the route itself enforces all access control. Currently:
//
//   - Public lead intake (POST /api/enquiries) — no authenticated user, but
//     we need to insert into `leads`. The API route is the lockdown point:
//     input validation, honeypot, future rate limiting all live there.
//
// Anything user-scoped should go through the SSR client in `./server.ts`,
// which carries the user's auth context and respects RLS.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Cannot create Supabase admin client.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Cannot create Supabase admin client. " +
        "This key is server-only — paste it into .env.local (never commit).",
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      // Service-role client has no user session — disable session machinery.
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
