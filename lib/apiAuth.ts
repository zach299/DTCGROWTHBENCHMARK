// Lightweight shared-secret auth for expensive / mutating API routes.
//
// Set INTERNAL_API_KEY in the environment (Vercel + GitHub Actions secrets +
// extension settings) to require an `x-api-key` header on protected routes.
// When the env var is unset the check is skipped so local dev and existing
// deployments keep working — set it in production to lock the routes down.

import { NextResponse } from 'next/server';

export function requireApiKey(request: Request): NextResponse | null {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return null; // not configured — allow (dev / pre-rollout)
  const provided = request.headers.get('x-api-key');
  if (provided === expected) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
