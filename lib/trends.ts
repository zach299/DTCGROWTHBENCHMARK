import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

export interface SnapshotMetrics {
  active_meta_ads: number;
  landing_pages_count: number;
  estimated_revenue: number;
  growth_score: number;
  northbeam_fit: number;
  paid_media_intensity: string;
  creative_velocity: string;
  campaign_diversity: string;
}

export interface TrendValue {
  window_days: number;
  current: number;
  previous: number | null;
  change_pct: number | null; // null when no prior snapshot in window
  direction: 'up' | 'down' | 'flat' | null;
  label: string; // e.g. "+34% (30d)" or "new"
}

export interface Trends {
  active_meta_ads: TrendValue[]; // 7, 30, 90
  growth_score: TrendValue; // 30
  landing_pages: TrendValue; // 30
}

interface SnapshotRow {
  snapshot_date: string;
  active_meta_ads: number | null;
  landing_pages_count: number | null;
  growth_score: number | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Write one snapshot per domain per day. Never overwrites an existing day —
 * historical snapshots are immutable, so the dataset compounds over time.
 */
export async function writeSnapshot(
  supabase: SupabaseClient,
  domain: string,
  m: SnapshotMetrics,
  rawMeta: unknown
): Promise<void> {
  const snapshot_date = todayISO();
  try {
    const { data: existing } = await supabase
      .from('domain_snapshots')
      .select('id')
      .eq('domain', domain)
      .eq('snapshot_date', snapshot_date)
      .maybeSingle();
    if (existing) return; // already snapshotted today

    const { error } = await supabase.from('domain_snapshots').insert({
      domain,
      snapshot_date,
      active_meta_ads: m.active_meta_ads,
      landing_pages_count: m.landing_pages_count,
      estimated_revenue: m.estimated_revenue,
      growth_score: m.growth_score,
      northbeam_fit: m.northbeam_fit,
      paid_media_intensity: m.paid_media_intensity,
      creative_velocity: m.creative_velocity,
      campaign_diversity: m.campaign_diversity,
      raw_meta_data: rawMeta ?? null,
    });
    if (error) logger.error('snapshot insert failed', { error: error.message });
  } catch (err) {
    logger.error('writeSnapshot failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

// Find the snapshot closest to (today - window) without being newer than that,
// i.e. the best representation of the metric `window` days ago.
function valueAt(
  rows: SnapshotRow[],
  field: 'active_meta_ads' | 'landing_pages_count' | 'growth_score',
  windowDays: number
): number | null {
  const target = Date.now() - windowDays * 86_400_000;
  let best: SnapshotRow | null = null;
  for (const r of rows) {
    const t = new Date(r.snapshot_date).getTime();
    if (t > target + 86_400_000) continue; // newer than the window edge
    if (r[field] == null) continue;
    if (!best || daysBetween(r.snapshot_date, new Date(target).toISOString()) <
      daysBetween(best.snapshot_date, new Date(target).toISOString())) {
      best = r;
    }
  }
  return best ? (best[field] as number) : null;
}

function buildTrend(current: number, previous: number | null, windowDays: number): TrendValue {
  if (previous == null) {
    return {
      window_days: windowDays,
      current,
      previous: null,
      change_pct: null,
      direction: null,
      label: 'tracking',
    };
  }
  let pct: number;
  if (previous === 0) pct = current > 0 ? 100 : 0;
  else pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const sign = pct > 0 ? '+' : '';
  return {
    window_days: windowDays,
    current,
    previous,
    change_pct: pct,
    direction,
    label: `${sign}${pct}% (${windowDays}d)`,
  };
}

/**
 * Compute trend deltas for a domain by comparing the current metrics against
 * historical snapshots.
 */
export async function getTrends(
  supabase: SupabaseClient,
  domain: string,
  current: { active_meta_ads: number; landing_pages_count: number; growth_score: number }
): Promise<Trends> {
  let rows: SnapshotRow[] = [];
  try {
    const { data } = await supabase
      .from('domain_snapshots')
      .select('snapshot_date, active_meta_ads, landing_pages_count, growth_score')
      .eq('domain', domain)
      .order('snapshot_date', { ascending: false })
      .limit(200);
    rows = (data ?? []) as SnapshotRow[];
  } catch (err) {
    logger.error('getTrends fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    active_meta_ads: [7, 30, 90].map((w) =>
      buildTrend(current.active_meta_ads, valueAt(rows, 'active_meta_ads', w), w)
    ),
    growth_score: buildTrend(current.growth_score, valueAt(rows, 'growth_score', 30), 30),
    landing_pages: buildTrend(
      current.landing_pages_count,
      valueAt(rows, 'landing_pages_count', 30),
      30
    ),
  };
}
