import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { estimateMonthlySpend } from '@/lib/adSpend';
import { logger } from '@/lib/utils/logger';

// Universe-wide stats for the homepage command center. Unlike the top-movers
// stat strip (which only sees the ranked top slice), this pages the whole
// enriched set. Cached in-process for 5 minutes.
export const maxDuration = 30;

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.payload);
  const supabase = createServiceClient();
  try {
    let tracked = 0;
    let growing = 0;
    let withAds = 0;
    let spendMidSum = 0;
    const catCounts = new Map<string, number>();

    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('company_meta_signals')
        .select(
          'growth_momentum, primary_category, active_meta_ads, google_ads, linkedin_ads, quality_adjusted_ads, landing_pages, creative_diversity_score, estimated_revenue_range, ad_activity_level'
        )
        .not('growth_score', 'is', null)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const r of data as Record<string, unknown>[]) {
        tracked++;
        const momentum = (r.growth_momentum as string) ?? '';
        if (momentum === 'Accelerating' || momentum === 'Exploding') growing++;
        const meta = Number(r.active_meta_ads ?? 0);
        if (meta > 0) {
          withAds++;
          const spend = estimateMonthlySpend({
            metaAds: meta,
            googleAds: Number(r.google_ads ?? 0),
            linkedinAds: Number(r.linkedin_ads ?? 0),
            qualityAdjustedAds: r.quality_adjusted_ads != null ? Number(r.quality_adjusted_ads) : null,
            landingPages: Array.isArray(r.landing_pages) ? (r.landing_pages as unknown[]).length : 0,
            creativeDiversityScore:
              r.creative_diversity_score != null ? Number(r.creative_diversity_score) : null,
            revenueRange: (r.estimated_revenue_range as string) ?? null,
            paidIntensity: (r.ad_activity_level as string) ?? null,
            momentum: momentum || null,
          });
          if (spend) spendMidSum += (spend.low + spend.high) / 2;
        }
        const cat = (r.primary_category as string) || null;
        if (cat && momentum && momentum !== 'Dormant') {
          catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
        }
      }
      if (data.length < PAGE) break;
    }

    const top_categories = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const payload = {
      companies_tracked: tracked,
      growing_this_month: growing,
      companies_with_ads: withAds,
      est_annual_spend_tracked: Math.round(spendMidSum),
      top_categories,
      generated_at: new Date().toISOString(),
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    logger.error('stats failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'stats failed' }, { status: 500 });
  }
}
