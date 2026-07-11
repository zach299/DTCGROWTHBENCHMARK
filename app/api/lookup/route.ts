import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { consumeLookup, peekLookupQuota } from '@/lib/lookupQuota';
import { logger } from '@/lib/utils/logger';

// Metered public lookup — the PLG funnel's front door.
// Anonymous: 1 free lookup (httpOnly cookie identity), then signup_required.
// Signed-in free tier: 5/day. Repeat views of the same domain are free.
// On success the client proceeds to /api/company for the full payload.
export const maxDuration = 15;

const bodySchema = z.object({ domain: z.string().min(1), peek: z.boolean().optional() });
const ANON_COOKIE = 'tam_anon_id';

async function clerkUserId(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return null;
  try {
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    return null; // middleware not active or auth unavailable — treat as anonymous
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'domain required' }, { status: 400 });

  const domain = normalizeDomain(parsed.data.domain);
  const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  if (!domain || !VALID_HOST.test(domain)) {
    return NextResponse.json({ error: 'Enter a valid brand domain, like ruggable.com' }, { status: 400 });
  }

  try {
    const userId = await clerkUserId();
    const jar = await cookies();
    let subject: string;
    let kind: 'anon' | 'user';
    let setAnonCookie: string | null = null;

    if (userId) {
      subject = `user:${userId}`;
      kind = 'user';
    } else {
      let anonId = jar.get(ANON_COOKIE)?.value;
      if (!anonId || !/^[a-f0-9-]{16,64}$/.test(anonId)) {
        anonId = crypto.randomUUID();
        setAnonCookie = anonId;
      }
      subject = `anon:${anonId}`;
      kind = 'anon';
    }

    const supabase = createServiceClient();
    const quota = parsed.data.peek
      ? await peekLookupQuota(supabase, subject, kind)
      : await consumeLookup(supabase, subject, kind, domain);

    const res = NextResponse.json({
      domain,
      allowed: quota.allowed,
      remaining: quota.remaining,
      limit: quota.limit,
      subject_kind: quota.subject_kind,
      reason: quota.reason ?? null,
      signed_in: kind === 'user',
    });
    if (setAnonCookie) {
      res.cookies.set(ANON_COOKIE, setAnonCookie, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }
    return res;
  } catch (err) {
    logger.error('lookup metering failed', { error: err instanceof Error ? err.message : String(err) });
    // Fail open — metering must never break the funnel.
    return NextResponse.json({ domain, allowed: true, remaining: 1, limit: 1, subject_kind: 'anon', reason: null, signed_in: false });
  }
}
