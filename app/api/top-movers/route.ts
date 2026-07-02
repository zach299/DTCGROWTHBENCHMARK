import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { estimateMonthlySpend, type SpendEstimate } from '@/lib/adSpend';

// The Top Movers discovery feed. Reads the enriched dataset and returns a
// ranked leaderboard plus ready-made segments (top advertisers by channel,
// newly enriched, entering Top 1%). The core "who's accelerating" surface.
export const maxDuration = 20;

interface Mover {
  rank: number;
  domain: string;
  company_name: string | null;
  primary_category: string | null;
  subcategory: string | null;
  active_meta_ads: number;
  google_ads: number;
  linkedin_ads: number;
  growth_score: number;
  growth_momentum: string | null;
  estimated_revenue_range: string | null;
  spend_band: string | null;
  landing_pages_count: number;
  last_enriched_at: string | null;
  percentile_top: number | null;
  real_creative_score: number | null;
  dpa_share: number | null;
  spend_estimate: SpendEstimate | null;
}

// Supported ?sort= values. Default (unset / "fastest_growing") keeps the
// existing growth-score ranking; other sorts reorder the same ranked set,
// preserving each row's growth rank.
type SortKey = 'fastest_growing' | 'highest_spend' | 'most_meta' | 'newly_enriched';

function momentumFromAds(ads: number): string {
  return ads >= 100 ? 'Exploding' : ads >= 40 ? 'Accelerating' : ads >= 10 ? 'Scaling' : ads >= 1 ? 'Emerging' : 'Dormant';
}

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const sortParam = new URL(request.url).searchParams.get('sort');
  const sort: SortKey =
    sortParam === 'highest_spend' || sortParam === 'most_meta' || sortParam === 'newly_enriched'
      ? sortParam
      : 'fastest_growing';
  try {
    const { data, count } = await supabase
      .from('company_meta_signals')
      .select(
        'domain, company_name, primary_category, subcategory, active_meta_ads, google_ads, linkedin_ads, growth_score, growth_momentum, estimated_revenue_range, spend_band, landing_pages, last_enriched_at, real_creative_score, dpa_share, quality_adjusted_ads, creative_diversity_score',
        { count: 'exact' }
      )
      // Reject pre-fix keyword-contamination (global totals ~14k–50k). Real
      // high-volume DTC advertisers top out around ~8k active ads.
      .lt('active_meta_ads', 13000)
      .order('growth_score', { ascending: false, nullsFirst: false })
      .order('active_meta_ads', { ascending: false })
      .limit(300);

    const total = count ?? data?.length ?? 0;
    const movers: Mover[] = (data ?? []).map((r, i) => {
      const ads = Number(r.active_meta_ads ?? 0);
      return {
        rank: i + 1,
        domain: r.domain as string,
        company_name: (r.company_name as string) ?? null,
        primary_category: (r.primary_category as string) ?? null,
        subcategory: (r.subcategory as string) ?? null,
        active_meta_ads: ads,
        google_ads: Number(r.google_ads ?? 0),
        linkedin_ads: Number(r.linkedin_ads ?? 0),
        growth_score: Number(r.growth_score ?? 0),
        growth_momentum: (r.growth_momentum as string) ?? momentumFromAds(ads),
        estimated_revenue_range: (r.estimated_revenue_range as string) ?? null,
        spend_band: (r.spend_band as string) ?? null,
        landing_pages_count: Array.isArray(r.landing_pages) ? (r.landing_pages as unknown[]).length : 0,
        last_enriched_at: (r.last_enriched_at as string) ?? null,
        percentile_top: total > 0 ? Math.max(1, Math.ceil(((i + 1) / total) * 100)) : null,
        real_creative_score: r.real_creative_score != null ? Number(r.real_creative_score) : null,
        dpa_share: r.dpa_share != null ? Number(r.dpa_share) : null,
        // Pure heuristic — cheap enough to run per row.
        spend_estimate: estimateMonthlySpend({
          metaAds: ads,
          googleAds: Number(r.google_ads ?? 0),
          linkedinAds: Number(r.linkedin_ads ?? 0),
          qualityAdjustedAds: r.quality_adjusted_ads != null ? Number(r.quality_adjusted_ads) : null,
          landingPages: Array.isArray(r.landing_pages) ? (r.landing_pages as unknown[]).length : null,
          creativeDiversityScore:
            r.creative_diversity_score != null ? Number(r.creative_diversity_score) : null,
          revenueRange: (r.estimated_revenue_range as string) ?? null,
          paidIntensity: null,
        }),
      };
    });

    // Apply the requested sort (rank stays the growth-score rank).
    if (sort === 'highest_spend') {
      movers.sort((a, b) => (b.spend_estimate?.high ?? 0) - (a.spend_estimate?.high ?? 0));
    } else if (sort === 'most_meta') {
      movers.sort((a, b) => b.active_meta_ads - a.active_meta_ads);
    } else if (sort === 'newly_enriched') {
      movers.sort((a, b) => (b.last_enriched_at ?? '').localeCompare(a.last_enriched_at ?? ''));
    }

    // Discovery segments derived from the ranked set.
    const byMeta = [...movers].sort((a, b) => b.active_meta_ads - a.active_meta_ads).slice(0, 25);
    const byGoogle = [...movers].filter((m) => m.google_ads > 0).sort((a, b) => b.google_ads - a.google_ads).slice(0, 25);
    const byLinkedin = [...movers].filter((m) => m.linkedin_ads > 0).sort((a, b) => b.linkedin_ads - a.linkedin_ads).slice(0, 25);
    const newlyEnriched = [...movers]
      .filter((m) => m.last_enriched_at)
      .sort((a, b) => (b.last_enriched_at! > a.last_enriched_at! ? 1 : -1))
      .slice(0, 25);
    const enteringTop1 = movers.filter((m) => m.percentile_top != null && m.percentile_top <= 1);

    // Category list for the "top companies by category" filter.
    const categories = [...new Set(movers.map((m) => m.primary_category).filter(Boolean))] as string[];

    return NextResponse.json({
      movers,
      total,
      segments: {
        top_meta: byMeta,
        top_google: byGoogle,
        top_linkedin: byLinkedin,
        newly_enriched: newlyEnriched,
        entering_top_1: enteringTop1,
      },
      categories,
    });
  } catch (err) {
    logger.error('top-movers failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ movers: [], total: 0, segments: {}, categories: [] });
  }
}
