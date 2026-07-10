'use client';

// Tambourine command-center homepage: hero + AI-style prompt input, suggested
// prompt chips, snapshot stat cards, Top Movers preview, saved lists, and the
// Chrome-extension CTA. All numbers are real (top-movers + watchlist APIs);
// cards hide themselves when their data isn't available.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SparkleIcon,
  PaperclipIcon,
  MicIcon,
  TrendUpIcon,
  StarIcon,
  CheckIcon,
  ChromeIcon,
  DocIcon,
  BagIcon,
  MetaIcon,
  LipstickIcon,
  ShirtIcon,
  HouseIcon,
  DollarCircleIcon,
  BuildingIcon,
  BarsIcon,
  LayersIcon,
} from './icons';
import type { Mover } from './TopMoversView';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import { formatSpend } from '@/lib/adSpend';

const SUGGESTED: { label: string; icon: React.ReactNode }[] = [
  { label: 'Fastest-growing Shopify brands', icon: <BagIcon width={13} height={13} className="text-emerald-400" /> },
  { label: 'Brands scaling Meta ads', icon: <MetaIcon width={13} height={13} className="text-blue-400" /> },
  { label: 'Beauty brands with high ad spend', icon: <LipstickIcon width={13} height={13} className="text-pink-400" /> },
  { label: 'Newly accelerating apparel companies', icon: <ShirtIcon width={13} height={13} className="text-violet-400" /> },
  { label: 'Home goods brands entering top 1%', icon: <HouseIcon width={13} height={13} className="text-amber-400" /> },
  { label: 'Companies spending $100k+/mo', icon: <DollarCircleIcon width={13} height={13} className="text-emerald-400" /> },
  // Persona-shaped prompts — the TAM parser extracts what it can from each.
  { label: 'Brands likely outgrowing their 3PL', icon: <LayersIcon width={13} height={13} className="text-sky-400" /> },
  { label: 'Brands scaling paid with rising CAC pressure', icon: <BarsIcon width={13} height={13} className="text-indigo-400" /> },
  { label: 'Fast-growing brands under $50M revenue', icon: <TrendUpIcon width={13} height={13} className="text-teal-400" /> },
];

const BUILD_STEPS = [
  'Building your TAM list…',
  'Analyzing growth signals…',
  'Ranking accounts…',
  'Estimating ad spend…',
];

interface WatchlistItem {
  id: number;
  domain: string;
  brand_name: string | null;
  list_name: string;
}

function Favicon({ domain, size = 20 }: { domain: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[9px] font-bold uppercase text-gray-400"
        style={{ width: size, height: size }}
      >
        {domain.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-md bg-white/[0.06]"
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
    />
  );
}

function MiniTrend({ up = true }: { up?: boolean }) {
  return (
    <svg width="52" height="18" viewBox="0 0 52 18" aria-hidden="true">
      <polyline
        points={up ? '1,15 10,12 19,13 28,8 37,9 46,3 51,2' : '1,4 12,7 24,6 36,11 51,15'}
        fill="none"
        stroke={up ? '#34d399' : '#f87171'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CommandHome({
  onBuild,
  onSelectDomain,
  onOpenMovers,
  onOpenWatchlist,
}: {
  onBuild: (query: string) => void;
  onSelectDomain: (domain: string) => void;
  onOpenMovers: () => void;
  onOpenWatchlist: () => void;
}) {
  const [query, setQuery] = useState('');
  const [buildingStep, setBuildingStep] = useState<number | null>(null);
  const [movers, setMovers] = useState<Mover[] | null>(null);
  const [total, setTotal] = useState(0);
  const [lists, setLists] = useState<{ name: string; count: number }[] | null>(null);
  const [universe, setUniverse] = useState<{
    companies_tracked: number;
    growing_this_month: number;
    est_annual_spend_tracked: number;
    top_categories: string[];
  } | null>(null);
  const [firstVisit, setFirstVisit] = useState(false);
  const [moversError, setMoversError] = useState(false);
  const [listsError, setListsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Each panel loads (and fails) independently — a broken endpoint shows a
  // compact inline error in its own card and never blanks the homepage.
  const loadMovers = () => {
    setMoversError(false);
    setMovers(null);
    fetch('/api/top-movers', { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setMovers(Array.isArray(d.movers) ? d.movers : []);
        setTotal((prev) => prev || (d.total ?? 0));
      })
      .catch(() => {
        setMovers([]);
        setMoversError(true);
      });
  };
  const loadLists = () => {
    setListsError(false);
    setLists(null);
    fetch('/api/watchlist', { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        const items: WatchlistItem[] = Array.isArray(d.items) ? d.items : [];
        const grouped = new Map<string, number>();
        for (const it of items) grouped.set(it.list_name, (grouped.get(it.list_name) ?? 0) + 1);
        setLists([...grouped.entries()].map(([name, count]) => ({ name, count })));
      })
      .catch(() => {
        setLists([]);
        setListsError(true);
      });
  };

  useEffect(() => {
    fetch('/api/stats', { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.companies_tracked === 'number') {
          setUniverse(d);
          setTotal(d.companies_tracked);
        }
      })
      .catch(() => {});
    loadMovers();
    loadLists();
    try {
      setFirstVisit(!localStorage.getItem('tam_has_queried'));
    } catch {
      /* noop */
    }
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || buildingStep != null) return;
    try {
      localStorage.setItem('tam_has_queried', '1');
    } catch {
      /* noop */
    }
    setQuery(trimmed);
    setBuildingStep(0);
    BUILD_STEPS.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => {
          if (i === BUILD_STEPS.length - 1) {
            timers.current.push(setTimeout(() => onBuild(trimmed), 500));
          }
          setBuildingStep(i);
        }, i * 600)
      );
    });
  }

  const stats = useMemo(() => {
    // Prefer full-universe stats from /api/stats; fall back to the ranked slice.
    if (universe) {
      return {
        growing: universe.growing_this_month,
        spendMid: universe.est_annual_spend_tracked,
        topCats: universe.top_categories,
      };
    }
    if (!movers || movers.length === 0) return null;
    const growing = movers.filter(
      (m) => m.growth_momentum === 'Accelerating' || m.growth_momentum === 'Exploding'
    ).length;
    const spendMid = movers.reduce(
      (s, m) => (m.spend_estimate ? s + (m.spend_estimate.low + m.spend_estimate.high) / 2 : s),
      0
    );
    const catCount = new Map<string, number>();
    for (const m of movers) {
      if (!m.primary_category) continue;
      if (m.growth_momentum === 'Accelerating' || m.growth_momentum === 'Exploding' || m.growth_momentum === 'Scaling') {
        catCount.set(m.primary_category, (catCount.get(m.primary_category) ?? 0) + 1);
      }
    }
    const topCats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
    return { growing, spendMid, topCats };
  }, [movers, universe]);

  const catTone = (c: string) => {
    const tones = [
      'bg-indigo-500/10 text-indigo-300 ring-indigo-500/20',
      'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
      'bg-amber-500/10 text-amber-300 ring-amber-500/20',
      'bg-pink-500/10 text-pink-300 ring-pink-500/20',
      'bg-sky-500/10 text-sky-300 ring-sky-500/20',
    ];
    let h = 0;
    for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
    return tones[h % tones.length];
  };

  const preview = (movers ?? []).slice(0, 5);

  return (
    <div className="tam-hero-glow -mx-4 -my-6 min-h-full px-4 pb-16 pt-4 sm:-mx-6 sm:px-6">
      {/* Hero */}
      <div className="mx-auto flex max-w-[720px] flex-col items-center pt-12 text-center sm:pt-16">
        <h1 className="text-[38px] font-bold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl">
          Find your <span className="tam-gradient-text">fastest-growing</span> TAM
        </h1>
        <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-gray-500">
          Tambourine helps GTM teams build account lists from growth signals like ad activity,
          spend estimates, revenue, tech stack, and market momentum.
        </p>

        {firstVisit && buildingStep == null && (
          <div className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
            What market are you selling into?
          </div>
        )}

        {/* Prompt input / building state */}
        {buildingStep == null ? (
          <>
            <form
              className={`w-full ${firstVisit ? 'mt-2' : 'mt-7'}`}
              onSubmit={(e) => {
                e.preventDefault();
                submit(query);
              }}
            >
              <div
                className="tam-prompt flex cursor-text items-center gap-2 rounded-2xl bg-white py-2 pl-3 pr-2"
                onClick={() => inputRef.current?.focus()}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
                  <SparkleIcon width={14} height={14} />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask Tambourine to build your TAM list…"
                  className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-gray-900 placeholder:text-gray-500 focus:outline-none"
                />
                <span className="hidden items-center gap-1 text-gray-500 sm:flex" aria-hidden="true">
                  <span className="rounded-lg p-2"><PaperclipIcon width={15} height={15} /></span>
                  <span className="rounded-lg p-2"><MicIcon width={15} height={15} /></span>
                </span>
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="flex h-10 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                  aria-label="Build TAM list"
                >
                  <SparkleIcon width={15} height={15} />
                </button>
              </div>
            </form>

            {/* Suggested prompt chips */}
            <div className="mt-4 flex max-w-[640px] flex-wrap justify-center gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s.label}
                  onClick={() => submit(s.label)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-400 hover:text-gray-900"
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-9 w-full max-w-[440px] rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-lg">
            <div className="mb-4 text-[13px] font-medium text-gray-500 truncate">&ldquo;{query}&rdquo;</div>
            <div className="space-y-3">
              {BUILD_STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`tam-step-in flex items-center gap-2.5 text-sm ${
                    i > buildingStep ? 'invisible' : ''
                  }`}
                >
                  {i < buildingStep ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <CheckIcon width={12} height={12} />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                    </span>
                  )}
                  <span className={i < buildingStep ? 'text-gray-400' : 'font-medium text-gray-900'}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Snapshot stat cards */}
      <div className="mx-auto mt-16 max-w-6xl">
        {movers == null ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-5"><Skeleton className="h-12 w-full" /></div>
            ))}
          </div>
        ) : total > 0 && stats ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3.5 bg-white p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20">
                <BuildingIcon width={17} height={17} />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-gray-500">Companies Tracked</div>
                <div className="text-xl font-bold tracking-tight text-gray-900 tabular-nums">
                  {total.toLocaleString()}
                </div>
              </div>
            </div>
            {stats.growing > 0 && (
              <div className="flex items-center gap-3.5 bg-white p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
                  <TrendUpIcon width={17} height={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-gray-500">Growing This Month</div>
                  <div className="text-xl font-bold tracking-tight text-gray-900 tabular-nums">
                    {stats.growing.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-gray-400">accelerating or exploding momentum</div>
                </div>
              </div>
            )}
            {stats.spendMid > 0 && (
              <div className="flex items-center gap-3.5 bg-white p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20">
                  <BarsIcon width={17} height={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-gray-500">Est. Annual Ad Spend Tracked</div>
                  <div className="text-xl font-bold tracking-tight text-gray-900 tabular-nums">
                    {formatSpend(stats.spendMid)}+
                  </div>
                  <div className="text-[10px] text-gray-400">monthly · band midpoints</div>
                </div>
              </div>
            )}
            {stats.topCats.length > 0 && (
              <div className="flex items-center gap-3.5 bg-white p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-300 ring-1 ring-pink-500/20">
                  <LayersIcon width={17} height={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-gray-500">Top Categories</div>
                  <div className="truncate text-[13px] font-semibold leading-snug text-gray-900">
                    {stats.topCats.slice(0, 2).join(', ')}
                  </div>
                  {stats.topCats.length > 2 && (
                    <div className="truncate text-[11px] text-gray-400">
                      {stats.topCats.slice(2).join(', ')} · by growth momentum
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Lower grid */}
      <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Top Movers preview */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <TrendUpIcon width={14} height={14} className="text-emerald-400" />
              Top Movers Preview
            </h3>
            <button
              onClick={onOpenMovers}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              View all Top Movers →
            </button>
          </div>
          {movers == null ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : moversError ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <span>Couldn’t load Top Movers.</span>
              <button
                onClick={loadMovers}
                className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          ) : preview.length === 0 ? (
            <EmptyState
              compact
              icon={<TrendUpIcon width={18} height={18} />}
              title="No movers yet"
              body="Enrich companies under Imports to build the leaderboard."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-3">Company</th>
                  <th className="hidden py-2 pr-3 sm:table-cell">Category</th>
                  <th className="py-2 pr-3 text-right">Score</th>
                  <th className="hidden py-2 pr-3 text-right md:table-cell">Est. Spend</th>
                  <th className="py-2 text-right">Momentum</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((m) => (
                  <tr
                    key={m.domain}
                    onClick={() => onSelectDomain(m.domain)}
                    className="cursor-pointer border-b border-white/5 text-[13px] transition-colors last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Favicon domain={m.domain} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold capitalize text-gray-900">
                            {m.company_name || m.domain.replace(/^www\./, '').split('.')[0]}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{m.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden py-2 pr-3 sm:table-cell">
                      {m.primary_category ? (
                        <span className={`inline-block max-w-[130px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${catTone(m.primary_category)}`}>
                          {m.primary_category}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-400 ring-1 ring-emerald-500/20">
                        {m.growth_score ?? '—'}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-3 text-right tabular-nums text-gray-600 md:table-cell">
                      {m.spend_estimate?.label ?? '—'}
                    </td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center justify-end">
                        <MiniTrend
                          up={m.growth_momentum !== 'Dormant' && m.growth_momentum !== 'Emerging'}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Saved lists */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <StarIcon width={14} height={14} className="text-amber-400" />
                Saved TAM Lists
              </h3>
              <button onClick={onOpenWatchlist} className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                View all →
              </button>
            </div>
            {lists == null ? (
              <Skeleton className="h-16 w-full" />
            ) : listsError ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-600">
                <span>Couldn’t load saved lists.</span>
                <button
                  onClick={loadLists}
                  className="shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Retry
                </button>
              </div>
            ) : lists.length === 0 ? (
              <EmptyState
                compact
                icon={<StarIcon width={16} height={16} />}
                title="No saved lists yet"
                body="Build your first TAM list and save accounts to see them here."
              />
            ) : (
              <ul>
                {lists.map((l) => (
                  <li key={l.name} className="border-b border-white/5 last:border-0">
                    <button
                      onClick={onOpenWatchlist}
                      className="flex w-full items-center gap-2.5 py-2 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300">
                        <DocIcon width={14} height={14} />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-gray-800">{l.name}</span>
                      <span className="ml-auto rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-gray-400 ring-1 ring-white/10">
                        {l.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Why accounts matter */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <SparkleIcon width={14} height={14} className="text-indigo-400" />
              Why accounts matter
            </h3>
            <ul className="space-y-2">
              {[
                'Rank companies by growth signals',
                'Build and export TAM lists',
                'Turn account data into outbound angles',
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[13px] text-gray-600">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <CheckIcon width={14} height={14} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Extension CTA */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20">
                <ChromeIcon width={17} height={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">Install the Chrome Extension</div>
                <div className="mt-0.5 text-[12px] text-gray-400">
                  Find growth signals while you browse.
                </div>
                <span className="mt-3 inline-block rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-gray-400 ring-1 ring-white/10">
                  Coming soon
                </span>
              </div>
              <div className="hidden shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 sm:block">
                <div className="text-[10px] font-semibold text-gray-500">gymshark.com</div>
                <MiniTrend up />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
