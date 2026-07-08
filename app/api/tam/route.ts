import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { parseTamQuery, describeFilters, type TamFilters } from '@/lib/tamQuery';
import { estimateMonthlySpend, revenueMidM, type SpendEstimate } from '@/lib/adSpend';
import { buildReason, buildOutboundAngle } from '@/lib/reason';
import { trendStatus } from '@/lib/trends';
import { logger } from '@/lib/utils/logger';
import { escapeIlike } from '@/lib/utils/sanitize';

// TAM list builder — the core product query. Accepts a natural-language
// `query` and/or explicit `filters`, returns ranked accounts with spend
// estimates and a human "reason this account is interesting" per row.
export const maxDuration = 30;

const bodySchema = z.object({
  query: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().min(1).max(500).optional(),
});

interface TamAccount {
  domain: string;
  company_name: string | null;
  category: string | null;
  platform: string | null;
  revenue_range: string | null;
  spend_estimate: SpendEstimate | null;
  growth_score: number | null;
  growth_momentum: string | null;
  active_meta_ads: number | null;
  last_enriched_at: string | null;
  snapshot_count: number;
  trend_status: 'not_started' | 'tracking_started' | 'trend_ready';
  reason: string;
  outbound_angle: string;
  rank: number;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const fromQuery: TamFilters = parsed.data.query ? parseTamQuery(parsed.data.query) : {};
  const f: TamFilters = { ...fromQuery, ...(parsed.data.filters as TamFilters | undefined) };
  const limit = parsed.data.limit ?? 100;
  const supabase = createServiceClient();

  try {
    // Pull a working set from the DB with the filters we can push down, then
    // apply the derived filters (spend, revenue range) in memory.
    let q = supabase
      .from('company_meta_signals')
      .select(
        'domain, company_name, primary_category, estimated_revenue_range, growth_score, growth_momentum, active_meta_ads, google_ads, linkedin_ads, quality_adjusted_ads, creative_diversity_score, real_creative_score, dpa_share, landing_pages, ad_activity_level, last_enriched_at'
      )
      .not('growth_score', 'is', null);

    if (f.category) q = q.ilike('primary_category', `%${escapeIlike(f.category, 60)}%`);
    if (f.metaAdsMin) q = q.gte('active_meta_ads', f.metaAdsMin);
    if (f.growthScoreMin) q = q.gte('growth_score', f.growthScoreMin);
    if (f.momentum?.length) q = q.in('growth_momentum', f.momentum);
    if (f.newlyEnriched) {
      q = q.gte('last_enriched_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
    }

    const sortCol = f.sort === 'meta_ads' ? 'active_meta_ads' : f.sort === 'newest' ? 'last_enriched_at' : 'growth_score';
    q = q.order(sortCol, { ascending: false, nullsFirst: false }).limit(2000);

    const { data: rows, error } = await q;
    if (error) throw error;

    const totalTrackedRes = await supabase
      .from('company_meta_signals')
      .select('domain', { count: 'exact', head: true })
      .not('growth_score', 'is', null);
    const totalTracked = totalTrackedRes.count ?? 0;

    // Snapshot counts for candidate rows (chunked; powers trend-ready boost + chip).
    const snapCounts = new Map<string, number>();
    {
      const candDomains = (rows ?? []).map((r) => r.domain as string);
      for (let i = 0; i < candDomains.length; i += 500) {
        const chunk = candDomains.slice(i, i + 500);
        const { data: snaps } = await supabase
          .from('domain_snapshots')
          .select('domain')
          .in('domain', chunk);
        for (const row of snaps ?? []) {
          snapCounts.set(row.domain as string, (snapCounts.get(row.domain as string) ?? 0) + 1);
        }
      }
    }

    let accounts: TamAccount[] = (rows ?? []).map((r) => {
      const lps = Array.isArray(r.landing_pages) ? (r.landing_pages as string[]).length : 0;
      const spend = estimateMonthlySpend({
        metaAds: Number(r.active_meta_ads ?? 0),
        googleAds: Number(r.google_ads ?? 0),
        linkedinAds: Number(r.linkedin_ads ?? 0),
        qualityAdjustedAds: r.quality_adjusted_ads != null ? Number(r.quality_adjusted_ads) : null,
        landingPages: lps,
        creativeDiversityScore: r.creative_diversity_score != null ? Number(r.creative_diversity_score) : null,
        revenueRange: (r.estimated_revenue_range as string) ?? null,
        paidIntensity: (r.ad_activity_level as string) ?? null,
        momentum: (r.growth_momentum as string) ?? null,
      });
      const reasonInputs = {
        metaAds: Number(r.active_meta_ads ?? 0),
        creativeDiversityScore: r.creative_diversity_score != null ? Number(r.creative_diversity_score) : null,
        realCreativeScore: r.real_creative_score != null ? Number(r.real_creative_score) : null,
        dpaShare: r.dpa_share != null ? Number(r.dpa_share) : null,
        momentum: (r.growth_momentum as string) ?? null,
        growthScore: r.growth_score != null ? Number(r.growth_score) : null,
        spend,
        landingPages: lps,
      };
      const name = (r.company_name as string) || (r.domain as string).split('.')[0];
      return {
        domain: r.domain as string,
        company_name: (r.company_name as string) ?? null,
        category: (r.primary_category as string) ?? null,
        platform: 'shopify', // dataset is Shopify-sourced; refine if platform lands on signals
        revenue_range: (r.estimated_revenue_range as string) ?? null,
        spend_estimate: spend,
        growth_score: r.growth_score != null ? Number(r.growth_score) : null,
        growth_momentum: (r.growth_momentum as string) ?? null,
        active_meta_ads: r.active_meta_ads != null ? Number(r.active_meta_ads) : null,
        last_enriched_at: (r.last_enriched_at as string) ?? null,
        snapshot_count: snapCounts.get(r.domain as string) ?? 0,
        trend_status: trendStatus(snapCounts.get(r.domain as string) ?? 0),
        reason: buildReason(reasonInputs),
        outbound_angle: buildOutboundAngle(name, reasonInputs),
        rank: 0,
      };
    });

    // In-memory filters on derived values
    if (f.revenueMinM != null || f.revenueMaxM != null) {
      accounts = accounts.filter((a) => {
        const mid = revenueMidM(a.revenue_range);
        if (mid == null) return false;
        if (f.revenueMinM != null && mid < f.revenueMinM) return false;
        if (f.revenueMaxM != null && mid > f.revenueMaxM) return false;
        return true;
      });
    }
    if (f.spendMinMo != null) {
      accounts = accounts.filter((a) => a.spend_estimate != null && a.spend_estimate.monthly_high >= (f.spendMinMo as number));
    }
    if (f.spendMaxMo != null) {
      accounts = accounts.filter((a) => a.spend_estimate != null && a.spend_estimate.monthly_low <= (f.spendMaxMo as number));
    }
    if (f.top1pct && totalTracked > 0) {
      const cut = Math.max(1, Math.ceil(totalTracked * 0.01));
      accounts = accounts.slice(0, cut);
    }
    if (f.sort === 'spend') {
      accounts.sort((a, b) => (b.spend_estimate?.high ?? 0) - (a.spend_estimate?.high ?? 0));
    }

    // Until the corpus has deep history, surface trend-ready brands first
    // within the chosen sort (stable partition, preserves relative order).
    const ready = accounts.filter((a) => a.trend_status === 'trend_ready');
    const rest = accounts.filter((a) => a.trend_status !== 'trend_ready');
    accounts = [...ready, ...rest];

    accounts = accounts.slice(0, limit).map((a, i) => ({ ...a, rank: i + 1 }));

    return NextResponse.json({
      accounts,
      total_matched: accounts.length,
      total_tracked: totalTracked,
      applied_filters: describeFilters(f),
      filters: f,
    });
  } catch (err) {
    logger.error('tam query failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
