'use client';

import { useState } from 'react';
import GrowthLineChart from './GrowthLineChart';
import TrendPill from './TrendPill';

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
  if (days <= 0) return 'today';
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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Growth Over Time</h3>
        <div className="flex rounded-lg border border-gray-200 p-0.5 text-[11px] font-medium">
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
          <GrowthLineChart
            points={points}
            valueLabel={metric === 'growth_score' ? 'Growth Score' : 'Active Meta Ads'}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {changeSinceLast != null && (
              <TrendPill changePct={changeSinceLast} suffix="since last tracked" />
            )}
            {adsDelta != null && adsDelta !== 0 && (
              <TrendPill
                changePct={adsDelta}
                label={`${adsDelta > 0 ? '+' : ''}${adsDelta} active ads`}
              />
            )}
            {mom != null && <TrendPill changePct={mom} label={`MoM: ${mom > 0 ? '+' : ''}${mom}%`} />}
            {last && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-gray-400 ring-1 ring-white/10">
                Last tracked: {relDays(last.date)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
