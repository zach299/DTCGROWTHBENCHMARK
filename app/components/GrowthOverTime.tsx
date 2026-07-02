'use client';

import { useState } from 'react';
import GrowthLineChart from './GrowthLineChart';
import TrendPill from './TrendPill';
import { ClockIcon, InfoIcon } from './icons';

export interface SnapshotRow {
  snapshot_date: string;
  active_meta_ads: number | null;
  active_google_ads?: number | null;
  active_linkedin_ads?: number | null;
  landing_pages_count?: number | null;
  growth_score: number | null;
  growth_momentum?: string | null;
}

type Metric = 'growth_score' | 'active_meta_ads';

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

// "Growth Over Time" — snapshot history chart with summary pills. Handles
// 0/1/2-point histories gracefully.
export default function GrowthOverTime({ history }: { history: SnapshotRow[] }) {
  const [metric, setMetric] = useState<Metric>('active_meta_ads');

  const points = history
    .filter((h) => h[metric] != null)
    .map((h) => ({ date: h.snapshot_date, value: Number(h[metric]) }));

  const metaPts = history
    .filter((h) => h.active_meta_ads != null)
    .map((h) => ({ date: h.snapshot_date, value: Number(h.active_meta_ads) }));

  const last = points[points.length - 1] ?? null;
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const changeSinceLast = last && prev ? pct(last.value, prev.value) : null;
  const adsDelta =
    metaPts.length >= 2
      ? metaPts[metaPts.length - 1].value - metaPts[metaPts.length - 2].value
      : null;

  // MoM: only when history spans ~28d+. Compare latest against the snapshot
  // closest to 30 days before it.
  let mom: number | null = null;
  if (points.length >= 2 && last) {
    const lastT = new Date(last.date).getTime();
    const firstT = new Date(points[0].date).getTime();
    if (lastT - firstT >= 28 * 86_400_000) {
      const target = lastT - 30 * 86_400_000;
      let best = points[0];
      for (const p of points) {
        if (
          Math.abs(new Date(p.date).getTime() - target) <
          Math.abs(new Date(best.date).getTime() - target)
        ) {
          best = p;
        }
      }
      if (best !== last) mom = pct(last.value, best.value);
    }
  }

  const metricLabel = metric === 'growth_score' ? 'Growth Score' : 'Active Meta Ads';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header: title + info left, segmented toggle right */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Growth Over Time
          <span
            className="text-gray-400"
            title="Snapshots are recorded each time this domain is analyzed."
          >
            <InfoIcon width={13} height={13} />
          </span>
        </h3>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-medium">
          {(
            [
              ['active_meta_ads', 'Active Meta Ads'],
              ['growth_score', 'Growth Score'],
            ] as [Metric, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                metric === key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-sm font-medium text-gray-700">No history yet</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
            Snapshots are recorded each time this domain is analyzed. Check back after the next
            analysis to see the trend line build.
          </p>
        </div>
      ) : (
        <>
          {/* Pill row */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {changeSinceLast != null && (
              <TrendPill changePct={changeSinceLast} suffix="since last tracked" />
            )}
            {adsDelta != null && adsDelta !== 0 && (
              <span className="inline-flex items-center rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-300 ring-1 ring-white/10">
                {adsDelta > 0 ? '+' : ''}
                {adsDelta} active ads
              </span>
            )}
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

          {/* Body: big current value left, chart right */}
          <div className="flex flex-col gap-6 sm:flex-row">
            {last && (
              <div className="w-full shrink-0 sm:w-[200px]">
                <div className="text-5xl font-bold tracking-tight text-gray-900 tabular-nums">
                  {last.value.toLocaleString()}
                </div>
                <div className="mt-1 text-sm font-medium text-gray-500">{metricLabel}</div>
                <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                  Tracking history builds with each snapshot.
                </p>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <GrowthLineChart points={points} valueLabel={metricLabel} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
