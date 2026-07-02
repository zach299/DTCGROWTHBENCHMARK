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
}

type Metric = 'active_meta_ads' | 'growth_score' | 'est_spend' | 'creative_score';

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

function relDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'just now';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Extract a clean series for one metric: drop null/NaN, coerce numbers, sort
// by date ascending, dedupe same-day (keep the latest value for the day).
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
  active_meta_ads: { label: 'Active Meta Ads', format: (v) => Math.round(v).toLocaleString() },
  growth_score: { label: 'Growth Score', format: (v) => Math.round(v).toLocaleString() },
  est_spend: { label: 'Est. Monthly Spend', format: (v) => formatSpend(v) },
  creative_score: { label: 'Creative Score', format: (v) => Math.round(v).toLocaleString() },
};

// "Growth Over Time" — hardened snapshot history chart. The container never
// collapses (min-h) and every point count (0/1/2/3+) has an intentional state.
export default function GrowthOverTime({ history }: { history: SnapshotRow[] }) {
  const safeHistory = useMemo(() => (Array.isArray(history) ? history : []), [history]);

  const seriesByMetric = useMemo(() => {
    const out = {} as Record<Metric, ChartPoint[]>;
    (Object.keys(METRIC_META) as Metric[]).forEach((m) => {
      out[m] = seriesFor(safeHistory, m);
    });
    return out;
  }, [safeHistory]);

  // Only offer toggles whose series actually has data.
  const availableMetrics = (Object.keys(METRIC_META) as Metric[]).filter(
    (m) => seriesByMetric[m].length > 0
  );
  const [metricState, setMetric] = useState<Metric>('active_meta_ads');
  const metric: Metric = availableMetrics.includes(metricState)
    ? metricState
    : (availableMetrics[0] ?? 'active_meta_ads');

  const points = seriesByMetric[metric] ?? [];
  const { label: metricLabel, format } = METRIC_META[metric];

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

  return (
    <div className="min-h-[280px] rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Growth Over Time
          <span className="text-gray-400" title="Snapshots are recorded each time this domain is analyzed.">
            <InfoIcon width={13} height={13} />
          </span>
        </h3>
        {availableMetrics.length > 1 && (
          <div className="flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-medium">
            {availableMetrics.map((key) => (
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
        )}
      </div>

      {points.length === 0 ? (
        <EmptyState
          icon={<TrendUpIcon width={18} height={18} />}
          title="No history yet"
          body="Tambourine will start tracking this account from today. History builds with each daily snapshot."
          className="min-h-[200px]"
        />
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
            {last && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-gray-400 ring-1 ring-white/10">
                <ClockIcon width={12} height={12} />
                Last tracked {relDays(last.date)}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-6 sm:flex-row">
            {last && (
              <div className="w-full shrink-0 sm:w-[190px]">
                <div className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">
                  {format(last.value)}
                </div>
                <div className="mt-1 text-sm font-medium text-gray-500">{metricLabel}</div>
                <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                  Tracking history builds with each snapshot.
                </p>
              </div>
            )}
            <div className="min-h-[200px] min-w-0 flex-1">
              <GrowthLineChart points={points} valueLabel={metricLabel} formatValue={format} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
