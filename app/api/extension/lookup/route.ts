import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';

// Chrome-extension entry point. Resolves a domain to its cached Growth Signals,
// AND ensures every looked-up domain becomes a first-class company in the
// database — so the dataset grows organically with every lookup.
//
// Returns cached signals instantly when fresh (<7d); otherwise flags
// needs_enrichment so the client kicks off /api/enrich-meta + /api/rank.
export const maxDuration = 15;

const CACHE_TTL_DAYS = 7;
const bodySchema = z.object({ domain: z.string().min(1) });

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
  const supabase = createServiceClient();
  try {
    // Is this domain already a known company?
    const { data: known } = await supabase
      .from('master_database')
      .select('domain, facebook_url, company_name, categories')
      .in('domain', domainCandidates(domain))
      .limit(1);
    const isNew = !known || known.length === 0;
    const seed = (known?.[0] ?? {}) as Record<string, unknown>;

    if (isNew) {
      // Organically add it — provenance = chrome_extension. Ignore conflicts in
      // case of a race (another lookup inserted it first).
      const { error } = await supabase
        .from('master_database')
        .upsert({ domain, source: 'chrome_extension' }, { onConflict: 'domain', ignoreDuplicates: true });
      if (error) logger.error('extension lookup insert failed', { domain, error: error.message });
    }

    // Cached enrichment?
    const { data: sig } = await supabase
      .from('company_meta_signals')
      .select('*')
      .eq('domain', domain)
      .maybeSingle();

    let cacheAgeDays: number | null = null;
    let fresh = false;
    if (sig?.last_enriched_at) {
      cacheAgeDays = (Date.now() - new Date(sig.last_enriched_at as string).getTime()) / 86_400_000;
      fresh = cacheAgeDays <= CACHE_TTL_DAYS;
    }

    return NextResponse.json({
      domain,
      is_new: isNew,
      signals: sig ?? null,
      facebook_url: (seed.facebook_url as string) ?? null,
      company_name: (seed.company_name as string) ?? null,
      cache_age_days: cacheAgeDays != null ? Math.round(cacheAgeDays * 10) / 10 : null,
      cache_fresh: fresh,
      // Enrich when there's no cache, or it's stale (7-day auto-refresh).
      needs_enrichment: !sig || !fresh,
    });
  } catch (err) {
    logger.error('extension lookup failed', { domain, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
