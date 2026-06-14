'use client';

import { useState, useEffect } from 'react';
import { buildResearchBrief, type ResearchBriefInput } from '@/lib/researchBrief';
import { LENSES, getLens } from '@/lib/lenses';
import type { Momentum } from '@/lib/intelligence';

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
  cache_age_days?: number | null;
  company?: Record<string, unknown>;
  spend_band?: string | null;
  primary_category?: string | null;
  paid_media_quality?: PaidMediaQuality | null;
}

interface PaidMediaQuality {
  real_creative_score: number;
  quality_adjusted_ads: number;
  unique_creative_count: number;
  creative_diversity_score: number;
  campaign_angle_count: number;
  offer_diversity: number;
  landing_page_diversity: number;
  dpa_share: number;
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

function adCount(result: AnalysisResult, platform: string): number {
  const p = (result.ad_platforms ?? []).find((x) => x.platform === platform);
  return p && p.status === 'active' ? p.ads_count ?? 0 : 0;
}
function briefInputFrom(result: AnalysisResult): ResearchBriefInput | null {
  if (!result.meta_ads && !result.ad_platforms) return null;
  const brand =
    result.meta_ads?.advertiser_name || result.domain.replace(/^www\./i, '').split('.')[0];
  return {
    brandName: brand,
    domain: result.domain,
    category: cstr(result.company, 'categories'),
    location: cstr(result.company, 'company_location'),
    revenueRange: result.revenue_range ?? 'Unknown',
    revenueConfidence: result.revenue_confidence ?? 'Low',
    momentum: (result.growth_momentum ?? 'Scaling') as Momentum,
    paidIntensity: result.paid_media_signal ?? 'low',
    metaAds: result.meta_ads?.active_ads_count ?? 0,
    googleAds: adCount(result, 'Google'),
    linkedinAds: adCount(result, 'LinkedIn'),
    landingPages: result.meta_ads?.unique_landing_pages ?? [],
    campaignThemes: result.landing_page_signals?.campaign_themes ?? [],
    sampleAdCopy: result.meta_ads?.sample_ad_copy ?? [],
    positioning:
      result.brand_context?.hero_subheadline ?? result.brand_context?.meta_description ?? null,
    techStack: result.tech_stack ?? [],
    serverSide: result.server_side_signals ?? [],
    websiteSignals: result.website_signals ?? null,
    quality: result.paid_media_quality
      ? {
          realCreativeScore: result.paid_media_quality.real_creative_score,
          dpaShare: result.paid_media_quality.dpa_share,
          uniqueCreatives: result.paid_media_quality.unique_creative_count,
          campaignAngles: result.paid_media_quality.campaign_angle_count,
          offerDiversity: result.paid_media_quality.offer_diversity,
          landingPageDiversity: result.paid_media_quality.landing_page_diversity,
        }
      : null,
  };
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function LoadingChart({ label = 'Loading Growth Signals…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <svg width="200" height="100" viewBox="0 0 200 100">
        <polyline
          points="0,88 30,78 60,82 90,52 120,58 150,28 200,8"
          fill="none"
          stroke="#4f46e5"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="gs-draw"
        />
        <circle cx="200" cy="8" r="4" fill="#4f46e5" className="gs-pulse" />
      </svg>
      <div className="text-sm font-medium text-gray-500">{label}</div>
    </div>
  );
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

function QStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-[11px] text-gray-500 leading-tight">{label}</div>
    </div>
  );
}

function creativeLabel(score: number): string {
  if (score >= 75) return 'Exceptional';
  if (score >= 55) return 'Strong';
  if (score >= 35) return 'Moderate';
  if (score >= 15) return 'Light';
  return 'Minimal';
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

const NAV: { label: string; view: View }[] = [
  { label: 'Top Movers', view: 'movers' },
  { label: 'Search', view: 'search' },
  { label: 'My Accounts', view: 'watchlist' },
  { label: 'Bulk Enrichment', view: 'bulk' },
  { label: 'Import Data', view: 'import' },
];

type View = 'search' | 'watchlist' | 'movers' | 'bulk' | 'import';

interface WatchlistItem {
  id: number;
  domain: string;
  brand_name: string | null;
  list_name: string;
  latest?: { growth_momentum?: string | null; growth_score?: number | null } | null;
}

function movementArrow(momentum?: string | null): { arrow: string; color: string } {
  if (momentum === 'Exploding' || momentum === 'Accelerating') return { arrow: '↑', color: 'text-green-600' };
  if (momentum === 'Scaling') return { arrow: '→', color: 'text-gray-400' };
  if (momentum === 'Emerging' || momentum === 'Dormant') return { arrow: '↓', color: 'text-red-500' };
  return { arrow: '·', color: 'text-gray-300' };
}

const WATCHLISTS = ['Prospects', 'Clients', 'Competitors'];

function WatchlistView({ onSelect }: { onSelect: (d: string) => void }) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/watchlist');
      const d = await r.json();
      setItems(d.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (domain: string, list_name: string) => {
    await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, list_name }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Accounts</h1>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {WATCHLISTS.map((list) => {
            const inList = items.filter((i) => i.list_name === list);
            return (
              <Card key={list} title={`${list} (${inList.length})`}>
                {inList.length === 0 ? (
                  <p className="text-sm text-gray-400">No companies yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {inList.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onSelect(it.domain)}
                          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 text-left truncate"
                        >
                          <span className={`font-bold ${movementArrow(it.latest?.growth_momentum).color}`}>
                            {movementArrow(it.latest?.growth_momentum).arrow}
                          </span>
                          <span className="truncate">{it.brand_name || it.domain}</span>
                        </button>
                        <button
                          onClick={() => remove(it.domain, list)}
                          className="text-xs text-gray-400 hover:text-red-500 shrink-0"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Mover {
  rank: number;
  domain: string;
  company_name: string | null;
  primary_category?: string | null;
  active_meta_ads: number;
  google_ads?: number;
  linkedin_ads?: number;
  creative_velocity?: string | null;
  growth_score?: number;
  growth_momentum: string | null;
  estimated_revenue_range?: string | null;
  spend_band?: string | null;
  landing_pages_count: number;
  percentile_top: number | null;
  last_enriched_at: string | null;
  real_creative_score?: number | null;
  dpa_share?: number | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type MoverTab = 'fastest' | 'meta' | 'google' | 'linkedin' | 'new' | 'top1' | 'category';
const MOVER_TABS: { key: MoverTab; label: string }[] = [
  { key: 'fastest', label: 'Fastest Growing' },
  { key: 'meta', label: 'Top Meta' },
  { key: 'google', label: 'Top Google' },
  { key: 'linkedin', label: 'Top LinkedIn' },
  { key: 'new', label: 'Newly Enriched' },
  { key: 'top1', label: 'Entering Top 1%' },
  { key: 'category', label: 'By Category' },
];

function TopMoversView({ onSelect }: { onSelect: (d: string) => void }) {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [segments, setSegments] = useState<Record<string, Mover[]>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MoverTab>('fastest');
  const [cat, setCat] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/top-movers');
        const d = await r.json();
        setMovers(d.movers ?? []);
        setSegments(d.segments ?? {});
        setCategories(d.categories ?? []);
        setTotal(d.total ?? 0);
        if ((d.categories ?? []).length) setCat(d.categories[0]);
      } catch {
        setMovers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The list to show depends on the active tab/segment.
  const sorted: Mover[] =
    tab === 'meta' ? segments.top_meta ?? []
    : tab === 'google' ? segments.top_google ?? []
    : tab === 'linkedin' ? segments.top_linkedin ?? []
    : tab === 'new' ? segments.newly_enriched ?? []
    : tab === 'top1' ? segments.entering_top_1 ?? []
    : tab === 'category' ? movers.filter((m) => m.primary_category === cat)
    : movers;

  const subtitle =
    tab === 'meta' ? 'Top Meta advertisers by active ad volume'
    : tab === 'google' ? 'Top Google advertisers'
    : tab === 'linkedin' ? 'Top LinkedIn advertisers'
    : tab === 'new' ? 'Most recently enriched companies'
    : tab === 'top1' ? 'Companies in the Top 1% of growth'
    : tab === 'category' ? `Top ${cat} brands by growth`
    : `${total.toLocaleString()} companies tracked · ranked by Growth Score`;

  const brand = (m: Mover) => m.company_name || m.domain.replace(/^www\./, '').split('.')[0];
  const maxScore = Math.max(1, ...sorted.map((m) => m.growth_score || 0));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Top Movers</h1>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {MOVER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 font-medium ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
        {tab === 'category' && categories.length > 0 && (
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400">
            No companies enriched yet. Run a batch in Bulk Enrichment to build the leaderboard.
          </p>
        </Card>
      ) : (
        <Card>
          {/* Column header for a premium terminal feel */}
          <div className="hidden md:flex items-center gap-4 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <div className="w-10">Rank</div>
            <div className="flex-1">Company</div>
            <div className="hidden lg:block w-24 text-center">Creative</div>
            <div className="hidden md:block w-28 text-right">Momentum</div>
            <div className="hidden lg:flex gap-3"><div className="w-14 text-right">Meta</div><div className="w-14 text-right">Google</div><div className="w-14 text-right">LinkedIn</div></div>
            <div className="hidden xl:block w-20 text-right">Updated</div>
          </div>
          <div className="divide-y divide-gray-100">
            {sorted.map((m) => {
              const score = m.growth_score || 0;
              const barPct = Math.max(4, Math.round((score / maxScore) * 100));
              const rcs = m.real_creative_score;
              const dpa = m.dpa_share ?? 0;
              const qTone = rcs == null ? 'bg-gray-300' : rcs >= 55 ? 'bg-green-500' : rcs >= 35 ? 'bg-yellow-400' : 'bg-gray-400';
              return (
                <button
                  key={m.domain}
                  onClick={() => onSelect(m.domain)}
                  className="flex w-full items-center gap-4 py-2.5 text-left hover:bg-gray-50 -mx-2 px-2 rounded-lg"
                >
                  <div className={`w-10 text-sm font-bold ${m.rank <= 3 ? 'text-indigo-500' : 'text-gray-400'}`}>
                    {m.rank <= 3 ? ['🥇', '🥈', '🥉'][m.rank - 1] : `#${m.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate capitalize">{brand(m)}</span>
                      {m.percentile_top != null && m.percentile_top <= 5 && (
                        <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">Top {m.percentile_top}%</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {m.domain}
                      {m.primary_category ? ` · ${m.primary_category}` : ''}
                      {m.estimated_revenue_range && m.estimated_revenue_range !== 'Unknown' ? ` · ${m.estimated_revenue_range}` : ''}
                    </div>
                    {/* Growth Score bar */}
                    <div className="mt-1 h-1 w-full max-w-[220px] rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-indigo-400" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                  {/* Creative quality */}
                  <div className="hidden lg:flex w-24 flex-col items-center" title={`Real Creative Score${rcs != null ? ` ${rcs}` : ''} · DPA ${Math.round(dpa * 100)}%`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${qTone}`} />
                      <span className="text-sm font-bold text-gray-900">{rcs ?? '—'}</span>
                    </div>
                    <div className="text-[10px] text-gray-400">{dpa >= 0.5 ? 'catalog-heavy' : 'real creative'}</div>
                  </div>
                  {m.growth_momentum && (
                    <span className={`hidden md:inline w-28 text-right text-xs font-semibold ${momentumColor(m.growth_momentum)}`}>
                      {m.growth_momentum} {MOMENTUM_EMOJI[m.growth_momentum] || ''}
                    </span>
                  )}
                  <div className="hidden lg:flex items-center gap-3 text-right">
                    <div className="w-14"><div className="text-sm font-bold text-gray-900">{m.active_meta_ads}</div></div>
                    <div className="w-14"><div className="text-sm font-bold text-gray-500">{m.google_ads ?? 0}</div></div>
                    <div className="w-14"><div className="text-sm font-bold text-gray-500">{m.linkedin_ads ?? 0}</div></div>
                  </div>
                  <div className="lg:hidden w-16 text-right">
                    <div className="text-sm font-bold text-gray-900">{m.active_meta_ads}</div>
                    <div className="text-[10px] text-gray-400">Meta</div>
                  </div>
                  <div className="hidden xl:block w-20 text-right text-[11px] text-gray-400">
                    {relativeTime(m.last_enriched_at)}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

interface BulkStats {
  total_domains: number;
  enriched: number;
  with_ads: number;
  remaining: number;
  success_rate: number | null;
  estimated_cost: number;
  last_run: string | null;
  avg_active_ads: number;
  avg_landing_pages: number;
  pct_with_ads: number;
}

const COST_PER_DOMAIN = 0.01;

// Streaming CSV import for master_database. Reads the file in the browser,
// parses it incrementally (handles quoted fields with commas/newlines), and
// POSTs rows to /api/import-master in chunks — so a 100k or 14M-row export
// uploads steadily without the Supabase dashboard importer's size limit.
const IMPORT_COLUMNS = [
  'domain', 'average_product_price', 'categories', 'combined_followers',
  'company_location', 'estimated_yearly_sales', 'facebook_url',
  'instagram_url', 'platform', 'tiktok_url',
];

function ImportView() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapped, setMapped] = useState<string[]>([]);
  const [prog, setProg] = useState({ read: 0, upserted: 0, skipped: 0, failed: 0 });

  // One-time backfill of derived intelligence for already-enriched companies.
  const [bf, setBf] = useState<{ running: boolean; processed: number; updated: number; done: boolean }>({
    running: false, processed: 0, updated: 0, done: false,
  });
  async function runBackfill() {
    setBf({ running: true, processed: 0, updated: 0, done: false });
    let cursor = 0, processed = 0, updated = 0;
    try {
      for (;;) {
        const r = await fetch('/api/backfill', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor }),
        });
        const d = await r.json();
        if (!r.ok) break;
        processed += d.processed ?? 0;
        updated += d.updated ?? 0;
        cursor = d.next_cursor ?? cursor;
        setBf({ running: !d.done, processed, updated, done: !!d.done });
        if (d.done) break;
      }
    } catch {
      /* stop */
    }
    setBf((s) => ({ ...s, running: false, done: true }));
  }

  // Minimal RFC-4180 incremental parser. Feed it text chunks; it calls onRow
  // for each complete record. Quotes, escaped quotes (""), and commas/newlines
  // inside quotes are handled.
  function makeParser(onRow: (cells: string[]) => void) {
    let field = '';
    let row: string[] = [];
    let inQuotes = false;
    let prevQuote = false;
    return {
      push(chunk: string) {
        for (let i = 0; i < chunk.length; i++) {
          const c = chunk[i];
          if (inQuotes) {
            if (c === '"') { prevQuote = true; inQuotes = false; }
            else field += c;
          } else if (prevQuote && c === '"') {
            field += '"'; inQuotes = true; prevQuote = false;
          } else {
            prevQuote = false;
            if (c === '"') inQuotes = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); onRow(row); row = []; field = ''; }
            else if (c !== '\r') field += c;
          }
        }
      },
      end() { if (field.length || row.length) { row.push(field); onRow(row); } },
    };
  }

  async function handleFile(file: File) {
    setRunning(true);
    setDone(false);
    setError(null);
    setMapped([]);
    setProg({ read: 0, upserted: 0, skipped: 0, failed: 0 });

    let header: string[] | null = null;
    let colIdx: { name: string; idx: number }[] = [];
    let read = 0, upserted = 0, skipped = 0, failed = 0;
    let batch: Record<string, string | null>[] = [];
    const BATCH = 500;

    // Send rows in slices of BATCH (<= the API's 1000-row cap). If `all` is
    // false, leave a partial (< BATCH) tail in the buffer for the next chunk.
    const flush = async (all: boolean) => {
      while (batch.length >= BATCH || (all && batch.length > 0)) {
        const rows = batch.slice(0, BATCH);
        batch = batch.slice(BATCH);
        try {
          const r = await fetch('/api/import-master', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows }),
          });
          const d = await r.json();
          if (r.ok) { upserted += d.upserted ?? 0; skipped += d.skipped ?? 0; }
          else failed += rows.length;
        } catch {
          failed += rows.length;
        }
        setProg({ read, upserted, skipped, failed });
      }
    };

    const onRow = (cells: string[]) => {
      if (!header) {
        header = cells.map((h) => h.trim().toLowerCase());
        colIdx = header
          .map((name, idx) => ({ name, idx }))
          .filter((c) => IMPORT_COLUMNS.includes(c.name));
        setMapped(colIdx.map((c) => c.name));
        if (!colIdx.some((c) => c.name === 'domain')) {
          setError(`CSV has no "domain" column. Found: ${header.join(', ')}`);
          throw new Error('no domain column');
        }
        return;
      }
      read++;
      const rec: Record<string, string | null> = {};
      for (const { name, idx } of colIdx) {
        const v = (cells[idx] ?? '').trim();
        rec[name] = v === '' ? null : v;
      }
      batch.push(rec);
    };

    const parser = makeParser(onRow);
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (true) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        try { parser.push(value); } catch { setRunning(false); return; }
        // Flush full batches as they accumulate, keeping the partial tail.
        await flush(false);
        setProg({ read, upserted, skipped, failed });
      }
      parser.end();
      await flush(true);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setRunning(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a Store Leads CSV export into the company database. The file is read and
          uploaded in batches right here in the browser — no size limit, no Supabase dashboard.
          Rows are matched on <code className="text-gray-700">domain</code>, so re-uploading
          safely updates existing companies instead of erroring.
        </p>
      </div>

      <label
        className={`block rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition ${
          running ? 'border-gray-200 bg-gray-50 pointer-events-none opacity-60' : 'border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50'
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={running}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div className="text-sm font-medium text-gray-700">
          {running ? 'Importing…' : 'Click to choose a CSV file'}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Recognized columns: {IMPORT_COLUMNS.join(', ')}
        </div>
      </label>

      {mapped.length > 0 && (
        <div className="text-xs text-gray-500">
          Mapping columns: <span className="text-gray-800">{mapped.join(', ')}</span>
        </div>
      )}

      {(running || done) && (
        <div className="rounded-lg border border-gray-200 p-4 space-y-2">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{fmt(prog.read)}</div>
              <div className="text-xs text-gray-500">rows read</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{fmt(prog.upserted)}</div>
              <div className="text-xs text-gray-500">imported</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-400">{fmt(prog.skipped + prog.failed)}</div>
              <div className="text-xs text-gray-500">skipped / failed</div>
            </div>
          </div>
          {done && (
            <div className="text-sm text-green-700 font-medium text-center pt-2">
              ✓ Done — {fmt(prog.upserted)} companies imported.
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-900">Backfill intelligence</div>
          <div className="text-xs text-gray-500">
            Recompute category, growth score, revenue range &amp; spend band for already-enriched companies. Free — no re-scraping.
            {bf.processed > 0 && ` · ${bf.updated.toLocaleString()} updated / ${bf.processed.toLocaleString()} scanned${bf.done ? ' ✓' : '…'}`}
          </div>
        </div>
        <button
          onClick={runBackfill}
          disabled={bf.running}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0"
        >
          {bf.running ? 'Backfilling…' : bf.done ? 'Run again' : 'Run backfill'}
        </button>
      </div>
    </div>
  );
}

function BulkView() {
  const [s, setS] = useState<BulkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(50);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ total: 0, processed: 0, ok: 0, withAds: 0, failed: 0, lastError: '' });

  const loadStats = async () => {
    try {
      const r = await fetch('/api/bulk-stats');
      setS(await r.json());
    } catch {
      setS(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadStats();
  }, []);

  async function runBatch() {
    if (running) return;
    setRunning(true);
    const target = batchSize; // total to enrich this session (auto-chained)
    setProg({ total: target, processed: 0, ok: 0, withAds: 0, failed: 0, lastError: '' });

    const jobRes = await fetch('/api/bulk-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const { job_id } = await jobRes.json();
    let processed = 0, ok = 0, withAds = 0, failed = 0, lastError = '';
    const CHUNK = 250;

    const updateJob = (done = false) =>
      fetch('/api/bulk-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id, domains_processed: processed, domains_successful: ok, domains_failed: failed, estimated_cost: Math.round(processed * COST_PER_DOMAIN * 100) / 100, done }),
      });

    try {
      // Auto-chain: each chunk's enriched domains are skipped on the next pull,
      // so we keep grabbing the next un-enriched stores until the target is hit
      // (or there are none left).
      while (processed < target) {
        const want = Math.min(CHUNK, target - processed);
        const tRes = await fetch('/api/bulk-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: want }),
        });
        const { targets } = await tRes.json();
        if (!targets?.length) break; // nothing left to enrich

        let idx = 0;
        const worker = async () => {
          while (idx < targets.length) {
            const t = targets[idx++];
            try {
              const res = await fetch('/api/enrich-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(t),
              });
              const d = await res.json();
              if (d.ok) {
                ok += 1;
                if (Number(d.signals?.active_meta_ads ?? 0) > 0) withAds += 1;
              } else {
                failed += 1;
                if (d.error) lastError = String(d.error);
              }
            } catch (e) {
              failed += 1;
              lastError = e instanceof Error ? e.message : String(e);
            }
            processed += 1;
            setProg({ total: target, processed, ok, withAds, failed, lastError });
            if (processed % 10 === 0) {
              updateJob();
              loadStats();
            }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      }
    } catch {
      /* noop */
    } finally {
      await updateJob(true);
      await loadStats();
      setRunning(false);
    }
  }

  const fmtNum = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Bulk Enrichment</h1>
      <p className="text-sm text-gray-500 -mt-3">
        Meta-only intelligence across the top Shopify stores. Run a batch below — this tab drives
        the job (keep it open until it finishes).
      </p>

      {/* Run panel */}
      <Card title="Run a Batch (Meta only)">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Number to enrich</div>
            <input
              type="number"
              min={1}
              max={20000}
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(20000, Number(e.target.value) || 1)))}
              disabled={running}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={runBatch}
            disabled={running}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {running ? 'Running…' : '▶ Run'}
          </button>
          <div className="flex gap-1">
            {[1000, 5000, 10000].map((n) => (
              <button
                key={n}
                onClick={() => setBatchSize(n)}
                disabled={running}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            ~${(batchSize * COST_PER_DOMAIN).toFixed(0)} est · auto-chains in 250s · concurrency 3 · skips anything enriched in 30d
          </span>
        </div>
        {(running || prog.processed > 0) && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${prog.total ? (prog.processed / prog.total) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-gray-600">
              {prog.processed}/{prog.total} checked · <span className="font-semibold text-green-600">{prog.withAds} with active ads</span> · {prog.ok - prog.withAds} no ads · {prog.failed} failed
              {running ? ' · keep this tab open' : ' · done'}
            </div>
            {prog.failed > 0 && prog.lastError && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span className="font-semibold">Last error:</span> {prog.lastError}
                {/^Apify auth\/quota/i.test(prog.lastError) && (
                  <span className="block mt-1 text-red-600">
                    Every domain is failing on Apify — this is almost always exhausted credits or an
                    invalid token. Check your Apify console billing/usage, then retry.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-400">
          Start with a small batch (e.g. 25) to validate cost and quality before scaling.
        </p>
      </Card>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : !s ? (
        <Card><p className="text-sm text-gray-400">Could not load stats.</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {([
              ['Total Shopify Domains', fmtNum(s.total_domains), null],
              ['Checked', fmtNum(s.enriched), 'domains scanned for ads'],
              [
                'With Active Ads',
                fmtNum(s.with_ads ?? 0),
                s.enriched ? `${Math.round(((s.with_ads ?? 0) / s.enriched) * 100)}% of checked · the rest run no ads` : null,
              ],
              ['Remaining', fmtNum(s.remaining), 'not yet scanned'],
              ['Estimated Cost', `$${Number(s.estimated_cost ?? 0).toFixed(2)}`, null],
              ['Last Run', s.last_run ? new Date(s.last_run).toLocaleString() : '—', null],
            ] as [string, string, string | null][]).map(([label, val, sub], i) => (
              <Card key={label}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-2xl font-bold ${i === 2 ? 'text-green-600' : 'text-gray-900'}`}>{val}</div>
                {sub && <div className="text-[11px] text-gray-400 mt-1 leading-tight">{sub}</div>}
              </Card>
            ))}
          </div>
          <Card title="Dataset Quality">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{fmtNum(s.avg_active_ads)}</div>
                <div className="text-xs text-gray-500">Avg ads · advertisers only</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{s.avg_landing_pages ?? '—'}</div>
                <div className="text-xs text-gray-500">Avg landing pages</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{s.pct_with_ads ?? '—'}%</div>
                <div className="text-xs text-gray-500">Running Meta ads</div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>('movers');
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [lens, setLens] = useState('measurement');

  // Brief + outreach angle regenerate instantly from the selected lens, with
  // no re-fetch (all data is already loaded).
  const briefInput = result ? briefInputFrom(result) : null;
  const lensObj = getLens(lens);
  const displayedBrief = briefInput
    ? buildResearchBrief(briefInput, lens)
    : (result?.research_brief ?? null);
  const lensAngle = briefInput ? lensObj.angle(briefInput) : result?.recommended_angle;
  const lensHook = briefInput ? lensObj.hook(briefInput) : result?.outbound_hook;

  // Deep-link: /?domain=ridge.com auto-runs (used by the Chrome extension's
  // "Open Full Report").
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('domain');
    if (d) runAnalyze(d.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Growth Rank — where this company sits in the enriched dataset.
  const [rankInfo, setRankInfo] = useState<{
    rank: number | null;
    total: number;
    percentile_top: number | null;
    primary_category?: string | null;
    category_rank?: number | null;
    category_total?: number | null;
    category_percentile_top?: number | null;
    channels?: {
      channel: string;
      ads: number;
      overall_label: string;
      category_label: string;
      overall_percentile_top: number | null;
    }[];
  } | null>(null);
  const metaAdsForRank = result?.meta_ads?.active_ads_count;
  useEffect(() => {
    if (metaAdsForRank == null || !result?.domain) {
      setRankInfo(null);
      return;
    }
    let cancelled = false;
    fetch('/api/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: result.domain, active_meta_ads: metaAdsForRank }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setRankInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [result?.domain, metaAdsForRank]);

  async function saveCompany(list_name: string) {
    if (!result) return;
    setSaveOpen(false);
    try {
      await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: result.domain,
          brand_name: result.meta_ads?.advertiser_name ?? null,
          list_name,
        }),
      });
      setSavedTo(list_name);
      setTimeout(() => setSavedTo(null), 2500);
    } catch {
      /* noop */
    }
  }

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || loading) return;
    await runAnalyze(domain.trim());
  }

  async function runAnalyze(q: string) {
    if (loading) return;
    setView('search');
    setDomain(q);
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
    const text = displayedBrief || result?.growth_prompt;
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
    <div className="dark-app min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-gray-900 text-gray-300 px-4 py-6">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="h-7 w-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold">
            ⚡
          </div>
          <span className="font-semibold text-white">Growth Signals</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.label}
              onClick={() => setView(item.view)}
              className={`block w-full text-left rounded-lg px-3 py-2 text-sm ${
                view === item.view ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
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
          {view === 'watchlist' && <WatchlistView onSelect={runAnalyze} />}
          {view === 'movers' && <TopMoversView onSelect={runAnalyze} />}
          {view === 'bulk' && <BulkView />}
          {view === 'import' && <ImportView />}
          {view === 'search' && (
          <>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 mb-6">
              {error}
            </div>
          )}

          {loading && !result && <LoadingChart />}

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
                      {enriching ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          Refreshing in background…
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Updated {result.cache_age_days != null ? relativeTime(new Date(Date.now() - result.cache_age_days * 86_400_000).toISOString()) : 'just now'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{result.domain}</span>
                      {(result.primary_category || cstr(result.company, 'categories')) && (
                        <span className="text-gray-400">· {result.primary_category || cstr(result.company, 'categories')}</span>
                      )}
                      {cstr(result.company, 'platform') && (
                        <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                          {cstr(result.company, 'platform')}
                        </span>
                      )}
                    </div>
                    {rankInfo?.rank && (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-white">
                        <span className="text-sm font-bold">⚡ Growth Rank #{rankInfo.rank.toLocaleString()}</span>
                        {rankInfo.percentile_top != null && (
                          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">Top {rankInfo.percentile_top}%</span>
                        )}
                        {rankInfo.category_rank != null && rankInfo.primary_category && (
                          <span className="text-[11px] text-indigo-100">#{rankInfo.category_rank} in {rankInfo.primary_category}</span>
                        )}
                      </div>
                    )}
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
                  <div className="relative">
                    <button
                      onClick={() => setSaveOpen((s) => !s)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {savedTo ? `✓ Saved to ${savedTo}` : '☆ Save Company'}
                    </button>
                    {saveOpen && (
                      <div className="absolute right-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-20 py-1">
                        {WATCHLISTS.map((l) => (
                          <button
                            key={l}
                            onClick={() => saveCompany(l)}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Add to {l}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                <StatCard label="Growth Rank">
                  {!hasAnalysis ? (
                    <Skeleton className="h-9 w-16" />
                  ) : rankInfo?.rank ? (
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">#{rankInfo.rank}</span>
                        {rankInfo.percentile_top != null && (
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            Top {rankInfo.percentile_top}%
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Score {gScore} · of {rankInfo.total.toLocaleString()} tracked
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-3xl font-bold ${scoreColor(gScore)}`}>{gScore}</span>
                      <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        {scoreLabel(gScore)}
                      </span>
                    </div>
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

              {/* Category & Channel Benchmarks */}
              {rankInfo && (rankInfo.category_rank != null || (rankInfo.channels?.some((c) => c.ads > 0))) && (
                <Card title="Benchmarks">
                  <div className="grid gap-5 sm:grid-cols-2">
                    {/* Ranks */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Overall Growth Rank</span>
                        <span className="font-semibold text-gray-900">
                          #{rankInfo.rank} of {rankInfo.total.toLocaleString()}
                          {rankInfo.percentile_top != null && (
                            <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">Top {rankInfo.percentile_top}%</span>
                          )}
                        </span>
                      </div>
                      {rankInfo.category_rank != null && rankInfo.primary_category && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">{rankInfo.primary_category} Rank</span>
                          <span className="font-semibold text-gray-900">
                            #{rankInfo.category_rank} of {rankInfo.category_total?.toLocaleString()}
                            {rankInfo.category_percentile_top != null && (
                              <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">Top {rankInfo.category_percentile_top}%</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Channels */}
                    <div className="space-y-2">
                      {(rankInfo.channels ?? []).map((c) => (
                        <div key={c.channel} className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">{c.channel}</span>
                          <span className="text-right">
                            <span className="font-semibold text-gray-900">{c.ads} ads</span>
                            <span className={`ml-2 text-[11px] font-semibold ${c.overall_label.startsWith('Top') ? 'text-green-600' : 'text-gray-400'}`}>
                              {c.overall_label}{rankInfo.primary_category && c.ads > 0 ? ` · ${c.category_label} in ${rankInfo.primary_category}` : ''}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* Paid Media Quality — real creative vs. catalog/DPA volume */}
              {result.paid_media_quality && result.paid_media_quality.real_creative_score != null && (() => {
                const q = result.paid_media_quality!;
                const dpaPct = Math.round((q.dpa_share ?? 0) * 100);
                const callout =
                  dpaPct >= 50
                    ? 'High ad count appears primarily catalog / DPA-driven, so paid media intensity is adjusted downward to reflect real creative output.'
                    : q.real_creative_score >= 55
                      ? 'Ad activity appears driven by unique campaign creative rather than product-feed ads — a strong, active testing motion.'
                      : 'A mix of campaign creative and catalog ads, with moderate creative testing.';
                const scoreTone = q.real_creative_score >= 55 ? 'text-green-600' : q.real_creative_score >= 35 ? 'text-yellow-600' : 'text-gray-500';
                return (
                  <Card title="Paid Media Quality">
                    <div className="flex flex-wrap items-center gap-6">
                      <div className="min-w-[140px]">
                        <div className={`text-4xl font-bold ${scoreTone}`}>{q.real_creative_score}</div>
                        <div className="text-xs text-gray-500">Real Creative Score · {creativeLabel(q.real_creative_score)}</div>
                      </div>
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 min-w-[260px]">
                        <QStat label="Unique Angles" value={q.campaign_angle_count} />
                        <QStat label="Unique Creatives" value={q.unique_creative_count} />
                        <QStat label="Offer Diversity" value={q.offer_diversity} />
                        <QStat label="LP Diversity" value={q.landing_page_diversity} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>DPA / Catalog Share</span>
                        <span className={`font-semibold ${dpaPct >= 50 ? 'text-red-500' : dpaPct >= 25 ? 'text-yellow-600' : 'text-green-600'}`}>{dpaPct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full ${dpaPct >= 50 ? 'bg-red-400' : dpaPct >= 25 ? 'bg-yellow-400' : 'bg-green-400'}`}
                          style={{ width: `${Math.max(2, dpaPct)}%` }}
                        />
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-600 leading-relaxed">{callout}</p>
                  </Card>
                );
              })()}

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
                  {displayedBrief ? (
                    <Card
                      title="✦ Research Brief"
                      action={
                        <div className="flex items-center gap-2">
                          <select
                            value={lens}
                            onChange={(e) => setLens(e.target.value)}
                            className="text-xs rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            title="Tailor the brief to what you sell"
                          >
                            {LENSES.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={copyBrief}
                            className={`text-xs rounded-md px-3 py-1 font-medium ${
                              copied
                                ? 'bg-green-100 text-green-700'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                          >
                            {copied ? '✓ Copied' : '⧉ Copy'}
                          </button>
                        </div>
                      }
                    >
                      <ResearchBriefBody text={displayedBrief} />
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
                          <div className="text-lg font-semibold text-gray-900">
                            {diversity(
                              Math.max(themes.length, result.meta_ads?.unique_landing_pages.length ?? 0)
                            )}
                          </div>
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
                        <dd className="text-gray-900 font-medium">
                          {result.revenue_range ?? formatMoney(sales)}
                        </dd>
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
                        <div className="text-gray-900 font-medium">
                          {lensAngle ?? result.recommended_angle}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Outbound Hook</div>
                        <div className="text-gray-700">{lensHook ?? result.outbound_hook}</div>
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
          </>
          )}
        </div>
      </main>
    </div>
  );
}
