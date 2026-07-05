import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Admin stats for the background refresh worker. Returns coverage metrics,
// throughput estimates, and queue depth.
export const maxDuration = 30;

const REFRESH_DAYS = parseInt(process.env.WORKER_REFRESH_DAYS ?? '30', 10);

export async function GET() {
  try {
    const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

  const [totalRes, enrichedRes, freshRes, recentDayRes, recentHourRes, top25kRes, top25kFreshRes] =
    await Promise.all([
      // Total Shopify brands in master_database
      supabase
        .from('master_database')
        .select('domain', { count: 'exact', head: true })
        .ilike('platform', '%shopify%'),

      // Total enriched (any time)
      supabase
        .from('company_meta_signals')
        .select('domain', { count: 'exact', head: true }),

      // Enriched within the refresh window
      supabase
        .from('company_meta_signals')
        .select('domain', { count: 'exact', head: true })
        .gte('last_enriched_at', cutoff),

      // Enriched in the last 24h (throughput signal)
      supabase
        .from('company_meta_signals')
        .select('domain', { count: 'exact', head: true })
        .gte('last_enriched_at', oneDayAgo),

      // Enriched in the last hour
      supabase
        .from('company_meta_signals')
        .select('domain', { count: 'exact', head: true })
        .gte('last_enriched_at', oneHourAgo),

      // Top 25k by sales_numeric — total
      supabase
        .from('master_database')
        .select('domain', { count: 'exact', head: true })
        .ilike('platform', '%shopify%')
        .not('sales_numeric', 'is', null)
        .order('sales_numeric', { ascending: false, nullsFirst: false })
        .limit(25000),

      // Top 25k — how many are fresh
      supabase
        .from('company_meta_signals')
        .select('domain', { count: 'exact', head: true })
        .gte('last_enriched_at', cutoff),
    ]);

  const total = totalRes.count ?? 0;
  const enriched = enrichedRes.count ?? 0;
  const fresh = freshRes.count ?? 0;
  const last24h = recentDayRes.count ?? 0;
  const lastHour = recentHourRes.count ?? 0;
  const top25k = Math.min(top25kRes.count ?? 0, 25000);
  const top25kFresh = top25kFreshRes.count ?? 0;

  const queueDepth = total - fresh;
  const top25kQueue = Math.max(0, top25k - top25kFresh);

  // Days to clear top 25k at current 24h throughput
  const daysToRefresh25k = last24h > 0 ? Math.ceil(top25kQueue / last24h) : null;
  // Days to clear all 100k
  const daysToEnrichAll = last24h > 0 ? Math.ceil((total - enriched) / last24h) : null;

  return NextResponse.json({
    total_brands: total,
    enriched_ever: enriched,
    fresh_within_window: fresh,
    stale_or_unenriched: queueDepth,
    coverage_pct: total > 0 ? Math.round((enriched / total) * 1000) / 10 : 0,
    freshness_pct: total > 0 ? Math.round((fresh / total) * 1000) / 10 : 0,
    top_25k: {
      total: top25k,
      fresh: top25kFresh,
      queue_depth: top25kQueue,
      coverage_pct: top25k > 0 ? Math.round((top25kFresh / top25k) * 1000) / 10 : 0,
    },
    throughput: {
      last_24h: last24h,
      last_hour: lastHour,
      per_minute_estimate: lastHour > 0 ? Math.round((lastHour / 60) * 10) / 10 : null,
    },
    estimates: {
      days_to_refresh_top25k: daysToRefresh25k,
      days_to_enrich_all: daysToEnrichAll,
    },
    refresh_window_days: REFRESH_DAYS,
    generated_at: new Date().toISOString(),
  });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'stats failed' },
      { status: 500 }
    );
  }
}
