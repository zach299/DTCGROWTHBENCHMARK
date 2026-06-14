import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 20;

const SOURCE_TABLE = process.env.SOURCE_TABLE || 'master_database';

export async function GET() {
  const supabase = createServiceClient();
  try {
    // Total Shopify stores in the source.
    const { count: total } = await supabase
      .from(SOURCE_TABLE)
      .select('*', { count: 'exact', head: true })
      .ilike('platform', '%shopify%');

    // Domains we've checked (rows in company_meta_signals) — includes ones that
    // came back with 0 active ads.
    const { count: enriched } = await supabase
      .from('company_meta_signals')
      .select('*', { count: 'exact', head: true });

    // Of those, how many actually have active Meta ads (the useful signal).
    const { count: withAdsExact } = await supabase
      .from('company_meta_signals')
      .select('*', { count: 'exact', head: true })
      .gt('active_meta_ads', 0);

    const { data: agg } = await supabase
      .from('company_meta_signals')
      .select('active_meta_ads, landing_pages')
      .limit(5000);
    let adsSum = 0;
    let lpSum = 0;
    let withAds = 0;
    for (const r of agg ?? []) {
      const a = Number(r.active_meta_ads ?? 0);
      if (a > 0) {
        adsSum += a;
        withAds += 1;
        lpSum += Array.isArray(r.landing_pages) ? r.landing_pages.length : 0;
      }
    }
    const n = (agg ?? []).length || 1;
    const advertisers = withAds || 1; // for averages among brands that have ads

    // Latest job.
    const { data: jobs } = await supabase
      .from('enrichment_jobs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1);
    const job = jobs?.[0] ?? null;
    const successRate =
      job && job.domains_processed
        ? Math.round((job.domains_successful / job.domains_processed) * 100)
        : null;

    return NextResponse.json({
      total_domains: total ?? 0,
      enriched: enriched ?? 0,
      with_ads: withAdsExact ?? 0,
      remaining: Math.max(0, (total ?? 0) - (enriched ?? 0)),
      success_rate: successRate,
      estimated_cost: job?.estimated_cost ?? 0,
      last_run: job?.started_at ?? null,
      last_completed: job?.completed_at ?? null,
      // Averages are computed only over brands that actually run ads.
      avg_active_ads: Math.round(adsSum / advertisers),
      avg_landing_pages: Math.round((lpSum / advertisers) * 10) / 10,
      pct_with_ads: Math.round((withAds / n) * 100),
    });
  } catch (err) {
    logger.error('bulk-stats failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
