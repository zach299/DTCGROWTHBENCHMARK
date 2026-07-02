import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';
import { estimateMonthlySpend, type SpendEstimate } from '@/lib/adSpend';

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

    // Growth history for the popup mini chart (one extra cheap query).
    const { data: hist } = await supabase
      .from('domain_snapshots')
      .select('snapshot_date, growth_score, active_meta_ads')
      .eq('domain', domain)
      .order('snapshot_date', { ascending: true })
      .limit(60);
    const history = (hist ?? []).map((r) => ({
      date: r.snapshot_date as string,
      growth_score: r.growth_score != null ? Number(r.growth_score) : null,
      active_meta_ads: r.active_meta_ads != null ? Number(r.active_meta_ads) : null,
    }));

    // Estimated monthly spend from the cached signal row.
    let spendEstimate: SpendEstimate | null = null;
    if (sig) {
      const s = sig as Record<string, unknown>;
      spendEstimate = estimateMonthlySpend({
        metaAds: Number(s.active_meta_ads ?? 0),
        googleAds: s.google_ads != null ? Number(s.google_ads) : null,
        linkedinAds: s.linkedin_ads != null ? Number(s.linkedin_ads) : null,
        qualityAdjustedAds: s.quality_adjusted_ads != null ? Number(s.quality_adjusted_ads) : null,
        landingPages: Array.isArray(s.landing_pages) ? s.landing_pages.length : null,
        creativeDiversityScore:
          s.creative_diversity_score != null ? Number(s.creative_diversity_score) : null,
        revenueRange: (s.estimated_revenue_range as string) ?? null,
        paidIntensity: (s.ad_activity_level as string) ?? null,
      });
    }

    return NextResponse.json({
      domain,
      is_new: isNew,
      history,
      spend_estimate: spendEstimate,
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
