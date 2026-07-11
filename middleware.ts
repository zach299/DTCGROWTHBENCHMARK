import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

// Allow the Chrome extension (and MCP server) to call the API cross-origin.
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Existing behavior, unchanged: /api/* stays publicly reachable with CORS
// (extension lookup, enrich-meta, worker, tam, company, alerts, accounts,
// stats, watchlist, rank, search, benchmarks, top-movers…). Page-level auth
// gating happens client-side; nothing is protected in middleware.
function handleRequest(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api')) {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders() });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
    return res;
  }
  return NextResponse.next();
}

// Only run Clerk when it is fully configured — a half-configured or absent
// Clerk env must leave the app running exactly as today (CORS only).
const CLERK_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

// clerkMiddleware() with no protection rules: it only maintains the session
// (cookies/handshake) so client components can read auth state. All routes —
// pages (/, /sign-in, /sign-up, /lookup, /b) and every /api/* — remain public.
const withClerk = CLERK_ENABLED
  ? clerkMiddleware((_auth, req) => handleRequest(req))
  : null;

export function middleware(req: NextRequest, event: NextFetchEvent) {
  if (withClerk) return withClerk(req, event);
  return handleRequest(req);
}

export const config = {
  // All app routes (Clerk session handling) minus static assets, plus /api/*
  // (CORS). When Clerk is disabled, non-/api routes just pass through.
  matcher: ['/((?!_next|.*\\..*).*)', '/api/:path*'],
};
