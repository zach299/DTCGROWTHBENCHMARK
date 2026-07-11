'use client';

// Public brand snapshot — the PLG funnel's shareable outbound weapon.
// Rendered by /b/[domain]. Flow: POST /api/lookup (metering) → allowed:
// /api/company (+ /api/analyze-domain when uncached) → full report with a
// conversion footer. Blocked: teaser with blurred placeholders + signup wall.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import GrowthOverTime, { type SnapshotRow } from '@/app/components/GrowthOverTime';
import SpendEstimateBadge from '@/app/components/SpendEstimateBadge';
import MetricCard from '@/app/components/MetricCard';
import Skeleton from '@/app/components/Skeleton';
import { BoltIcon, CheckIcon, CopyIcon } from '@/app/components/icons';
import { buildSignalCategories } from '@/lib/signals';
import { buildReason, type ReasonInputs } from '@/lib/reason';
import { estimateMonthlySpend, type SpendEstimate } from '@/lib/adSpend';

// ---------- shared shapes (subset of /api/company + /api/analyze-domain) ----------

interface MetaAdsLite {
  advertiser_name?: string | null;
  active_ads_count?: number | null;
  unique_landing_pages?: unknown[] | null;
  ad_activity_level?: string | null;
}

interface AdPlatformLite {
  platform: string;
  status: string;
  ads_count: number | null;
}

interface PaidMediaQualityLite {
  real_creative_score?: number | null;
  quality_adjusted_ads?: number | null;
  creative_diversity_score?: number | null;
  dpa_share?: number | null;
}

interface HiringLite {
  ats_provider: string | null;
  open_roles: number | null;
  growth_roles: number | null;
  ops_roles: number | null;
  jobs_checked_at: string | null;
}

interface TrendValueLite {
  change_pct: number | null;
}

interface SnapshotData {
  domain: string;
  company?: Record<string, unknown> | null;
  growth_score?: number | null;
  growth_momentum?: string | null;
  revenue_range?: string | null;
  revenue_confidence?: string | null;
  paid_media_signal?: string | null;
  primary_category?: string | null;
  meta_ads?: MetaAdsLite | null;
  ad_platforms?: AdPlatformLite[] | null;
  paid_media_quality?: PaidMediaQualityLite | null;
  hiring?: HiringLite | null;
  spend_estimate?: SpendEstimate | null;
  trends?: { active_meta_ads?: TrendValueLite[] } | null;
  cache_age_days?: number | null;
}

interface LookupInfo {
  allowed: boolean;
  remaining: number;
  limit: number;
  reason: 'signup_required' | 'daily_limit' | null;
  signed_in: boolean;
}

type Phase = 'metering' | 'blocked' | 'loading' | 'analyzing' | 'ready' | 'error';

// ---------- small helpers ----------

function cstr(c: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = c?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function brandNameOf(data: SnapshotData | null, domain: string): string {
  const fromAds = data?.meta_ads?.advertiser_name;
  if (typeof fromAds === 'string' && fromAds.trim()) return fromAds.trim();
  const stem = domain.replace(/^www\./i, '').split('.')[0] ?? domain;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function updatedLabel(cacheAgeDays: number | null | undefined): string | null {
  if (cacheAgeDays == null) return null;
  const hours = Math.max(0, Math.round(cacheAgeDays * 24));
  if (hours < 1) return 'Updated just now';
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.round(cacheAgeDays);
  return `Updated ${days}d ago`;
}

function adCount(data: SnapshotData, platform: string): number {
  const p = (data.ad_platforms ?? []).find((x) => x.platform === platform);
  return p && p.status === 'active' ? Number(p.ads_count ?? 0) : 0;
}

function liveCampaigns(data: SnapshotData): number {
  const meta = Number(data.meta_ads?.active_ads_count ?? 0);
  return meta + adCount(data, 'Google') + adCount(data, 'LinkedIn');
}

function scoreColor(s: number): string {
  if (s >= 70) return 'text-emerald-400';
  if (s >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

const MOMENTUM_TONE: Record<string, string> = {
  Exploding: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  Accelerating: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  Scaling: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/25',
  Emerging: 'bg-yellow-500/10 text-yellow-500 ring-yellow-500/25',
  Dormant: 'bg-white/[0.04] text-gray-400 ring-white/10',
};

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width={14} height={14} {...props}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

// ---------- top bar (shared with /lookup) ----------

export function PublicTopBar() {
  const { user, authEnabled } = useAuth();
  const signedIn = authEnabled && !!user;
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0b10]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
            <BoltIcon width={16} height={16} />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">Tambourine</span>
        </Link>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <Link
              href="/"
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Open dashboard →
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:text-gray-200"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Create free account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// ---------- wall panel (shared: teaser wall + /lookup walls) ----------

export function WallPanel({
  headline,
  sub,
  bullets,
}: {
  headline: string;
  sub?: string;
  bullets?: string[];
}) {
  return (
    <div className="tam-wall rounded-2xl p-6 sm:p-8">
      <h2 className="text-lg font-bold text-white sm:text-xl">{headline}</h2>
      {sub && <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{sub}</p>}
      {bullets && bullets.length > 0 && (
        <ul className="mt-4 space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <CheckIcon width={10} height={10} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/sign-up"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-indigo-500"
        >
          Create free account →
        </Link>
        <Link href="/sign-in" className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-200">
          Sign in
        </Link>
      </div>
    </div>
  );
}

// Blurred placeholder bars — deliberately fake shapes, never real numbers.
function LockedCell({ label }: { label: string }) {
  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-[#101218] p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">{label}</div>
      <div className="tam-locked-blur space-y-2" aria-hidden="true">
        <div className="h-5 w-24 rounded bg-gray-500/40" />
        <div className="h-2.5 w-16 rounded bg-gray-500/25" />
      </div>
      <div className="tam-lock-overlay text-gray-400">
        <LockIcon />
      </div>
    </div>
  );
}

// ---------- analyzing state ----------

function AnalyzingPanel({ brand }: { brand: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-2xl border border-white/[0.06] bg-[#101218] px-6 py-16">
      <svg width="200" height="100" viewBox="0 0 200 100" aria-hidden="true">
        <polyline
          points="0,88 30,78 60,82 90,52 120,58 150,28 200,8"
          fill="none"
          stroke="#7c6ef5"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="gs-draw"
        />
        <circle cx="200" cy="8" r="4" fill="#7c6ef5" className="gs-pulse" />
      </svg>
      <div className="text-center">
        <div className="text-sm font-semibold text-gray-200">Analyzing {brand}</div>
        <p className="mt-1 text-xs text-gray-500">First scan takes ~30 seconds — reading live ad, hiring, and site signals.</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

// ---------- brand header ----------

function BrandHeader({
  domain,
  name,
  category,
  updated,
}: {
  domain: string;
  name: string;
  category: string | null;
  updated: string | null;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/b/${domain}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — button simply doesn't confirm */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#f4f5f7] shadow-lg ring-1 ring-white/10">
        {imgErr ? (
          <span className="text-lg font-bold uppercase text-gray-600">{name.slice(0, 2)}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
            alt={`${name} logo`}
            width={34}
            height={34}
            referrerPolicy="no-referrer"
            onError={() => setImgErr(true)}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold text-white sm:text-2xl">{name}</h1>
          {category && (
            <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/25">
              {category}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>{domain}</span>
          {updated && <span>{updated}</span>}
        </div>
      </div>
      <button
        onClick={copyLink}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        {copied ? <CheckIcon width={12} height={12} /> : <CopyIcon width={12} height={12} />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

// ---------- main component ----------

export default function PublicSnapshot({ domain }: { domain: string }) {
  const { user, authEnabled } = useAuth();
  const signedIn = authEnabled && !!user;

  const [phase, setPhase] = useState<Phase>('metering');
  const [lookup, setLookup] = useState<LookupInfo | null>(null);
  const [data, setData] = useState<SnapshotData | null>(null);
  const [history, setHistory] = useState<SnapshotRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // strict-mode double-mount guard
    started.current = true;

    const run = async () => {
      // 1) Metering — same-domain repeats are free, so this is safe after /lookup.
      let info: LookupInfo | null = null;
      try {
        const r = await fetch('/api/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: AbortSignal.timeout(15_000),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d && typeof d.allowed === 'boolean') {
          info = {
            allowed: d.allowed,
            remaining: Number(d.remaining ?? 0),
            limit: Number(d.limit ?? 1),
            reason: d.reason ?? null,
            signed_in: Boolean(d.signed_in),
          };
        }
      } catch {
        /* metering unreachable — fail open below */
      }
      // Fail open: metering must never break the funnel.
      if (!info) info = { allowed: true, remaining: 0, limit: 1, reason: null, signed_in: false };
      setLookup(info);
      if (!info.allowed) {
        setPhase('blocked');
        return;
      }

      // 2) Fast cached payload.
      setPhase('loading');
      let base: SnapshotData | null = null;
      let needsEnrichment = false;
      try {
        const r = await fetch('/api/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: AbortSignal.timeout(15_000),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        base = {
          domain: d.domain ?? domain,
          company: d.company ?? null,
          hiring: d.hiring ?? null,
          spend_estimate: d.spend_estimate ?? null,
          trends: d.trends ?? null,
          cache_age_days: d.cache_age_days ?? null,
          ...(d.analysis ?? {}),
        };
        needsEnrichment = Boolean(d.needs_enrichment);
        setHistory(Array.isArray(d.history) ? d.history : []);
      } catch {
        setErrorMsg('We couldn’t load this brand right now — please try again in a moment.');
        setPhase('error');
        return;
      }

      if (!base) return; // unreachable — catch above returns
      const hasScore = base.growth_score != null;
      if (hasScore) {
        setData(base);
        setPhase('ready');
      } else {
        setPhase('analyzing');
      }

      // 3) Fresh enrichment when there's no (fresh) cache. /api/company alone
      // only queues a nightly priority refresh — the live scan is this call.
      if (needsEnrichment || !hasScore) {
        if (hasScore) setRefreshing(true);
        try {
          const r = await fetch('/api/analyze-domain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
          });
          const fresh = await r.json().catch(() => ({}));
          if (r.ok && fresh && fresh.growth_score != null) {
            setData({
              ...base,
              ...fresh,
              spend_estimate: fresh.spend_estimate ?? base.spend_estimate,
              hiring: fresh.hiring ?? base.hiring,
              cache_age_days: 0,
            });
            if (Array.isArray(fresh.history) && fresh.history.length > 0) setHistory(fresh.history);
            setPhase('ready');
          } else if (!hasScore) {
            setErrorMsg(
              'The first scan didn’t finish. We’ve queued this brand — check back in a few minutes.'
            );
            setPhase('error');
          } else {
            setRefreshFailed(true);
          }
        } catch {
          if (!hasScore) {
            setErrorMsg(
              'The first scan didn’t finish. We’ve queued this brand — check back in a few minutes.'
            );
            setPhase('error');
          } else {
            setRefreshFailed(true);
          }
        } finally {
          setRefreshing(false);
        }
      }
    };
    run();
  }, [domain]);

  const brand = brandNameOf(data, domain);

  return (
    <div className="dark-app min-h-screen bg-[#0a0b10]">
      <PublicTopBar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {phase === 'metering' || phase === 'loading' ? (
          <LoadingSkeleton />
        ) : phase === 'blocked' ? (
          <TeaserView domain={domain} brand={brand} reason={lookup?.reason ?? 'signup_required'} limit={lookup?.limit ?? 5} />
        ) : phase === 'analyzing' ? (
          <div className="space-y-6">
            <BrandHeader domain={domain} name={brand} category={null} updated={null} />
            <AnalyzingPanel brand={brand} />
          </div>
        ) : phase === 'error' ? (
          <div className="space-y-6">
            <BrandHeader domain={domain} name={brand} category={null} updated={null} />
            <div className="rounded-2xl border border-white/[0.06] bg-[#101218] px-6 py-12 text-center">
              <div className="text-sm font-semibold text-gray-200">{errorMsg}</div>
              <p className="mt-1.5 text-xs text-gray-500">
                Tambourine keeps scanning in the background — this page will have data soon.
              </p>
            </div>
            <ConversionFooter signedIn={signedIn} lookup={lookup} />
          </div>
        ) : data ? (
          <FullView
            data={data}
            brand={brand}
            history={history}
            refreshing={refreshing}
            refreshFailed={refreshFailed}
            signedIn={signedIn}
            lookup={lookup}
          />
        ) : null}
      </main>
    </div>
  );
}

// ---------- full (allowed) view ----------

function FullView({
  data,
  brand,
  history,
  refreshing,
  refreshFailed,
  signedIn,
  lookup,
}: {
  data: SnapshotData;
  brand: string;
  history: SnapshotRow[] | null;
  refreshing: boolean;
  refreshFailed: boolean;
  signedIn: boolean;
  lookup: LookupInfo | null;
}) {
  const gScore = Number(data.growth_score ?? 0);
  const momentum = data.growth_momentum ?? null;
  const metaCount = Number(data.meta_ads?.active_ads_count ?? 0);
  const campaigns = liveCampaigns(data);
  const category = data.primary_category ?? cstr(data.company, 'categories');

  const spendEst: SpendEstimate | null =
    data.spend_estimate ??
    estimateMonthlySpend({
      metaAds: metaCount,
      googleAds: adCount(data, 'Google'),
      linkedinAds: adCount(data, 'LinkedIn'),
      qualityAdjustedAds: data.paid_media_quality?.quality_adjusted_ads ?? null,
      landingPages: data.meta_ads?.unique_landing_pages?.length ?? null,
      creativeDiversityScore: data.paid_media_quality?.creative_diversity_score ?? null,
      revenueRange: data.revenue_range ?? null,
      paidIntensity: data.paid_media_signal ?? null,
    });

  const reasonInputs: ReasonInputs = {
    metaAds: metaCount,
    metaChangePct:
      data.trends?.active_meta_ads?.[1]?.change_pct ??
      data.trends?.active_meta_ads?.[0]?.change_pct ??
      null,
    realCreativeScore: data.paid_media_quality?.real_creative_score ?? null,
    creativeDiversityScore: data.paid_media_quality?.creative_diversity_score ?? null,
    dpaShare: data.paid_media_quality?.dpa_share ?? null,
    momentum,
    growthScore: data.growth_score ?? null,
    spend: spendEst,
    landingPages: data.meta_ads?.unique_landing_pages?.length ?? null,
  };
  const reason = buildReason(reasonInputs);

  const categories = buildSignalCategories({
    active_meta_ads: metaCount,
    google_ads: adCount(data, 'Google'),
    linkedin_ads: adCount(data, 'LinkedIn'),
    quality_adjusted_ads: data.paid_media_quality?.quality_adjusted_ads ?? null,
    real_creative_score: data.paid_media_quality?.real_creative_score ?? null,
    creative_diversity_score: data.paid_media_quality?.creative_diversity_score ?? null,
    dpa_share: data.paid_media_quality?.dpa_share ?? null,
    ad_activity_level: data.paid_media_signal ?? data.meta_ads?.ad_activity_level ?? null,
    landing_pages: data.meta_ads?.unique_landing_pages ?? [],
    spend_label: spendEst?.label ?? null,
    open_roles: data.hiring?.open_roles ?? null,
    growth_roles: data.hiring?.growth_roles ?? null,
    ops_roles: data.hiring?.ops_roles ?? null,
    jobs_checked_at: data.hiring?.jobs_checked_at ?? null,
    ats_provider: data.hiring?.ats_provider ?? null,
  });
  const live = categories.filter((c) => c.status === 'live');
  const soonCount = categories.length - live.length;

  return (
    <div className="space-y-6">
      <BrandHeader
        domain={data.domain}
        name={brand}
        category={category}
        updated={updatedLabel(data.cache_age_days)}
      />

      {/* Scoreline */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#101218] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Growth Score</div>
            <div className="mt-1 flex items-center gap-3">
              <span className={`text-5xl font-bold tabular-nums ${scoreColor(gScore)}`}>{Math.round(gScore)}</span>
              {momentum && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                    MOMENTUM_TONE[momentum] ?? MOMENTUM_TONE.Dormant
                  }`}
                >
                  {momentum}
                </span>
              )}
            </div>
          </div>
          <div className="grid w-full grid-cols-1 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02] sm:w-auto sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <MetricCard label="Est. Revenue">
              <span className="text-lg font-bold text-gray-900 tabular-nums">{data.revenue_range ?? '—'}</span>
              {data.revenue_confidence && (
                <span className="ml-1.5 text-[10px] capitalize text-gray-400">{data.revenue_confidence} confidence</span>
              )}
            </MetricCard>
            <MetricCard label="Growth Investment">
              <SpendEstimateBadge estimate={spendEst} />
            </MetricCard>
            <MetricCard label="Live Campaigns">
              <span className="text-lg font-bold text-gray-900 tabular-nums">{campaigns.toLocaleString()}</span>
              <span className="ml-1.5 text-[10px] text-gray-400">active ads</span>
            </MetricCard>
          </div>
        </div>
      </div>

      {/* Growth chart */}
      <GrowthOverTime history={history} refreshing={refreshing} refreshFailed={refreshFailed} />

      {/* Why interesting */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.05] p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">
          Why {brand} is interesting
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-200">{reason}</p>
      </div>

      {/* Growth signals mini-grid */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Growth Signals</h2>
          {soonCount > 0 && (
            <span className="text-[11px] text-gray-500">
              +{soonCount} more signal {soonCount === 1 ? 'category' : 'categories'} coming soon
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((cat) => (
            <div key={cat.key} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{cat.label}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/30">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>
              {cat.metrics.length > 0 ? (
                <dl className="mt-3 space-y-1.5">
                  {cat.metrics.slice(0, 4).map((m) => (
                    <div key={m.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[12px] text-gray-500">{m.label}</dt>
                      <dd
                        className={`text-[12px] font-semibold tabular-nums ${
                          m.tone === 'positive' ? 'text-emerald-500' : m.tone === 'muted' ? 'text-gray-400' : 'text-gray-900'
                        }`}
                      >
                        {m.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{cat.blurb}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <ConversionFooter signedIn={signedIn} lookup={lookup} brand={brand} />
    </div>
  );
}

// ---------- conversion footer ----------

function ConversionFooter({
  signedIn,
  lookup,
  brand,
}: {
  signedIn: boolean;
  lookup: LookupInfo | null;
  brand?: string;
}) {
  if (signedIn || lookup?.signed_in) {
    const remaining = lookup?.remaining ?? 0;
    const limit = lookup?.limit ?? 5;
    return (
      <div className="tam-wall rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {remaining} of {limit} lookups left today
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {brand ? `Track ${brand} from your dashboard to get alerts when its growth signals move.` : 'Open your dashboard to keep digging.'}
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-indigo-500"
          >
            Open the full dashboard →
          </Link>
        </div>
      </div>
    );
  }
  return (
    <WallPanel
      headline="That’s your free look."
      sub="Create a free account for 5 brand lookups a day, watchlists, and growth alerts."
    />
  );
}

// ---------- teaser (blocked) view ----------

function TeaserView({
  domain,
  brand,
  reason,
  limit,
}: {
  domain: string;
  brand: string;
  reason: 'signup_required' | 'daily_limit';
  limit: number;
}) {
  return (
    <div className="space-y-6">
      <BrandHeader domain={domain} name={brand} category={null} updated={null} />

      {/* Score row: score visible, the rest locked */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#101218] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Growth Score</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-5xl font-bold tabular-nums text-indigo-300">
                <ScorePeek domain={domain} />
              </span>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-3">
            <LockedCell label="Momentum" />
            <LockedCell label="Est. Revenue" />
            <LockedCell label="Growth Investment" />
          </div>
        </div>
      </div>

      {/* Locked chart panel */}
      <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#101218] p-5">
        <div className="text-sm font-semibold text-gray-300">Growth Over Time</div>
        <div className="tam-locked-blur mt-6 flex h-36 items-end gap-2 px-2" aria-hidden="true">
          {[42, 55, 48, 66, 60, 78, 72, 88, 82, 96, 90, 100].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-indigo-400/30" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="tam-lock-overlay flex-col gap-2 text-gray-300">
          <LockIcon width={18} height={18} />
          <span className="text-xs font-medium">Unlocked with a free account</span>
        </div>
      </div>

      <WallPanel
        headline={
          reason === 'daily_limit'
            ? `You’ve used today’s ${limit} free lookups — resets at midnight UTC.`
            : `Create a free account to see ${brand}’s full growth profile`
        }
        sub={reason === 'daily_limit' ? `${brand}’s full growth profile is one click away tomorrow — or right now with the dashboard.` : undefined}
        bullets={[
          '5 free brand lookups a day',
          'Growth score, momentum & growth-investment estimates',
          'Alerts when accounts start exploding',
        ]}
      />
    </div>
  );
}

// The teaser shows the real growth score when a cached one exists — reading
// /api/company is unmetered. Placeholder dash until it loads; never fake.
function ScorePeek({ domain }: { domain: string }) {
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(15_000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.analysis?.growth_score != null) setScore(Number(d.analysis.growth_score));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [domain]);
  return <>{score != null ? Math.round(score) : '—'}</>;
}
