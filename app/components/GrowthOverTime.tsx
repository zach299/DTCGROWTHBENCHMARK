'use client';

import { useMemo, useState } from 'react';
import GrowthLineChart, { type ChartPoint } from './GrowthLineChart';
import TrendPill from './TrendPill';
import EmptyState from './EmptyState';
import { ClockIcon, InfoIcon, TrendUpIcon } from './icons';
import { estimateMonthlySpend, formatSpend } from '@/lib/adSpend';

export interface SnapshotRow {
  snapshot_date: string;
  active_meta_ads: number | null;
  active_google_ads?: number | null;
  active_linkedin_ads?: number | null;
  landing_pages_count?: number | null;
  growth_score: number | null;
  growth_momentum?: string | null;
  creative_score?: number | null;
  source?: string;
  run_id?: string;
}

type Metric = 'active_meta_ads' | 'growth_score' | 'est_spend';

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

function relDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Extract a clean series for one metric: drop null/NaN, coerce numbers, sort
// by date ascending, dedupe same-day (keep the latest value for the day).
// Est. Annual Spend is computed per snapshot as the estimateAdSpend
// band midpoint from that snapshot's ad/landing-page fields.
function seriesFor(history: SnapshotRow[], metric: Metric): ChartPoint[] {
  const raw = history
    .map((h) => {
      let v: number | null | undefined;
      if (metric === 'est_spend') {
        const est = estimateMonthlySpend({
          metaAds: Number(h.active_meta_ads ?? 0),
          googleAds: h.active_google_ads != null ? Number(h.active_google_ads) : null,
          linkedinAds: h.active_linkedin_ads != null ? Number(h.active_linkedin_ads) : null,
          landingPages: h.landing_pages_count != null ? Number(h.landing_pages_count) : null,
        });
        v = est ? (est.low + est.high) / 2 : null;
      } else {
        v = h[metric];
      }
      const n = v == null ? NaN : Number(v);
      return { date: h.snapshot_date, value: n };
    })
    .filter((p) => p.date && Number.isFinite(p.value) && Number.isFinite(new Date(p.date).getTime()));

  raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const byDay = new Map<string, ChartPoint>();
  for (const p of raw) byDay.set(p.date.slice(0, 10), p); // later entries win
  return [...byDay.values()];
}

const METRIC_META: Record<Metric, { label: string; format: (v: number) => string }> = {
  growth_score: { label: 'Growth Score', format: (v) => Math.round(v).toLocaleString() },
  active_meta_ads: { label: 'Active Meta Ads', format: (v) => Math.round(v).toLocaleString() },
  est_spend: { label: 'Est. Annual Spend', format: (v) => formatSpend(v) },
};

const METRICS = Object.keys(METRIC_META) as Metric[];

function RefreshPill({ failed }: { failed: boolean }) {
  return failed ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/30">
      Refresh failed — showing last snapshot
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-500 ring-1 ring-indigo-500/30">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
      Refreshing latest ad signals…
    </span>
  );
}

// "Growth Over Time" — hardened snapshot history chart. The container never
// collapses (min-h) and every state (loading / 0 / 1 / 2+ points, refreshing,
// refresh-failed) is intentional. History is owned by the page's dedicated
// history slot — this component only renders what it's given and never blanks
// an existing chart while a background refresh runs.
export default function GrowthOverTime({
  history,
  loading = false,
  refreshing = false,
  refreshFailed = false,
}: {
  history: SnapshotRow[] | null;
  /** Initial history fetch in flight and nothing to show yet. */
  loading?: boolean;
  /** Background enrichment running while existing history stays on screen. */
  refreshing?: boolean;
  /** Background refresh failed — keep the chart, show an inline note. */
  refreshFailed?: boolean;
}) {
  const safeHistory = useMemo(() => (Array.isArray(history) ? history : []), [history]);

  const seriesByMetric = useMemo(() => {
    const out = {} as Record<Metric, ChartPoint[]>;
    METRICS.forEach((m) => {
      out[m] = seriesFor(safeHistory, m);
    });
    return out;
  }, [safeHistory]);

  const [metric, setMetric] = useState<Metric>('growth_score');
  const points = seriesByMetric[metric] ?? [];
  const { label: metricLabel, format } = METRIC_META[metric];

  // Snapshot count / freshness across the whole history (not just this metric).
  const snapshotDates = useMemo(() => {
    const days = new Set<string>();
    let latest: string | null = null;
    for (const h of safeHistory) {
      if (!h.snapshot_date || !Number.isFinite(new Date(h.snapshot_date).getTime())) continue;
      days.add(h.snapshot_date.slice(0, 10));
      if (latest == null || h.snapshot_date > latest) latest = h.snapshot_date;
    }
    return { count: days.size, latest };
  }, [safeHistory]);

  const last = points[points.length - 1] ?? null;
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const changeSinceLast = last && prev ? pct(last.value, prev.value) : null;
  const deltaSinceLast = last && prev ? last.value - prev.value : null;

  // MoM: only when history spans >= 28 days.
  let mom: number | null = null;
  if (points.length >= 2 && last) {
    const lastT = new Date(last.date).getTime();
    const firstT = new Date(points[0].date).getTime();
    if (lastT - firstT >= 28 * 86_400_000) {
      const target = lastT - 30 * 86_400_000;
      let best = points[0];
      for (const p of points) {
        if (Math.abs(new Date(p.date).getTime() - target) < Math.abs(new Date(best.date).getTime() - target)) {
          best = p;
        }
      }
      if (best !== last) mom = pct(last.value, best.value);
    }
  }

  const initialLoading = loading && safeHistory.length === 0;

  // Mixed-source series: a seeded baseline row plus at least one other row.
  const mixedSources = useMemo(
    () =>
      safeHistory.some((h) => h.run_id === 'seed-from-last-enrichment') &&
      safeHistory.some((h) => h.run_id !== 'seed-from-last-enrichment'),
    [safeHistory]
  );

  return (
    <div className="min-h-[280px] rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header row: title + metric toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Growth Over Time
          <span className="text-gray-400" title="Snapshots are recorded each time this domain is analyzed.">
            <InfoIcon width={13} height={13} />
          </span>
        </h3>
        <div className="flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-medium">
          {METRICS.map((key) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                metric === key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {METRIC_META[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-row: freshness caption + refresh status pill */}
      <div className="mb-3 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-gray-400">
        {snapshotDates.latest && (
          <span className="inline-flex items-center gap-1">
            <ClockIcon width={11} height={11} />
            Last updated {relDays(snapshotDates.latest)}
          </span>
        )}
        {snapshotDates.count > 0 && (
          <span>
            {snapshotDates.count} snapshot{snapshotDates.count === 1 ? '' : 's'}
          </span>
        )}
        {(refreshing || refreshFailed) && safeHistory.length > 0 && <RefreshPill failed={refreshFailed} />}
      </div>

      {initialLoading ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
          <span className="h-2 w-40 animate-pulse rounded-full bg-gray-100" />
          <div className="text-sm font-medium text-gray-500">Loading company history…</div>
        </div>
      ) : safeHistory.length === 0 || snapshotDates.count === 0 ? (
        <EmptyState
          icon={<TrendUpIcon width={18} height={18} />}
          title="No historical snapshots yet — Tambourine starts tracking from today."
          body="History builds with each daily snapshot."
          className="min-h-[200px]"
        />
      ) : points.length === 0 ? (
        /* This metric has no valid points even though history exists. */
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-center">
            <div className="text-sm font-medium text-gray-600">Not enough history for this metric yet</div>
            <p className="mt-1 text-[11px] text-gray-400">
              {metricLabel} will appear here once a snapshot records it.
            </p>
          </div>
        </div>
      ) : points.length === 1 ? (
        /* "Tracking started" — compact and intentional, not a giant lonely number. */
        <div className="flex min-h-[200px] flex-col justify-center">
          <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-gray-50 px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              Tracking started
            </div>
            <div className="mt-2 flex items-baseline gap-2.5">
              <span className="text-3xl font-bold tabular-nums text-gray-900">{format(points[0].value)}</span>
              <span className="text-sm font-medium text-gray-500">{metricLabel}</span>
            </div>
            <div className="mt-1 text-xs text-gray-400">{fmtDate(points[0].date)}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
              Next observed snapshot expected after the next daily top-50k pull. The real
              trend line appears automatically at 2+ snapshots.
            </p>
            {/* subtle baseline graphic */}
            <svg viewBox="0 0 320 28" className="mt-4 w-full" aria-hidden="true">
              <line x1="0" y1="20" x2="320" y2="20" stroke="currentColor" className="text-white/[0.08]" strokeDasharray="4 5" />
              <circle cx="304" cy="20" r="4" fill="#818cf8" />
              <circle cx="304" cy="20" r="8" fill="#818cf8" opacity="0.2" />
            </svg>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              History builds with each daily snapshot.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary pills — each renders only when computable */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {last && (
              <span className="inline-flex items-baseline gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 ring-1 ring-white/10">
                <span className="text-sm font-bold tabular-nums text-gray-900">{format(last.value)}</span>
                <span className="text-[11px] font-medium text-gray-400">{metricLabel}</span>
              </span>
            )}
            {deltaSinceLast != null && deltaSinceLast !== 0 && (
              <span className="inline-flex items-center rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-300 ring-1 ring-white/10">
                {deltaSinceLast > 0 ? '+' : '−'}
                {format(Math.abs(deltaSinceLast))} since last tracked
              </span>
            )}
            {changeSinceLast != null && <TrendPill changePct={changeSinceLast} suffix="change" />}
            {mom != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-400 ring-1 ring-white/10">
                MoM growth
                <span className={mom >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {mom > 0 ? '+' : ''}
                  {mom}%
                </span>
              </span>
            )}
          </div>

          {/* Chart spans the full card width */}
          <div className="min-h-[200px] w-full">
            <GrowthLineChart points={points} valueLabel={metricLabel} formatValue={format} />
          </div>
          {mixedSources && (
            <p className="mt-2 text-[11px] text-gray-400">
              Includes baseline from first enrichment plus daily observed pulls.
            </p>
          )}
        </>
      )}
    </div>
  );
}
