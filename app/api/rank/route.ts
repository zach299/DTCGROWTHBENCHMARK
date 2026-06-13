import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { normalizeDomain } from '@/lib/utils/domain';
import { fetchAllEnriched } from '../benchmarks/route';
import { channelBenchmarks, rankOf, percentileTop, type BenchRow } from '@/lib/benchmarks';

// A company's full ranking picture: overall Growth Rank, category rank, and
// per-channel (Meta/Google/LinkedIn) benchmarks vs. the enriched dataset.
export const maxDuration = 20;

export async function POST(request: Request) {
  let body: {
    domain?: string;
    active_meta_ads?: number;
    google_ads?: number;
    linkedin_ads?: number;
    primary_category?: string;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const supabase = createServiceClient();
  try {
    const domain = body.domain ? normalizeDomain(body.domain) : null;

    // Resolve the company's own numbers (prefer stored, fall back to provided).
    let meta = Number(body.active_meta_ads ?? 0);
    let google = Number(body.google_ads ?? 0);
    let linkedin = Number(body.linkedin_ads ?? 0);
    let category = body.primary_category ?? null;
    let growthScore = 0;
    if (domain) {
      const { data } = await supabase
        .from('company_meta_signals')
        .select('active_meta_ads, google_ads, linkedin_ads, primary_category, growth_score')
        .eq('domain', domain)
        .maybeSingle();
      if (data) {
        meta = Number(data.active_meta_ads ?? meta);
        google = Number(data.google_ads ?? google);
        linkedin = Number(data.linkedin_ads ?? linkedin);
        category = (data.primary_category as string) ?? category;
        growthScore = Number(data.growth_score ?? 0);
      }
    }

    const all = await fetchAllEnriched(supabase);
    const total = all.length;
    const peers: BenchRow[] = category ? all.filter((r) => r.primary_category === category) : [];

    // Overall Growth Rank by growth_score (falls back to meta ads if no score).
    const scoreField: keyof BenchRow = growthScore > 0 ? 'growth_score' : 'active_meta_ads';
    const myScore = growthScore > 0 ? growthScore : meta;
    const allScores = all.map((r) => Number(r[scoreField]) || 0);
    const rank = rankOf(myScore, allScores);
    const percentile_top = percentileTop(myScore, allScores);

    // Category Growth Rank.
    let category_rank: number | null = null;
    let category_total: number | null = null;
    let category_percentile_top: number | null = null;
    if (category && peers.length) {
      const peerScores = peers.map((r) => Number(r[scoreField]) || 0);
      category_rank = rankOf(myScore, peerScores);
      category_total = peers.length;
      category_percentile_top = percentileTop(myScore, peerScores);
    }

    const channels = channelBenchmarks({ meta, google, linkedin }, all, peers);

    return NextResponse.json({
      rank,
      total,
      percentile_top,
      primary_category: category,
      category_rank,
      category_total,
      category_percentile_top,
      channels,
    });
  } catch (err) {
    logger.error('rank failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ rank: null, total: 0, percentile_top: null, channels: [] });
  }
}
