'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SpendEstimate } from '@/lib/adSpend';
import { formatSpend, revenueMidM } from '@/lib/adSpend';
import { buildReason } from '@/lib/reason';
import Skeleton from './Skeleton';
import MiniSparkline from './MiniSparkline';
import SpendEstimateBadge, { SPEND_HELPER } from './SpendEstimateBadge';

export interface Mover {
  rank: number;
  domain: string;
  company_name: string | null;
  primary_category?: string | null;
  active_meta_ads: number;
  google_ads?: number;
  linkedin_ads?: number;
  growth_score?: number;
  growth_momentum: string | null;
  estimated_revenue_range?: string | null;
  spend_band?: string | null;
  landing_pages_count: number;
  percentile_top: number | null;
  last_enriched_at: string | null;
  real_creative_score?: number | null;
  dpa_share?: number | null;
  spend_estimate?: SpendEstimate | null;
  change_30d?: number | null; // optional — rendered only when the API provides it
  history?: number[]; // optional — sparkline only when present in row data
}

const MOMENTUM_TONE: Record<string, string> = {
  Exploding: 'text-emerald-400',
  Accelerating: 'text-emerald-400',
  Scaling: 'text-teal-300',
  Emerging: 'text-amber-400',
  Dormant: 'text-gray-500',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type SortKey =
  | 'fastest'
  | 'spend'
  | 'meta'
  | 'google'
  | 'linkedin'
  | 'top1'
  | 'new';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'fastest', label: 'Fastest Growing' },
  { key: 'spend', label: 'Highest Est. Spend' },
  { key: 'meta', label: 'Most Meta Ads' },
  { key: 'google', label: 'Top Google' },
  { key: 'linkedin', label: 'Top LinkedIn' },
  { key: 'top1', label: 'Entering Top 1%' },
  { key: 'new', label: 'Newly Enriched' },
];

export default function TopMoversView({ onSelect }: { onSelect: (d: string) => void }) {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('fastest');
  const [cat, setCat] = useState<string>('');
  const [minRevM, setMinRevM] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/top-movers');
        const d = await r.json();
        setMovers(d.movers ?? []);
        setCategories(d.categories ?? []);
        setTotal(d.total ?? 0);
      } catch {
        setMovers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    let list = cat ? movers.filter((m) => m.primary_category === cat) : [...movers];
    if (minRevM > 0) {
      list = list.filter((m) => {
        const mid = revenueMidM(m.estimated_revenue_range);
        return mid != null && mid >= minRevM;
      });
    }
    switch (sort) {
      case 'spend':
        list.sort((a, b) => (b.spend_estimate?.high ?? 0) - (a.spend_estimate?.high ?? 0));
        break;
      case 'meta':
        list.sort((a, b) => b.active_meta_ads - a.active_meta_ads);
        break;
      case 'google':
        list = list.filter((m) => (m.google_ads ?? 0) > 0);
        list.sort((a, b) => (b.google_ads ?? 0) - (a.google_ads ?? 0));
        break;
      case 'linkedin':
        list = list.filter((m) => (m.linkedin_ads ?? 0) > 0);
        list.sort((a, b) => (b.linkedin_ads ?? 0) - (a.linkedin_ads ?? 0));
        break;
      case 'top1':
        list = list.filter((m) => m.percentile_top != null && m.percentile_top <= 1);
        break;
      case 'new':
        list.sort((a, b) => (b.last_enriched_at ?? '').localeCompare(a.last_enriched_at ?? ''));
        break;
      default:
        break; // API order = growth score rank
    }
    return list;
  }, [movers, sort, cat, minRevM]);

  // Header stat cards, computed from the full ranked set.
  const stats = useMemo(() => {
    if (movers.length === 0) return null;
    const top1 = movers.filter((m) => m.percentile_top != null && m.percentile_top <= 1).length;
    const advertisers = movers.filter((m) => m.active_meta_ads > 0);
    const avgAds =
      advertisers.length > 0
        ? Math.round(advertisers.reduce((s, m) => s + m.active_meta_ads, 0) / advertisers.length)
        : 0;
    const totalSpendMid = movers.reduce(
      (s, m) => (m.spend_estimate ? s + (m.spend_estimate.low + m.spend_estimate.high) / 2 : s),
      0
    );
    return { top1, avgAds, totalSpendMid };
  }, [movers]);

  const brand = (m: Mover) => m.company_name || m.domain.replace(/^www\./, '').split('.')[0];
  const anyChange = rows.some((m) => m.change_30d != null);
  const anyHistory = rows.some((m) => Array.isArray(m.history) && m.history.length >= 2);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Top Movers</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {total > 0
            ? `${total.toLocaleString()} companies tracked · ranked by Growth Score`
            : 'The companies accelerating their paid growth right now'}
        </p>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        stats && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ['Companies Tracked', total.toLocaleString(), null],
                ['In Top 1%', stats.top1.toLocaleString(), 'by growth score'],
                ['Avg Active Ads', stats.avgAds.toLocaleString(), 'among active advertisers'],
                [
                  'Est. Monthly Spend Tracked',
                  stats.totalSpendMid > 0 ? `~${formatSpend(stats.totalSpendMid)}` : '—',
                  'sum of band midpoints · estimate',
                ],
              ] as [string, string, string | null][]
            ).map(([label, val, sub]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
                <div className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{val}</div>
                {sub && <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div>}
              </div>
            ))}
          </div>
        )
      )}

      {/* Sort / filter controls */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              sort === s.key
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
        <select
          value={minRevM}
          onChange={(e) => setMinRevM(Number(e.target.value))}
          className="ml-auto rounded-md border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
          title="Minimum estimated revenue"
        >
          <option value={0}>Any revenue</option>
          <option value={1}>≥ $1M</option>
          <option value={10}>≥ $10M</option>
          <option value={50}>≥ $50M</option>
          <option value={100}>≥ $100M</option>
        </select>
        {categories.length > 0 && (
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <div className="text-sm font-medium text-gray-700">No companies match this view</div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">
            {movers.length === 0
              ? 'No companies enriched yet. Run a batch in Bulk Enrichment to build the leaderboard.'
              : 'Try a different sort or clear the category filter.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2.5 w-14">Rank</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Company</th>
                  <th className="hidden px-3 py-2.5 lg:table-cell">Category</th>
                  <th className="hidden px-3 py-2.5 text-right md:table-cell">Est. Revenue</th>
                  <th className="px-3 py-2.5 text-right" title={SPEND_HELPER}>
                    Est. Mo. Spend
                  </th>
                  <th className="px-3 py-2.5 text-right">Meta Ads</th>
                  <th className="hidden px-3 py-2.5 text-right sm:table-cell">Score</th>
                  <th className="hidden px-3 py-2.5 xl:table-cell">Momentum</th>
                  <th className="hidden min-w-[220px] px-3 py-2.5 2xl:table-cell">Why interesting</th>
                  {anyChange && <th className="hidden px-3 py-2.5 text-right xl:table-cell">Δ 30d</th>}
                  {anyHistory && <th className="hidden px-3 py-2.5 xl:table-cell">Trend</th>}
                  <th className="hidden px-4 py-2.5 text-right lg:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((m) => (
                  <tr
                    key={m.domain}
                    onClick={() => onSelect(m.domain)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-2.5 text-[13px] font-bold tabular-nums text-gray-400">
                      #{m.rank}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold capitalize text-gray-900">{brand(m)}</span>
                        {m.percentile_top != null && m.percentile_top <= 5 && (
                          <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                            Top {m.percentile_top}%
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-gray-400">{m.domain}</div>
                    </td>
                    <td className="hidden max-w-[140px] truncate px-3 py-2.5 text-xs text-gray-500 lg:table-cell">
                      {m.primary_category ?? '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-xs text-gray-600 md:table-cell">
                      {m.estimated_revenue_range && m.estimated_revenue_range !== 'Unknown'
                        ? m.estimated_revenue_range
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <SpendEstimateBadge estimate={m.spend_estimate} compact />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                      {m.active_meta_ads.toLocaleString()}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-gray-600 sm:table-cell">
                      {m.growth_score ?? '—'}
                    </td>
                    <td className={`hidden whitespace-nowrap px-3 py-2.5 text-xs font-semibold xl:table-cell ${MOMENTUM_TONE[m.growth_momentum ?? ''] ?? 'text-gray-400'}`}>
                      {m.growth_momentum ?? '—'}
                    </td>
                    <td className="hidden max-w-[300px] px-3 py-2.5 text-[12px] leading-snug text-gray-500 2xl:table-cell">
                      {buildReason({
                        metaAds: m.active_meta_ads,
                        realCreativeScore: m.real_creative_score,
                        dpaShare: m.dpa_share,
                        momentum: m.growth_momentum,
                        growthScore: m.growth_score,
                        spend: m.spend_estimate ?? null,
                        landingPages: m.landing_pages_count,
                      })}
                    </td>
                    {anyChange && (
                      <td className="hidden px-3 py-2.5 text-right text-xs tabular-nums xl:table-cell">
                        {m.change_30d != null ? (
                          <span className={m.change_30d >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {m.change_30d > 0 ? '+' : ''}
                            {m.change_30d}%
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    )}
                    {anyHistory && (
                      <td className="hidden px-3 py-2.5 xl:table-cell">
                        {Array.isArray(m.history) && m.history.length >= 2 ? (
                          <MiniSparkline values={m.history} />
                        ) : null}
                      </td>
                    )}
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-right text-[11px] text-gray-400 lg:table-cell">
                      {relativeTime(m.last_enriched_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
