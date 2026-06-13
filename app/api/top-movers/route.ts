import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// Ranks analyzed companies using the accumulated snapshot history.
export const maxDuration = 15;

interface Row {
  domain: string;
  snapshot_date: string;
  active_meta_ads: number | null;
  active_google_ads: number | null;
  landing_pages_count: number | null;
  growth_score: number | null;
  growth_momentum: string | null;
  revenue_range: string | null;
}

const MOMENTUM_RANK: Record<string, number> = {
  Dormant: 0,
  Emerging: 1,
  Scaling: 2,
  Accelerating: 3,
  Exploding: 4,
};

export async function GET() {
  const supabase = createServiceClient();
  try {
    const { data, error } = await supabase
      .from('domain_snapshots')
      .select(
        'domain, snapshot_date, active_meta_ads, active_google_ads, landing_pages_count, growth_score, growth_momentum, revenue_range'
      )
      .order('domain', { ascending: true })
      .order('snapshot_date', { ascending: true })
      .limit(5000);
    if (error) throw error;

    const rows = (data ?? []) as Row[];
    // Group by domain → latest + previous snapshot.
    const byDomain = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byDomain.get(r.domain) ?? [];
      arr.push(r);
      byDomain.set(r.domain, arr);
    }

    const movers = [...byDomain.entries()].map(([domain, snaps]) => {
      const latest = snaps[snaps.length - 1];
      const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
      const meta = Number(latest.active_meta_ads ?? 0);
      const prevMeta = prev ? Number(prev.active_meta_ads ?? 0) : null;
      const adGrowthPct =
        prevMeta == null
          ? null
          : prevMeta === 0
            ? meta > 0
              ? 100
              : 0
            : Math.round(((meta - prevMeta) / Math.abs(prevMeta)) * 100);
      return {
        domain,
        growth_score: Number(latest.growth_score ?? 0),
        growth_momentum: latest.growth_momentum,
        active_meta_ads: meta,
        active_google_ads: Number(latest.active_google_ads ?? 0),
        landing_pages_count: Number(latest.landing_pages_count ?? 0),
        revenue_range: latest.revenue_range,
        ad_growth_pct: adGrowthPct,
        momentum_rank: MOMENTUM_RANK[latest.growth_momentum ?? 'Dormant'] ?? 0,
        snapshots: snaps.length,
      };
    });

    // Default ranking: momentum, then growth score, then ad growth.
    movers.sort(
      (a, b) =>
        b.momentum_rank - a.momentum_rank ||
        b.growth_score - a.growth_score ||
        (b.ad_growth_pct ?? -999) - (a.ad_growth_pct ?? -999)
    );

    return NextResponse.json({ movers: movers.slice(0, 50) });
  } catch (err) {
    logger.error('top-movers failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ movers: [] });
  }
}
