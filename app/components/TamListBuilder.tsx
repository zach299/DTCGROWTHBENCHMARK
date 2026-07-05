'use client';

// Build TAM List — filter bar + dense results table over /api/tam, with
// client-side CSV export and MVP free-tier gating (localStorage counters
// namespaced by the signed-in Supabase user id). Browsing and filtering are
// unlimited; exports and research brief opens are quota'd per calendar month.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TamFilters } from '@/lib/tamQuery';
import type { SpendEstimate } from '@/lib/adSpend';
import Skeleton from './Skeleton';
import { useAuth } from './AuthProvider';
import EmptyState from './EmptyState';
import {
  DownloadIcon,
  DocIcon,
  StarIcon,
  CopyIcon,
  SparkleIcon,
  SearchIcon,
  XIcon,
} from './icons';

export interface TamAccount {
  domain: string;
  company_name: string | null;
  category: string | null;
  platform: string | null;
  revenue_range: string | null;
  spend_estimate: SpendEstimate | null;
  growth_score: number | null;
  growth_momentum: string | null;
  active_meta_ads: number | null;
  last_enriched_at: string | null;
  reason: string;
  outbound_angle: string;
  rank: number;
  snapshot_count: number;
  trend_status: 'not_started' | 'tracking_started' | 'trend_ready';
}

function TrendChip({ status, count }: { status: TamAccount['trend_status']; count: number }) {
  if (status === 'trend_ready') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 ring-1 ring-emerald-500/25">
        Trend ✓ ({count})
      </span>
    );
  }
  if (status === 'tracking_started') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-gray-500/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-400/25">
        Tracking
      </span>
    );
  }
  return null;
}

interface TamResponse {
  accounts: TamAccount[];
  total_matched: number;
  total_tracked: number;
  applied_filters: string[];
  filters: TamFilters;
}

// ---- free-tier gating (MVP: localStorage, no auth) ----
const EXPORT_LIMIT_PER_MONTH = 3;
const EXPORT_ROW_CAP = 25;
const BRIEF_LIMIT_PER_MONTH = 10;

// Keys are namespaced by Supabase user id, e.g. `<user-id>:tam_exports_2026-07`.
function monthKey(prefix: string, uid: string): string {
  const d = new Date();
  return `${uid}:${prefix}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getCount(prefix: string, uid: string): number {
  try {
    return Number(localStorage.getItem(monthKey(prefix, uid)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function bumpCount(prefix: string, uid: string): number {
  const next = getCount(prefix, uid) + 1;
  try {
    localStorage.setItem(monthKey(prefix, uid), String(next));
  } catch {
    /* noop */
  }
  return next;
}

const MOMENTUM_OPTIONS = ['Exploding', 'Accelerating', 'Scaling', 'Emerging', 'Dormant'];
const MOMENTUM_DOT: Record<string, string> = {
  Exploding: 'bg-emerald-400',
  Accelerating: 'bg-emerald-400',
  Scaling: 'bg-teal-400',
  Emerging: 'bg-amber-400',
  Dormant: 'bg-gray-500',
};
const MOMENTUM_TEXT: Record<string, string> = {
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

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Favicon({ domain }: { domain: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[9px] font-bold uppercase text-gray-400">
        {domain.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={24}
      height={24}
      className="shrink-0 rounded-md bg-white/[0.06]"
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
    />
  );
}

function UpgradeModal({
  kind,
  onClose,
}: {
  kind: 'export' | 'brief';
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20">
            <SparkleIcon width={17} height={17} />
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <XIcon width={16} height={16} />
          </button>
        </div>
        <h3 className="mt-4 text-base font-bold text-gray-900">
          {kind === 'export' ? "You've used your free exports this month." : "You've used your free research briefs this month."}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Tambourine Pro unlocks unlimited exports and briefs, plus larger TAM lists and alerts.
        </p>
        <a
          href="mailto:zach@tambourinegrowth.com?subject=Tambourine%20Pro"
          className="mt-5 block w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Upgrade to Tambourine Pro
        </a>
        <p className="mt-3 text-center text-xs font-medium text-gray-400">
          Upgrades are handled over email for now — we reply fast.
        </p>
      </div>
    </div>
  );
}

export default function TamListBuilder({
  initialQuery,
  onOpenBrief,
}: {
  initialQuery?: string | null;
  onOpenBrief: (domain: string) => void;
}) {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';
  const [data, setData] = useState<TamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catOptions, setCatOptions] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<'export' | 'brief' | null>(null);
  const [quota, setQuota] = useState({ exports: 0, briefs: 0 });
  const reqId = useRef(0);
  const lastBody = useRef<{ query?: string; filters?: TamFilters }>({ filters: { sort: 'growth' } });

  // Filter controls
  const [category, setCategory] = useState('');
  const [momentum, setMomentum] = useState('');
  const [minScore, setMinScore] = useState('');
  const [minMeta, setMinMeta] = useState('');
  const [revMin, setRevMin] = useState('');
  const [revMax, setRevMax] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [newlyEnriched, setNewlyEnriched] = useState(false);
  const [top1pct, setTop1pct] = useState(false);
  const [sort, setSort] = useState<'growth' | 'spend' | 'meta_ads' | 'newest'>('growth');

  useEffect(() => {
    setQuota({ exports: getCount('tam_exports', uid), briefs: getCount('tam_briefs', uid) });
  }, [uid]);

  const runQuery = useCallback(async (body: { query?: string; filters?: TamFilters }) => {
    const id = ++reqId.current;
    lastBody.current = body;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/tam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, limit: 200 }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = await r.json().catch(() => ({}));
      if (id !== reqId.current) return;
      if (!r.ok) {
        setError(d.error || 'Query failed — please try again.');
        setData(null);
        return;
      }
      setData(d as TamResponse);
      setCatOptions((prev) => {
        const s = new Set(prev);
        for (const a of (d as TamResponse).accounts) if (a.category) s.add(a.category);
        return [...s].sort();
      });
    } catch (e) {
      if (id === reqId.current)
        setError(
          e instanceof Error && e.name === 'TimeoutError'
            ? 'Building the list took too long.'
            : 'Network error — please try again.'
        );
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Initial load: natural-language query (from the homepage prompt) or default.
  useEffect(() => {
    if (initialQuery) {
      runQuery({ query: initialQuery });
    } else {
      runQuery({ filters: { sort: 'growth' } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Sync filter controls from the API's parsed filters (once per response).
  const lastSynced = useRef<TamFilters | null>(null);
  useEffect(() => {
    const f = data?.filters;
    if (!f || f === lastSynced.current) return;
    lastSynced.current = f;
    setCategory(f.category ?? '');
    setMomentum(f.momentum?.length === 1 ? f.momentum[0] : '');
    setMinScore(f.growthScoreMin != null ? String(f.growthScoreMin) : '');
    setMinMeta(f.metaAdsMin != null ? String(f.metaAdsMin) : '');
    setRevMin(f.revenueMinM != null ? String(f.revenueMinM) : '');
    setRevMax(f.revenueMaxM != null ? String(f.revenueMaxM) : '');
    setMinSpend(f.spendMinMo != null ? String(Math.round(f.spendMinMo / 1000)) : '');
    setNewlyEnriched(Boolean(f.newlyEnriched));
    setTop1pct(Boolean(f.top1pct));
    setSort(f.sort ?? 'growth');
  }, [data]);

  function currentFilters(): TamFilters {
    const f: TamFilters = { sort };
    if (category) f.category = category;
    if (momentum) f.momentum = [momentum];
    else if (data?.filters.momentum?.length) f.momentum = data.filters.momentum;
    if (minScore) f.growthScoreMin = Number(minScore);
    if (minMeta) f.metaAdsMin = Number(minMeta);
    if (revMin) f.revenueMinM = Number(revMin);
    if (revMax) f.revenueMaxM = Number(revMax);
    if (minSpend) f.spendMinMo = Number(minSpend) * 1000;
    if (newlyEnriched) f.newlyEnriched = true;
    if (top1pct) f.top1pct = true;
    return f;
  }

  function applyFilters() {
    runQuery({ filters: currentFilters() });
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function copyText(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(msg);
    } catch {
      flash('Copy failed');
    }
  }

  async function save(a: TamAccount) {
    try {
      const r = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: a.domain, brand_name: a.company_name, list_name: 'Prospects' }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      flash(`Saved ${a.company_name || a.domain} to Prospects`);
    } catch {
      flash('Save failed');
    }
  }

  function exportCsv() {
    const rows = data?.accounts ?? [];
    if (rows.length === 0) return;
    if (getCount('tam_exports', uid) >= EXPORT_LIMIT_PER_MONTH) {
      setUpgrade('export');
      return;
    }
    const capped = rows.slice(0, EXPORT_ROW_CAP);
    const header = [
      'rank', 'company', 'domain', 'category', 'platform', 'est_revenue',
      'est_monthly_spend', 'growth_score', 'momentum', 'active_meta_ads',
      'reason', 'outbound_angle', 'last_updated',
    ];
    const lines = [header.join(',')];
    for (const a of capped) {
      lines.push(
        [
          a.rank, a.company_name ?? '', a.domain, a.category ?? '', a.platform ?? '',
          a.revenue_range ?? '', a.spend_estimate?.label ?? '', a.growth_score ?? '',
          a.growth_momentum ?? '', a.active_meta_ads ?? '', a.reason, a.outbound_angle,
          a.last_enriched_at ?? '',
        ].map(csvEscape).join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tambourine-tam-list.csv';
    link.click();
    URL.revokeObjectURL(url);
    const used = bumpCount('tam_exports', uid);
    setQuota((q) => ({ ...q, exports: used }));
    flash(
      rows.length > EXPORT_ROW_CAP
        ? `Exported first ${EXPORT_ROW_CAP} accounts (free tier)`
        : `Exported ${capped.length} accounts`
    );
  }

  function openBrief(domain: string) {
    if (getCount('tam_briefs', uid) >= BRIEF_LIMIT_PER_MONTH) {
      setUpgrade('brief');
      return;
    }
    const used = bumpCount('tam_briefs', uid);
    setQuota((q) => ({ ...q, briefs: used }));
    onOpenBrief(domain);
  }

  const exportsLeft = Math.max(0, EXPORT_LIMIT_PER_MONTH - quota.exports);
  const briefsLeft = Math.max(0, BRIEF_LIMIT_PER_MONTH - quota.briefs);
  const accounts = data?.accounts ?? [];

  const selectCls =
    'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const numCls =
    'w-[72px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Build TAM List</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {initialQuery ? (
              <>Built from &ldquo;{initialQuery}&rdquo;</>
            ) : (
              'Filter the tracked universe into an account list worth working.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quota.exports > 0 && (
            <span className="text-[11px] text-gray-400">
              {exportsLeft} free export{exportsLeft === 1 ? '' : 's'} left this month
            </span>
          )}
          <button
            onClick={exportCsv}
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <DownloadIcon width={14} height={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-2xl border border-gray-200 bg-white p-3.5">
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {catOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Momentum
          <select value={momentum} onChange={(e) => setMomentum(e.target.value)} className={selectCls}>
            <option value="">Any</option>
            {MOMENTUM_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Min score
          <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="—" className={numCls} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Min Meta ads
          <input type="number" min={0} value={minMeta} onChange={(e) => setMinMeta(e.target.value)} placeholder="—" className={numCls} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Revenue $M
          <span className="flex items-center gap-1">
            <input type="number" min={0} value={revMin} onChange={(e) => setRevMin(e.target.value)} placeholder="min" className={numCls} />
            <span className="text-gray-500">–</span>
            <input type="number" min={0} value={revMax} onChange={(e) => setRevMax(e.target.value)} placeholder="max" className={numCls} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Min spend $k/mo
          <input type="number" min={0} value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="—" className={numCls} />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={newlyEnriched} onChange={(e) => setNewlyEnriched(e.target.checked)} className="accent-indigo-500" />
          Newly enriched
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={top1pct} onChange={(e) => setTop1pct(e.target.checked)} className="accent-indigo-500" />
          Entering top 1%
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className={selectCls}
          >
            <option value="growth">Fastest growing</option>
            <option value="spend">Highest est. spend</option>
            <option value="meta_ads">Most Meta ads</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        <button
          onClick={applyFilters}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
        >
          <SearchIcon width={13} height={13} />
          Apply
        </button>
      </div>

      {/* Results header */}
      {data && !loading && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-900">
            {data.total_matched.toLocaleString()} accounts matched
          </span>
          <span className="text-gray-500">· of {data.total_tracked.toLocaleString()} tracked</span>
          {data.applied_filters.map((f) => (
            <span
              key={f}
              className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/20"
            >
              {f}
            </span>
          ))}
          <span className="w-full text-[11px] text-gray-400">
            Trend-ready accounts shown first while history builds.
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={() => runQuery(lastBody.current)}
            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<SearchIcon width={18} height={18} />}
            title="No accounts match these filters"
            body="Loosen a filter or two — the tracked universe is broad, but derived filters like spend and revenue can cut deep."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="w-12 px-4 py-2.5">#</th>
                  <th className="min-w-[180px] px-3 py-2.5">Company</th>
                  <th className="hidden px-3 py-2.5 lg:table-cell">Category</th>
                  <th className="hidden px-3 py-2.5 text-right md:table-cell">Est. Revenue</th>
                  <th className="px-3 py-2.5 text-right">Est. Mo. Spend</th>
                  <th className="px-3 py-2.5 text-right">Score</th>
                  <th className="px-2 py-2.5">Trend</th>
                  <th className="hidden px-3 py-2.5 xl:table-cell">Momentum</th>
                  <th className="hidden px-3 py-2.5 text-right sm:table-cell">Meta Ads</th>
                  <th className="hidden min-w-[240px] px-3 py-2.5 lg:table-cell">Why interesting</th>
                  <th className="hidden px-3 py-2.5 text-right xl:table-cell">Updated</th>
                  <th className="w-[130px] px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((a) => (
                  <tr key={a.domain} className="group transition-colors hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-[13px] font-bold tabular-nums text-gray-400">{a.rank}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Favicon domain={a.domain} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold capitalize text-gray-900">
                            {a.company_name || a.domain.replace(/^www\./, '').split('.')[0]}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{a.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden max-w-[130px] truncate px-3 py-2.5 text-xs text-gray-500 lg:table-cell">
                      {a.category ?? '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-xs text-gray-600 md:table-cell">
                      {a.revenue_range && a.revenue_range !== 'Unknown' ? a.revenue_range : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {a.spend_estimate ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold tabular-nums text-gray-900">
                            {a.spend_estimate.label}
                          </span>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              a.spend_estimate.confidence === 'high'
                                ? 'bg-emerald-400'
                                : a.spend_estimate.confidence === 'medium'
                                  ? 'bg-amber-400'
                                  : 'bg-gray-500'
                            }`}
                            title={`${a.spend_estimate.confidence} confidence`}
                          />
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                      {a.growth_score ?? '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      <TrendChip status={a.trend_status} count={a.snapshot_count} />
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 xl:table-cell">
                      {a.growth_momentum ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${MOMENTUM_TEXT[a.growth_momentum] ?? 'text-gray-400'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${MOMENTUM_DOT[a.growth_momentum] ?? 'bg-gray-500'}`} />
                          {a.growth_momentum}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-gray-600 sm:table-cell">
                      {a.active_meta_ads?.toLocaleString() ?? '—'}
                    </td>
                    <td className="hidden max-w-[340px] px-3 py-2.5 text-[12px] leading-snug text-gray-500 lg:table-cell">
                      {a.reason}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-[11px] text-gray-400 xl:table-cell">
                      {relativeTime(a.last_enriched_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-0.5 text-gray-500">
                        <button
                          onClick={() => openBrief(a.domain)}
                          title={`Open research brief (${briefsLeft} free left this month)`}
                          className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-indigo-300"
                        >
                          <DocIcon width={14} height={14} />
                        </button>
                        <button
                          onClick={() => save(a)}
                          title="Save to Watchlist"
                          className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-amber-300"
                        >
                          <StarIcon width={14} height={14} />
                        </button>
                        <button
                          onClick={() => copyText(a.domain, 'Domain copied')}
                          title="Copy domain"
                          className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-gray-200"
                        >
                          <CopyIcon width={14} height={14} />
                        </button>
                        <button
                          onClick={() => copyText(a.outbound_angle, 'Outbound angle copied')}
                          title="Copy outbound angle"
                          className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-indigo-300"
                        >
                          <SparkleIcon width={14} height={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {quota.briefs > 0 && briefsLeft < BRIEF_LIMIT_PER_MONTH && (
        <p className="text-[11px] text-gray-400">
          {briefsLeft} free research brief{briefsLeft === 1 ? '' : 's'} left this month · exports capped at{' '}
          {EXPORT_ROW_CAP} accounts on the free tier.
        </p>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-800 shadow-xl">
          {toast}
        </div>
      )}
      {upgrade && <UpgradeModal kind={upgrade} onClose={() => setUpgrade(null)} />}
    </div>
  );
}
