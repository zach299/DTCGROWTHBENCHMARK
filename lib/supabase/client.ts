'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser Supabase client — singleton so auth state (and its localStorage
// session) is shared across the whole app. detectSessionInUrl stays at its
// default (true) so magic-link redirects landing on origin with a session in
// the URL hash are picked up automatically.
let browserClient: SupabaseClient | null = null;

/** True when the browser auth client can be created (env vars present at build). */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Returns the browser Supabase client, or null when NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured. NEVER throws — a missing
 * env var must degrade to "auth disabled", not crash the whole app shell.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}
