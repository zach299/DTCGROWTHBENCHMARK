'use client';

import { useState } from 'react';

interface MetaAds {
  advertiser_name: string | null;
  active_ads_count: number;
  ad_activity_level: string;
  unique_landing_pages: string[];
  sample_ad_copy: string[];
  sample_creatives: string[];
  platforms: string[];
  first_seen_date: string | null;
}

interface BrandContext {
  seo_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  h1: string | null;
  hero_headline: string | null;
  hero_subheadline: string | null;
}

interface WebsiteSignals {
  subscription: boolean;
  affiliate_program: boolean;
  retail_presence: boolean;
  international: boolean;
  careers_active: boolean;
  careers_roles: string[];
}

interface LandingPageSignals {
  campaign_themes: string[];
}

interface AdPlatform {
  platform: string;
  status: string;
  ads_count: number | null;
  sample_ad_copy: string[];
  sample_creatives: string[];
  library_url: string | null;
}

interface DetectedTech {
  name: string;
  category: string;
}

interface TrendValue {
  window_days: number;
  current: number;
  previous: number | null;
  change_pct: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  label: string;
}

interface Trends {
  active_meta_ads: TrendValue[];
  growth_score: TrendValue;
  landing_pages: TrendValue;
}

interface TimelineEntry {
  date: string;
  active_meta_ads: number;
  active_google_ads: number;
  active_linkedin_ads: number;
  landing_pages_count: number;
  growth_score: number;
  growth_momentum: string | null;
  meta_change_pct: number | null;
  google_change_pct: number | null;
}

interface AnalysisResult {
  domain: string;
  growth_score?: number;
  growth_momentum?: string;
  momentum_score?: number;
  revenue_range?: string;
  revenue_confidence?: string;
  research_brief?: string | null;
  timeline?: TimelineEntry[] | null;
  paid_media_signal?: string;
  recommended_buyer?: string;
  recommended_angle?: string;
  outbound_hook?: string;
  reasons?: string[];
  meta_ads?: MetaAds | null;
  brand_context?: BrandContext | null;
  website_signals?: WebsiteSignals | null;
  landing_page_signals?: LandingPageSignals | null;
  ad_platforms?: AdPlatform[] | null;
  tech_stack?: DetectedTech[] | null;
  server_side_signals?: string[] | null;
  growth_narrative?: string | null;
  growth_prompt?: string | null;
  trends?: Trends | null;
  cached?: boolean;
  enriching?: boolean;
  company?: Record<string, unknown>;
}

const TECH_CATEGORY_ORDER = ['Ad Platform', 'Backend', 'Measurement', 'Lifecycle'];
const TECH_CATEGORY_STYLE: Record<string, string> = {
  'Ad Platform': 'bg-blue-50 text-blue-700 ring-blue-200',
  Backend: 'bg-gray-100 text-gray-700 ring-gray-200',
  Measurement: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Lifecycle: 'bg-amber-50 text-amber-700 ring-amber-200',
};

// ---- helpers ----
function parseNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function cstr(c: Record<string, unknown> | undefined, key: string): string | null {
  const v = c?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function formatMoney(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${Math.round(n / 1_000)}K`;
}
const MOMENTUM_EMOJI: Record<string, string> = {
  Dormant: '😴',
  Emerging: '🌱',
  Scaling: '📈',
  Accelerating: '🚀',
  Exploding: '💥',
};
function momentumColor(m?: string): string {
  if (m === 'Exploding' || m === 'Accelerating') return 'text-green-600';
  if (m === 'Scaling') return 'text-emerald-600';
  if (m === 'Emerging') return 'text-yellow-600';
  return 'text-gray-500';
}
function confidenceBadge(c?: string): string {
  if (c === 'High') return 'bg-green-50 text-green-700';
  if (c === 'Medium') return 'bg-yellow-50 text-yellow-700';
  return 'bg-gray-100 text-gray-500';
}

function scoreLabel(s: number): string {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Strong';
  if (s >= 40) return 'Moderate';
  return 'Low';
}
function scoreColor(s: number): string {
  if (s >= 70) return 'text-green-600';
  if (s >= 40) return 'text-yellow-600';
  return 'text-red-600';
}
function intensityLabel(signal: string): string {
  if (signal === 'high') return 'Very High';
  if (signal === 'medium') return 'High';
  if (signal === 'low') return 'Moderate';
  return 'Low';
}
function velocity(count: number): string {
  if (count >= 100) return 'High';
  if (count >= 25) return 'Medium';
  if (count >= 1) return 'Low';
  return 'None';
}
function diversity(n: number): string {
  if (n >= 5) return 'High';
  if (n >= 3) return 'Medium';
  if (n >= 1) return 'Low';
  return 'None';
}
function estSpend(salesYear: number): string {
  // Rough heuristic: ~12% of revenue on paid media, monthly.
  const monthly = (salesYear * 0.12) / 12;
  if (monthly <= 0) return '—';
  if (monthly < 10_000) return '< $10K';
  if (monthly < 50_000) return '$10K – $50K';
  if (monthly < 250_000) return '$50K – $250K';
  if (monthly < 1_000_000) return '$250K – $1M';
  if (monthly < 5_000_000) return '$1M – $5M';
  return '$5M+';
}
function narrativeTags(r: AnalysisResult): string[] {
  const tags: string[] = [];
  const cat = (cstr(r.company, 'categories') ?? '').toLowerCase();
  tags.push(cat.includes('business') ? 'B2B' : 'DTC Brand');
  if ((r.growth_score ?? 0) >= 70) tags.push('Scaling Stage');
  const ads = r.meta_ads?.active_ads_count ?? 0;
  if (ads >= 100) tags.push('High Ad Volume');
  const themes = r.landing_page_signals?.campaign_themes.length ?? 0;
  if (themes >= 4) tags.push('Product Expansion');
  return tags.slice(0, 4);
}
function paidStatusBadge(status: string): string {
  if (status === 'active') return 'bg-green-100 text-green-700';
  if (status === 'none') return 'bg-gray-100 text-gray-500';
  return 'bg-yellow-50 text-yellow-700';
}
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
function truncateUrl(url: string, max = 48): string {
  const d = url.replace(/^https?:\/\/(www\.)?/, '');
  return d.length > max ? d.slice(0, max) + '…' : d;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function trendArrow(d: TrendValue['direction']): string {
  if (d === 'up') return '↑';
  if (d === 'down') return '↓';
  if (d === 'flat') return '→';
  return '';
}
function trendColor(d: TrendValue['direction']): string {
  if (d === 'up') return 'text-green-600';
  if (d === 'down') return 'text-red-600';
  return 'text-gray-400';
}

function TrendStat({ label, value, trend }: { label: string; value: number; trend?: TrendValue }) {
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {trend && trend.change_pct != null ? (
        <div className={`text-xs font-medium ${trendColor(trend.direction)}`}>
          {trendArrow(trend.direction)} {trend.label}
        </div>
      ) : (
        <div className="text-xs text-gray-400">tracking…</div>
      )}
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[150px] px-5 py-4">
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function SignalRow({ label, active, detail }: { label: string; active: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-[11px] text-gray-400">{detail}</span>}
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
            active ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-red-50 text-red-600 ring-1 ring-red-200'
          }`}
        >
          {active ? 'Yes' : 'No'}
        </span>
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function ResearchBriefBody({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm text-gray-700 leading-relaxed">
      {text.split('\n').map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-1.5" />;
        if (t.startsWith('## '))
          return (
            <h4
              key={i}
              className="text-[11px] font-semibold text-gray-900 uppercase tracking-wide pt-3"
            >
              {t.slice(3)}
            </h4>
          );
        if (t.startsWith('- '))
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-gray-400">•</span>
              <span>{t.slice(2)}</span>
            </div>
          );
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

const NAV = ['Search', 'Dashboard', 'Watchlist', 'Reports', 'Credits'];

export default function Home() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || loading) return;
    const q = domain.trim();
    setLoading(true);
    setError(null);
    setResult(null);
    setShowRaw(false);
    setCopied(false);
    try {
      // Phase 1: instant company + cached analysis (+ trends).
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 404
            ? `"${data.domain ?? q}" was not found in the database.`
            : data.error || 'Something went wrong.'
        );
        return;
      }

      const base: AnalysisResult = {
        domain: data.domain,
        company: data.company,
        trends: data.trends ?? null,
        timeline: data.timeline ?? null,
        cached: Boolean(data.analysis),
        enriching: Boolean(data.needs_enrichment),
        ...(data.analysis ?? {}),
      };
      setResult(base);
      setLoading(false);

      // Phase 2: background enrichment when cache is missing/stale.
      if (data.needs_enrichment) {
        try {
          const enrichRes = await fetch('/api/analyze-domain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: q }),
          });
          const fresh = await enrichRes.json();
          if (enrichRes.ok) {
            setResult({ ...fresh, enriching: false });
          } else {
            // keep phase-1 view; just stop the enriching indicator
            setResult((r) => (r ? { ...r, enriching: false } : r));
          }
        } catch {
          setResult((r) => (r ? { ...r, enriching: false } : r));
        }
      }
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  }

  async function copyBrief() {
    const text = result?.research_brief || result?.growth_prompt;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const sales = parseNum(result?.company?.['estimated_yearly_sales']);
  const followers = parseNum(result?.company?.['combined_followers']);
  const metaCount = result?.meta_ads?.active_ads_count ?? 0;
  const themes = result?.landing_page_signals?.campaign_themes ?? [];
  const brandName = result?.meta_ads?.advertiser_name || result?.domain || '';
  const techByCat = (cat: string) => (result?.tech_stack ?? []).filter((t) => t.category === cat);
  const hasAnalysis = result?.growth_score != null;
  const enriching = Boolean(result?.enriching);
  const gScore = result?.growth_score ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-gray-900 text-gray-300 px-4 py-6">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="h-7 w-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold">
            ⚡
          </div>
          <span className="font-semibold text-white">Growth Signals</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((item, i) => (
            <div
              key={item}
              className={`rounded-lg px-3 py-2 text-sm ${
                i === 0 ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {item}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-xs text-gray-500">
          Northbeam GTM Intelligence
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="border-b border-gray-200 bg-white px-6 py-3 sticky top-0 z-10">
          <form onSubmit={analyze} className="flex items-center gap-3 max-w-2xl">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ridge.com"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 pl-9 pr-4 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </form>
        </div>

        <div className="px-6 py-6 max-w-6xl mx-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 mb-6">
              {error}
            </div>
          )}

          {loading && !result && (
            <div className="text-center text-gray-400 py-24">Analyzing {domain}…</div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Brand header */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-gray-900 text-white flex items-center justify-center text-lg font-bold uppercase">
                    {brandName.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold text-gray-900">{brandName}</h1>
                      {enriching && (
                        <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          enriching…
                        </span>
                      )}
                      {!enriching && result.cached && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          cached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{result.domain}</span>
                      {cstr(result.company, 'platform') && (
                        <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                          {cstr(result.company, 'platform')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://${result.domain.replace(/^https?:\/\//, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    ↗ Visit Website
                  </a>
                  <button
                    onClick={copyBrief}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      copied ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {copied ? '✓ Copied' : '✦ Research Brief'}
                  </button>
                </div>
              </div>

              {/* Stat row */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-wrap divide-x divide-gray-100">
                <StatCard label="Growth Score">
                  {hasAnalysis ? (
                    <div className="flex items-center gap-2">
                      <span className={`text-3xl font-bold ${scoreColor(gScore)}`}>{gScore}</span>
                      <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        {scoreLabel(gScore)}
                      </span>
                    </div>
                  ) : (
                    <Skeleton className="h-9 w-16" />
                  )}
                </StatCard>
                <StatCard label="Paid Media Intensity">
                  {hasAnalysis ? (
                    <div className="text-2xl font-bold text-gray-900">
                      {intensityLabel(result.paid_media_signal ?? '')}
                    </div>
                  ) : (
                    <Skeleton className="h-8 w-24" />
                  )}
                </StatCard>
                <StatCard label="Est. Yearly Revenue">
                  <div className="text-2xl font-bold text-gray-900">
                    {result.revenue_range ?? formatMoney(sales)}
                  </div>
                  {result.revenue_confidence && (
                    <span
                      className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${confidenceBadge(result.revenue_confidence)}`}
                    >
                      {result.revenue_confidence} confidence
                    </span>
                  )}
                </StatCard>
                <StatCard label="Active Meta Ads">
                  {hasAnalysis || result.meta_ads ? (
                    <div className="text-3xl font-bold text-gray-900">{metaCount}</div>
                  ) : (
                    <Skeleton className="h-9 w-12" />
                  )}
                </StatCard>
                <StatCard label="Growth Momentum">
                  {result.growth_momentum ? (
                    <div className={`text-xl font-bold ${momentumColor(result.growth_momentum)}`}>
                      {result.growth_momentum} {MOMENTUM_EMOJI[result.growth_momentum] ?? ''}
                    </div>
                  ) : (
                    <Skeleton className="h-7 w-28" />
                  )}
                </StatCard>
              </div>

              {/* Growth Trends */}
              {result.trends && (
                <Card title="Growth Trends">
                  <div className="flex flex-wrap gap-6">
                    <TrendStat
                      label="Active Ads"
                      value={result.trends.active_meta_ads[1]?.current ?? metaCount}
                      trend={result.trends.active_meta_ads[1]}
                    />
                    <TrendStat
                      label="Growth Score"
                      value={result.trends.growth_score.current ?? gScore}
                      trend={result.trends.growth_score}
                    />
                    <TrendStat
                      label="Landing Pages"
                      value={result.trends.landing_pages.current}
                      trend={result.trends.landing_pages}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3">
                    Trends compound daily — the more often a domain is analyzed, the richer its history.
                  </p>
                </Card>
              )}

              {/* Growth Timeline */}
              {result.timeline && result.timeline.length > 0 && (
                <Card title="Growth Timeline">
                  {result.timeline.length === 1 ? (
                    <p className="text-sm text-gray-500">
                      First snapshot recorded today. Re-analyze later to see what changes over time.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {[...result.timeline].reverse().map((e, i) => (
                        <div
                          key={e.date}
                          className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                        >
                          <div className="w-20 text-sm font-medium text-gray-700">
                            {new Date(e.date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                            <span className="text-gray-700">
                              Meta <span className="font-semibold">{e.active_meta_ads}</span>
                              {e.meta_change_pct != null && i < result.timeline!.length - 1 && (
                                <span
                                  className={`ml-1 text-xs ${e.meta_change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {e.meta_change_pct >= 0 ? '+' : ''}
                                  {e.meta_change_pct}%
                                </span>
                              )}
                            </span>
                            <span className="text-gray-700">
                              Google <span className="font-semibold">{e.active_google_ads}</span>
                              {e.google_change_pct != null && i < result.timeline!.length - 1 && (
                                <span
                                  className={`ml-1 text-xs ${e.google_change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {e.google_change_pct >= 0 ? '+' : ''}
                                  {e.google_change_pct}%
                                </span>
                              )}
                            </span>
                            {e.growth_momentum && (
                              <span className={`text-xs font-medium ${momentumColor(e.growth_momentum)}`}>
                                {e.growth_momentum}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Enriching skeleton (first-time domains, before data arrives) */}
              {enriching && !result.meta_ads && (
                <Card title="Paid Media Overview">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i}>
                        <Skeleton className="h-3 w-16 mb-2" />
                        <Skeleton className="h-7 w-12" />
                      </div>
                    ))}
                  </div>
                  <Skeleton className="h-3 w-40 mt-4" />
                </Card>
              )}

              {/* Two-column grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT (2 cols) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Growth Narrative */}
                  {result.growth_narrative && (
                    <Card
                      title="✦ Growth Narrative"
                      action={
                        <button
                          onClick={copyBrief}
                          className="text-xs text-gray-500 hover:text-gray-700 rounded-md border border-gray-200 px-2.5 py-1"
                        >
                          {copied ? '✓ Copied' : '⧉ Copy'}
                        </button>
                      }
                    >
                      <p className="text-gray-800 leading-relaxed">{result.growth_narrative}</p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        {narrativeTags(result).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Research Brief */}
                  {result.research_brief ? (
                    <Card
                      title="✦ Research Brief"
                      action={
                        <button
                          onClick={copyBrief}
                          className={`text-xs rounded-md px-3 py-1 font-medium ${
                            copied
                              ? 'bg-green-100 text-green-700'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {copied ? '✓ Copied' : '⧉ Copy Brief'}
                        </button>
                      }
                    >
                      <ResearchBriefBody text={result.research_brief} />
                    </Card>
                  ) : (
                    enriching && (
                      <Card title="✦ Research Brief">
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-3/4" />
                        </div>
                      </Card>
                    )
                  )}

                  {/* Paid Media Overview */}
                  {result.meta_ads && (
                    <Card title="Paid Media Overview">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Active Ads</div>
                          <div className="text-2xl font-bold text-gray-900">{metaCount}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Landing Pages</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {result.meta_ads.unique_landing_pages.length}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Creative Velocity</div>
                          <div className="text-lg font-semibold text-gray-900">{velocity(metaCount)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Campaign Diversity</div>
                          <div className="text-lg font-semibold text-gray-900">{diversity(themes.length)}</div>
                        </div>
                      </div>

                      {/* Themes + landing pages */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {themes.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Top Campaign Themes
                            </h4>
                            <ul className="space-y-1.5">
                              {themes.slice(0, 6).map((t) => (
                                <li key={t} className="flex items-center gap-2 text-sm text-gray-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {result.meta_ads.unique_landing_pages.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Top Landing Pages
                            </h4>
                            <ol className="space-y-1.5">
                              {result.meta_ads.unique_landing_pages.slice(0, 6).map((u, i) => (
                                <li key={i} className="flex items-baseline gap-2 text-sm">
                                  <span className="text-gray-400 text-xs">{i + 1}</span>
                                  <a
                                    href={u}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 hover:text-indigo-800 break-all"
                                  >
                                    {truncateUrl(u)}
                                  </a>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* Recent Ad Creatives */}
                  {result.meta_ads && result.meta_ads.sample_creatives.length > 0 && (
                    <Card title="Recent Ad Creatives">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {result.meta_ads.sample_creatives.slice(0, 6).map((src, i) => (
                          <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt="ad creative"
                              referrerPolicy="no-referrer"
                              className="w-full h-32 object-cover bg-gray-100"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <div className="p-2">
                              <p className="text-[11px] text-gray-600 leading-snug">
                                {truncate(result.meta_ads?.sample_ad_copy[i] ?? '', 90)}
                              </p>
                              <div className="flex items-center gap-1 mt-1.5 text-[11px] text-green-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>

                {/* RIGHT (1 col) */}
                <div className="space-y-6">
                  {/* Ad Platforms */}
                  {result.ad_platforms && result.ad_platforms.length > 0 && (
                    <Card title="Ad Platforms">
                      <div className="space-y-2">
                        {result.ad_platforms.map((p) => (
                          <div
                            key={p.platform}
                            className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                          >
                            <span className="text-sm font-medium text-gray-800">{p.platform}</span>
                            <div className="flex items-center gap-2">
                              {p.status !== 'unknown' && (
                                <span className="text-sm font-semibold text-gray-900">{p.ads_count ?? 0}</span>
                              )}
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${paidStatusBadge(p.status)}`}
                              >
                                {p.status === 'active' ? 'Active' : p.status === 'none' ? 'None' : '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Company Snapshot */}
                  <Card title="Company Snapshot">
                    <dl className="space-y-2.5 text-sm">
                      {cstr(result.company, 'platform') && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Platform</dt>
                          <dd className="text-gray-900 font-medium">{cstr(result.company, 'platform')}</dd>
                        </div>
                      )}
                      {cstr(result.company, 'company_location') && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500">Location</dt>
                          <dd className="text-gray-900 font-medium text-right">
                            {cstr(result.company, 'company_location')}
                          </dd>
                        </div>
                      )}
                      {cstr(result.company, 'categories') && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500">Categories</dt>
                          <dd className="text-gray-900 font-medium text-right">
                            {cstr(result.company, 'categories')?.replace(/^\//, '').replace(/\//g, ' / ')}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Est. Revenue</dt>
                        <dd className="text-gray-900 font-medium">{formatMoney(sales)}</dd>
                      </div>
                      {followers > 0 && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Social Followers</dt>
                          <dd className="text-gray-900 font-medium">{followers.toLocaleString()}</dd>
                        </div>
                      )}
                    </dl>
                  </Card>

                  {/* Key Signals */}
                  {result.website_signals && (
                    <Card title="Key Signals">
                      <SignalRow label="Subscription Model" active={result.website_signals.subscription} />
                      <SignalRow label="Affiliate Program" active={result.website_signals.affiliate_program} />
                      <SignalRow label="International Shipping" active={result.website_signals.international} />
                      <SignalRow label="Retail Presence" active={result.website_signals.retail_presence} />
                      <SignalRow
                        label="Careers / Hiring"
                        active={result.website_signals.careers_active}
                        detail={
                          result.website_signals.careers_roles.length
                            ? result.website_signals.careers_roles.slice(0, 2).join(', ')
                            : undefined
                        }
                      />
                    </Card>
                  )}

                  {/* Estimated Paid Media Spend */}
                  {sales > 0 && (
                    <Card title="Est. Paid Media Spend">
                      <div className="text-2xl font-bold text-gray-900">{estSpend(sales)}</div>
                      <div className="text-xs text-gray-400">per month</div>
                      <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                        Modeled from estimated revenue and ad activity. Directional only.
                      </p>
                    </Card>
                  )}

                  {/* Tech Stack */}
                  {result.tech_stack && result.tech_stack.length > 0 && (
                    <Card title="Tech Stack">
                      <div className="space-y-3">
                        {TECH_CATEGORY_ORDER.map((cat) => {
                          const items = techByCat(cat);
                          if (items.length === 0) return null;
                          return (
                            <div key={cat}>
                              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                {cat}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {items.map((t) => (
                                  <span
                                    key={t.name}
                                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${
                                      TECH_CATEGORY_STYLE[cat] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
                                    }`}
                                  >
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {result.server_side_signals && result.server_side_signals.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                            Server-Side / CAPI
                          </div>
                          <ul className="space-y-1">
                            {result.server_side_signals.map((s, i) => (
                              <li key={i} className="text-[11px] text-gray-600 leading-snug">
                                • {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Recommendations */}
                  <Card title="Recommendations">
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Ideal Buyer</div>
                        <div className="text-gray-900 font-medium">{result.recommended_buyer}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Best Angle</div>
                        <div className="text-gray-900 font-medium">{result.recommended_angle}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Outbound Hook</div>
                        <div className="text-gray-700">{result.outbound_hook}</div>
                      </div>
                    </div>
                    <button
                      onClick={copyBrief}
                      className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium ${
                        copied ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {copied ? '✓ Brief copied' : '✦ Generate Research Brief'}
                    </button>
                  </Card>
                </div>
              </div>

              {/* Raw JSON */}
              <div>
                <button
                  onClick={() => setShowRaw((s) => !s)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
                </button>
                {showRaw && (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs text-gray-100">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="text-center text-gray-400 py-24">
              Enter a domain above to generate a GTM intelligence report.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
