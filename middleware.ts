import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Allow the Chrome extension (and MCP server) to call the API cross-origin.
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

export const config = { matcher: '/api/:path*' };
