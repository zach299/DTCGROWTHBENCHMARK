import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';

// Email capture for untracked brands on the public /lookup teaser.
// Registers the domain + queues it for the nightly priority pass, so the
// "we'll score it within 24h" promise is real. Captures are retrievable via
// the lookup_requests table (see /admin or SQL).
export const maxDuration = 10;

const bodySchema = z.object({
  email: z.string().email().max(254),
  domain: z.string().min(1).max(253),
  first_name: z.string().max(80).optional(),
  source: z.enum(['lookup_teaser', 'report_unlock']).optional(),
});
const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid email and domain are required' }, { status: 400 });
  }
  const domain = normalizeDomain(parsed.data.domain);
  if (!domain || !VALID_HOST.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    await supabase.from('lookup_requests').insert({
      email: parsed.data.email.trim().toLowerCase(),
      domain,
      source: parsed.data.source ?? 'lookup_teaser',
    });
    // Make the 24h promise real: register + prioritize for tonight's pull.
    await supabase
      .from('master_database')
      .upsert({ domain, source: 'lookup_request' }, { onConflict: 'domain', ignoreDuplicates: true });
    await supabase
      .from('domain_priority')
      .upsert({ domain, last_viewed_at: new Date().toISOString() }, { onConflict: 'domain' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('request-brand failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Could not save your request — try again' }, { status: 500 });
  }
}
