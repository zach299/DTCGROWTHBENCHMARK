import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { fetchMetaAdsSignals } from '@/lib/providers/apifyMetaAds';
import { inferCampaignThemes } from '@/lib/providers/crawlHomepage';
import { normalizeCategory } from '@/lib/categories';
import { computeMomentum, modelRevenue, spendBand } from '@/lib/intelligence';
import { analyzeCreativeQuality } from '@/lib/creativeQuality';
import { logger } from '@/lib/utils/logger';

// Vercel Cron worker — fires every minute, claims and enriches a small batch
// of domains from master_database ordered by sales_numeric DESC (highest-value
// brands first). Domains enriched within the last 30 days are skipped.
//
// Dedup: each domain is claimed by upserting a sentinel `last_enriched_at`
// before the Apify call. Concurrent cron invocations that read the same
// top-N list will skip each other's domains on the next tick. The only
// collision window is the gap between "read targets" and "claim" (~100ms),
// which is acceptable — worst case two workers enrich the same domain once.
//
// Priority: interactive extension lookups always go directly to /api/enrich-meta
// and bypass this queue entirely. This worker handles bulk background refresh.
export const maxDuration = 300;

const BATCH = parseInt(process.env.WORKER_BATCH_SIZE ?? '3', 10);
const REFRESH_DAYS = parseInt(process.env.WORKER_REFRESH_DAYS ?? '30', 10);
const CRON_SECRET = process.env.CRON_SECRET;

function parseNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function activityLevel(c: number): string {
  if (c >= 50) return 'high';
  if (c >= 10) return 'medium';
  if (c >= 1) return 'low';
  return 'none';
}

function velocityLabel(count: number): string {
  if (count >= 100) return 'High';
  if (count >= 25) return 'Medium';
  if (count >= 1) return 'Low';
  return 'None';
}

function diversityLabel(n: number): string {
  if (n >= 5) return 'High';
  if (n >= 3) return 'Medium';
  if (n >= 1) return 'Low';
  return 'None';
}

async function enrichDomain(
  supabase: ReturnType<typeof createServiceClient>,
  domain: string,
  facebookUrl: string | null,
  companyName: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // Claim the domain immediately so concurrent workers skip it.
  await supabase
    .from('company_meta_signals')
    .upsert(
      { domain, last_enriched_at: new Date().toISOString(), source: 'worker' },
      { onConflict: 'domain' },
    );

  try {
    const meta = await fetchMetaAdsSignals(facebookUrl, domain);
    const count = meta.active_ads_count;
    const themes = inferCampaignThemes(meta.unique_landing_pages);
    const lpCount = meta.unique_landing_pages.length;

    // Fetch seed data for intelligence scoring.
    let categoriesRaw: string | null = null;
    let seedRevenue = 0;
    let followers = 0;
    let googleAds = 0;
    let linkedinAds = 0;
    try {
      const { data: seed } = await supabase
        .from('master_database')
        .select('categories, estimated_yearly_sales, combined_followers')
        .in('domain', domainCandidates(domain))
        .limit(1);
      const row = seed?.[0] as Record<string, unknown> | undefined;
      if (row) {
        categoriesRaw = (row.categories as string) ?? null;
        seedRevenue = parseNum(row.estimated_yearly_sales);
        followers = parseNum(row.combined_followers);
      }
    } catch {
      /* seed is optional */
    }

    const channelCount = 1 + (googleAds > 0 ? 1 : 0) + (linkedinAds > 0 ? 1 : 0);
    const quality = analyzeCreativeQuality(meta.raw, count, meta.unique_landing_pages, channelCount);
    const effectiveAds = quality.quality_adjusted_ads;
    const paidIntensity = activityLevel(effectiveAds);
    const cat = normalizeCategory(categoriesRaw);
    const momentum = computeMomentum({
      metaAds: effectiveAds,
      googleAds,
      linkedinAds,
      landingPages: Math.max(lpCount, quality.landing_page_diversity),
      campaignDiversity: Math.max(themes.length, quality.campaign_angle_count),
      revenue: seedRevenue,
      paidIntensity,
    });
    const revenue = modelRevenue({
      seedRevenue,
      metaAds: count,
      googleAds,
      linkedinAds,
      landingPages: lpCount,
      campaignDiversity: themes.length,
      followers,
      paidIntensity,
    });
    const spend = spendBand({ metaAds: count, googleAds, linkedinAds, paidIntensity });

    await supabase.from('company_meta_signals').upsert(
      {
        domain,
        company_name: companyName ?? meta.advertiser_name ?? null,
        active_meta_ads: count,
        google_ads: googleAds,
        linkedin_ads: linkedinAds,
        creative_count: count,
        creative_velocity: velocityLabel(count),
        campaign_diversity: diversityLabel(lpCount),
        ad_activity_level: paidIntensity,
        landing_pages: meta.unique_landing_pages,
        campaign_themes: themes,
        sample_ad_copy: meta.sample_ad_copy,
        first_seen_date: meta.first_seen_date,
        raw_meta_response: meta.raw,
        primary_category: cat.primary_category,
        subcategory: cat.subcategory,
        category_confidence: cat.confidence,
        growth_score: momentum.score,
        growth_momentum: momentum.label,
        estimated_revenue_range: revenue.range,
        revenue_confidence: revenue.confidence,
        spend_band: spend,
        followers: followers || null,
        source: 'worker',
        unique_creative_count: quality.unique_creative_count,
        creative_diversity_score: quality.creative_diversity_score,
        campaign_angle_count: quality.campaign_angle_count,
        offer_diversity: quality.offer_diversity,
        landing_page_diversity: quality.landing_page_diversity,
        dpa_share: quality.dpa_share,
        real_creative_score: quality.real_creative_score,
        quality_adjusted_ads: quality.quality_adjusted_ads,
        last_enriched_at: new Date().toISOString(),
      },
      { onConflict: 'domain' },
    );

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('worker enrich failed', { domain, error: msg });
    // Release the claim so this domain can be retried sooner (set to 7 days ago).
    const retryAt = new Date(Date.now() - 23 * 86_400_000).toISOString();
    await supabase
      .from('company_meta_signals')
      .update({ last_enriched_at: retryAt })
      .eq('domain', domain);
    return { ok: false, error: msg };
  }
}

export async function GET(request: Request) {
  // Vercel cron invocations are GET requests with Authorization: Bearer <secret>.
  // Fail CLOSED: without a configured secret this endpoint must not be public —
  // it triggers paid Apify runs.
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json({ skipped: true, reason: 'APIFY_TOKEN not set' });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();

  // Pick the top-N unrefreshed domains by sales rank.
  // Inner join against master_database so we only process real brands.
  const { data: targets, error } = await supabase
    .from('master_database')
    .select('domain, company_name, facebook_url')
    .ilike('platform', '%shopify%')
    .order('sales_numeric', { ascending: false, nullsFirst: false })
    .limit(BATCH * 20); // over-select to account for recently-enriched rows

  if (error) {
    logger.error('worker: failed to fetch targets', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'no targets' });
  }

  // Filter out recently-enriched domains.
  const domainList = (targets as { domain: string }[]).map((r) => r.domain);
  const { data: recent } = await supabase
    .from('company_meta_signals')
    .select('domain, last_enriched_at')
    .in('domain', domainList)
    .gte('last_enriched_at', cutoff);

  const skip = new Set((recent ?? []).map((r) => r.domain as string));
  const batch = (targets as { domain: string; company_name: string | null; facebook_url: string | null }[])
    .filter((r) => !skip.has(r.domain))
    .slice(0, BATCH);

  if (batch.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'all top domains are fresh' });
  }

  // Enrich in parallel — each Apify call is I/O bound so parallel is fine.
  const results = await Promise.allSettled(
    batch.map((t) =>
      enrichDomain(supabase, normalizeDomain(t.domain), t.facebook_url, t.company_name),
    ),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  const failed = results.length - succeeded;

  logger.info('worker: batch complete', { processed: results.length, succeeded, failed });

  return NextResponse.json({
    processed: results.length,
    succeeded,
    failed,
    domains: batch.map((t) => t.domain),
  });
}
