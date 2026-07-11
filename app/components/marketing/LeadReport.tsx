'use client';

// The lead-magnet report card: a limited free snapshot with a locked-modules
// grid and an email gate that unlocks the full report in place. Rendered by
// LeadMagnet after a successful lookup + analyze.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import GrowthOverTime, { type SnapshotRow } from '@/app/components/GrowthOverTime';
import SpendEstimateBadge from '@/app/components/SpendEstimateBadge';
import MetricCard from '@/app/components/MetricCard';
import { buildSignalCategories } from '@/lib/signals';
import { buildReason } from '@/lib/reason';
import { estimateMonthlySpend, type SpendEstimate } from '@/lib/adSpend';

// ---------- shapes (subset of /api/company + /api/analyze-domain) ----------

export interface MetaAdsLite {
  advertiser_name?: string | null;
  active_ads_count?: number | null;
  unique_landing_pages?: unknown[] | null;
  ad_activity_level?: string | null;
}

export interface AdPlatformLite {
  platform: string;
  status: string;
  ads_count: number | null;
}

export interface ReportData {
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
  paid_media_quality?: {
    real_creative_score?: number | null;
    quality_adjusted_ads?: number | null;
    creative_diversity_score?: number | null;
    dpa_share?: number | null;
  } | null;
  hiring?: {
    ats_provider: string | null;
    open_roles: number | null;
    growth_roles: number | null;
    ops_roles: number | null;
    jobs_checked_at: string | null;
  } | null;
  spend_estimate?: SpendEstimate | null;
  trends?: { active_meta_ads?: { change_pct: number | null }[] } | null;
}

// ---------- helpers ----------

export function brandNameOf(data: ReportData | null, domain: string): string {
  const fromAds = data?.meta_ads?.advertiser_name;
  if (typeof fromAds === 'string' && fromAds.trim()) return fromAds.trim();
  const stem = domain.replace(/^www\./i, '').split('.')[0] ?? domain;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function adCount(data: ReportData, platform: string): number {
  const p = (data.ad_platforms ?? []).find((x) => x.platform === platform);
  return p && p.status === 'active' ? Number(p.ads_count ?? 0) : 0;
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

const LOCKED_MODULES = [
  'Growth investment estimate',
  'Full advertising history',
  'Technology changes',
  'Hiring velocity',
  'Competitor comparison',
  'Complete growth timeline',
];

function LockedModule({ label }: { label: string }) {
  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-[#101218] p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="tam-locked-blur space-y-2" aria-hidden="true">
        <div className="h-5 w-24 rounded bg-gray-500/40" />
        <div className="h-2.5 w-32 rounded bg-gray-500/25" />
        <div className="h-2.5 w-16 rounded bg-gray-500/25" />
      </div>
      <div className="tam-lock-overlay text-gray-400">
        <LockIcon />
      </div>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- unlock gate ----------

function UnlockGate({
  domain,
  onUnlocked,
}: {
  domain: string;
  onUnlocked: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setError('Enter a valid work email, like you@company.com');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/request-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: e,
          domain,
          ...(firstName.trim() ? { first_name: firstName.trim() } : {}),
          source: 'report_unlock',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        onUnlocked(e);
        return;
      }
      setError(typeof d.error === 'string' ? d.error : 'Something went wrong — please try again.');
    } catch {
      setError('Network hiccup — please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="tam-wall rounded-2xl p-6 sm:p-8">
      <h3 className="text-lg font-bold text-white sm:text-xl">Unlock the complete growth report</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
        Growth investment estimate, full signal grid, and every chart — free, in place, right now.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-5 flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Work email"
          autoComplete="email"
          className="min-w-0 flex-[2] rounded-xl border border-white/10 bg-[#101218] px-4 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-indigo-500/60"
        />
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name (optional)"
          aria-label="First name (optional)"
          autoComplete="given-name"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#101218] px-4 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-indigo-500/60"
        />
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Unlocking…' : 'View full report'}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] text-gray-500">No credit card. No demo call. Just the report.</p>
    </div>
  );
}

// ---------- main report ----------

export default function LeadReport({
  data,
  history,
  percentile,
  unlocked,
  onUnlocked,
}: {
  data: ReportData;
  history: SnapshotRow[] | null;
  /** "Top X%" from /api/rank; null hides the percentile. */
  percentile: number | null;
  unlocked: boolean;
  onUnlocked: (email: string) => void;
}) {
  const domain = data.domain;
  const name = brandNameOf(data, domain);
  const [imgErr, setImgErr] = useState(false);

  const gScore = Math.round(Number(data.growth_score ?? 0));
  const momentum = data.growth_momentum ?? null;
  const metaCount = Number(data.meta_ads?.active_ads_count ?? 0);
  const campaigns = metaCount + adCount(data, 'Google') + adCount(data, 'LinkedIn');
  const categoryChip =
    data.primary_category ??
    (typeof data.company?.categories === 'string' ? (data.company.categories as string) : null);

  // 7-day momentum arrow from growth-score history (needs 2+ points).
  const scoreDelta = useMemo(() => {
    const pts = (history ?? [])
      .filter((h) => h.growth_score != null && h.snapshot_date)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    if (pts.length < 2) return null;
    return Number(pts[pts.length - 1].growth_score) - Number(pts[pts.length - 2].growth_score);
  }, [history]);

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

  const categories = useMemo(
    () =>
      buildSignalCategories({
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
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, metaCount, spendEst?.label]
  );
  const live = categories.filter((c) => c.status === 'live');

  // TWO visible signal tiles: live campaigns + hiring when present, otherwise
  // momentum + investment intensity. Curiosity, not the whole grid.
  const freeSignals = useMemo(() => {
    const tiles: { label: string; value: string; sub: string }[] = [];
    if (campaigns > 0) {
      tiles.push({
        label: 'Live campaigns',
        value: campaigns.toLocaleString(),
        sub: 'active ads across Meta, Google & LinkedIn',
      });
    }
    const roles = data.hiring?.open_roles;
    if (roles != null && roles > 0) {
      tiles.push({
        label: 'Hiring activity',
        value: roles.toLocaleString(),
        sub: `open roles${data.hiring?.growth_roles ? ` · ${data.hiring.growth_roles} growth` : ''}`,
      });
    }
    if (tiles.length < 2 && momentum) {
      tiles.push({ label: 'Momentum', value: momentum, sub: 'trailing growth-signal trajectory' });
    }
    if (tiles.length < 2) {
      const intensity = data.paid_media_signal ?? data.meta_ads?.ad_activity_level ?? null;
      tiles.push({
        label: 'Investment intensity',
        value: intensity ? intensity.charAt(0).toUpperCase() + intensity.slice(1) : spendEst?.label ?? 'Low',
        sub: 'paid-media investment level',
      });
    }
    return tiles.slice(0, 2);
  }, [campaigns, data, momentum, spendEst?.label]);

  const reason = buildReason({
    metaAds: metaCount,
    metaChangePct:
      data.trends?.active_meta_ads?.[1]?.change_pct ?? data.trends?.active_meta_ads?.[0]?.change_pct ?? null,
    realCreativeScore: data.paid_media_quality?.real_creative_score ?? null,
    creativeDiversityScore: data.paid_media_quality?.creative_diversity_score ?? null,
    dpaShare: data.paid_media_quality?.dpa_share ?? null,
    momentum,
    growthScore: data.growth_score ?? null,
    spend: spendEst,
    landingPages: data.meta_ads?.unique_landing_pages?.length ?? null,
  });

  return (
    <div className="space-y-5">
      {/* Screenshot-ready snapshot card */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0d0e17]/90 p-5 shadow-xl shadow-black/40 sm:p-7">
        {/* Header: logo, name, category */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f4f5f7] shadow-lg ring-1 ring-white/10 sm:h-14 sm:w-14">
            {imgErr ? (
              <span className="text-lg font-bold uppercase text-gray-600">{name.slice(0, 2)}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
                alt={`${name} logo`}
                width={32}
                height={32}
                referrerPolicy="no-referrer"
                onError={() => setImgErr(true)}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold text-white sm:text-2xl">{name}</h2>
              {categoryChip && (
                <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/25">
                  {categoryChip}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">{domain}</div>
          </div>
        </div>

        {/* Score line */}
        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Growth Score</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-6xl font-bold tabular-nums text-[#a99cff]">{gScore}</span>
              <div className="flex flex-col gap-1.5">
                {percentile != null && (
                  <span className="inline-flex items-center rounded-full bg-[#7c6ef5]/15 px-2.5 py-1 text-[11px] font-semibold text-[#b5aaff] ring-1 ring-[#7c6ef5]/30">
                    Top {percentile}% of tracked companies
                  </span>
                )}
                {momentum && (
                  <span
                    className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                      MOMENTUM_TONE[momentum] ?? MOMENTUM_TONE.Dormant
                    }`}
                  >
                    {momentum}
                    {scoreDelta != null && scoreDelta !== 0 && (
                      <span aria-label={scoreDelta > 0 ? 'trending up' : 'trending down'}>
                        {scoreDelta > 0 ? '↑' : '↓'}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Two free signal tiles */}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {freeSignals.map((t) => (
              <div key={t.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-gray-100">{t.value}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* One visible chart — Growth Over Time (growth-score tab is default) */}
        <div className="dark-app mt-6 rounded-2xl" style={{ background: 'transparent' }}>
          <GrowthOverTime history={history} />
        </div>

        {unlocked ? (
          <UnlockedModules data={data} spendEst={spendEst} campaigns={campaigns} live={live} reason={reason} name={name} />
        ) : (
          <section className="mt-6" aria-label="Locked report modules">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              <LockIcon width={12} height={12} />
              In the full report
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LOCKED_MODULES.map((m) => (
                <LockedModule key={m} label={m} />
              ))}
            </div>
          </section>
        )}
      </div>

      {unlocked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#7c6ef5]/25 bg-[#7c6ef5]/[0.07] px-5 py-4">
          <p className="text-sm text-gray-300">
            Want 5 lookups a day, watchlists, and alerts when companies start moving?
          </p>
          <Link
            href="/sign-up"
            className="text-sm font-semibold text-[#b5aaff] transition-colors hover:text-white"
          >
            Create a free account →
          </Link>
        </div>
      ) : (
        <UnlockGate domain={domain} onUnlocked={onUnlocked} />
      )}
    </div>
  );
}

// ---------- unlocked modules (real data, rendered in place) ----------

function UnlockedModules({
  data,
  spendEst,
  campaigns,
  live,
  reason,
  name,
}: {
  data: ReportData;
  spendEst: SpendEstimate | null;
  campaigns: number;
  live: ReturnType<typeof buildSignalCategories>;
  reason: string;
  name: string;
}) {
  return (
    <div className="mt-6 space-y-5">
      {/* Growth investment + revenue + campaigns */}
      <div className="dark-app grid grid-cols-1 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02] sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ background: 'transparent' }}>
        <MetricCard label="Growth Investment">
          <SpendEstimateBadge estimate={spendEst} />
        </MetricCard>
        <MetricCard label="Est. Revenue">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{data.revenue_range ?? '—'}</span>
          {data.revenue_confidence && (
            <span className="ml-1.5 text-[10px] capitalize text-gray-400">{data.revenue_confidence} confidence</span>
          )}
        </MetricCard>
        <MetricCard label="Live Campaigns">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{campaigns.toLocaleString()}</span>
          <span className="ml-1.5 text-[10px] text-gray-400">active ads</span>
        </MetricCard>
      </div>

      {/* Why interesting */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.05] p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">
          Why {name} is interesting
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-200">{reason}</p>
      </div>

      {/* Full signal grid */}
      <section aria-label="Growth signals">
        <h3 className="mb-3 text-sm font-semibold text-white">Growth Signals</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((cat) => (
            <div key={cat.key} className="rounded-2xl border border-white/[0.06] bg-[#101218] p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-gray-100">{cat.label}</h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/30">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>
              {cat.metrics.length > 0 ? (
                <dl className="mt-3 space-y-1.5">
                  {cat.metrics.slice(0, 4).map((m) => (
                    <div key={m.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[12px] text-gray-400">{m.label}</dt>
                      <dd
                        className={`text-[12px] font-semibold tabular-nums ${
                          m.tone === 'positive' ? 'text-emerald-400' : m.tone === 'muted' ? 'text-gray-400' : 'text-gray-200'
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
    </div>
  );
}
