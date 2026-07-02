'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser Supabase client — singleton so auth state (and its localStorage
// session) is shared across the whole app. detectSessionInUrl stays at its
// default (true) so magic-link redirects landing on origin with a session in
// the URL hash are picked up automatically.
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing Supabase configuration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.'
    );
  }
  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}
