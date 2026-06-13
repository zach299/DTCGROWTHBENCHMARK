import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// Leaderboard of the fastest-growing brands — reads the enriched dataset
// (company_meta_signals), ranked by active Meta ads. This is the core
// "who's accelerating" surface.
export const maxDuration = 20;

export async function GET() {
  const supabase = createServiceClient();
  try {
    const { data, count } = await supabase
      .from('company_meta_signals')
      .select(
        'domain, company_name, active_meta_ads, creative_velocity, campaign_diversity, campaign_themes, landing_pages, last_enriched_at',
        { count: 'exact' }
      )
      .order('active_meta_ads', { ascending: false })
      .limit(200);

    const total = count ?? data?.length ?? 0;
    const movers = (data ?? []).map((r, i) => {
      const ads = Number(r.active_meta_ads ?? 0);
      return {
        rank: i + 1,
        domain: r.domain,
        company_name: r.company_name,
        active_meta_ads: ads,
        creative_velocity: r.creative_velocity,
        campaign_diversity: r.campaign_diversity,
        landing_pages_count: Array.isArray(r.landing_pages) ? r.landing_pages.length : 0,
        campaign_themes: Array.isArray(r.campaign_themes) ? r.campaign_themes : [],
        last_enriched_at: r.last_enriched_at,
        percentile_top: total > 0 ? Math.max(1, Math.ceil(((i + 1) / total) * 100)) : null,
        // momentum proxy from Meta activity until cross-time history exists
        growth_momentum:
          ads >= 100 ? 'Exploding' : ads >= 40 ? 'Accelerating' : ads >= 10 ? 'Scaling' : ads >= 1 ? 'Emerging' : 'Dormant',
      };
    });
    return NextResponse.json({ movers, total });
  } catch (err) {
    logger.error('top-movers failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ movers: [], total: 0 });
  }
}
