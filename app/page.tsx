'use client';

import { useState, useEffect, useRef } from 'react';
import {
  BoltIcon,
  TrendUpIcon,
  SearchIcon,
  UploadIcon,
  StarIcon,
  BuildingIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  ExternalLinkIcon,
  InfoIcon,
  CheckIcon,
  SparkleIcon,
  CopyIcon,
  BarsIcon,
  MetaIcon,
  GoogleIcon,
  LinkedInIcon,
  HomeIcon,
  PlusSquareIcon,
  SettingsIcon,
  XIcon,
} from '@/app/components/icons';
import CommandHome from '@/app/components/CommandHome';
import MarketingHome from '@/app/components/marketing/MarketingHome';
import { useAuth } from '@/app/components/AuthProvider';
import { useClerk } from '@clerk/nextjs';
import TamListBuilder from '@/app/components/TamListBuilder';
import EmptyState from '@/app/components/EmptyState';
import { buildResearchBrief, type ResearchBriefInput } from '@/lib/researchBrief';
import { LENSES, getLens } from '@/lib/lenses';
import type { Momentum } from '@/lib/intelligence';
import { estimateMonthlySpend, type SpendEstimate } from '@/lib/adSpend';
import Skeleton from '@/app/components/Skeleton';
import MetricCard from '@/app/components/MetricCard';
import SpendEstimateBadge from '@/app/components/SpendEstimateBadge';
import GrowthOverTime, { type SnapshotRow } from '@/app/components/GrowthOverTime';
import TopMoversView from '@/app/components/TopMoversView';
import MyAccountsView from '@/app/components/MyAccountsView';
import AlertsView from '@/app/components/AlertsView';
import GrowthSignalsGrid from '@/app/components/GrowthSignalsGrid';
import { buildSignalCategories } from '@/lib/signals';
import { PERSONAS, buildPersonaReason, buildPersonaTakeaways } from '@/lib/persona';
import { usePersona } from '@/app/components/usePersona';
import type { ReasonInputs } from '@/lib/reason';

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

interface HiringSignalsBlock {
  ats_provider: string | null;
  open_roles: number | null;
  growth_roles: number | null;
  ops_roles: number | null;
  jobs_checked_at: string | null;
}

interface AnalysisResult {
  hiring?: HiringSignalsBlock | null;
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
  history?: SnapshotRow[] | null;
  spend_estimate?: SpendEstimate | null;
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
const MOMENTUM_DOT: Record<string, string> = {
  Dormant: 'bg-gray-400',
  Emerging: 'bg-yellow-400',
  Scaling: 'bg-emerald-400',
  Accelerating: 'bg-green-500',
  Exploding: 'bg-green-500',
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
function momentumSub(m: string): string {
  if (m === 'Exploding' || m === 'Accelerating') return 'Strong upward trajectory';
  if (m === 'Scaling') return 'Consistent upward trend';
  if (m === 'Emerging') return 'Early growth signals';
  return 'Little recent activity';
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
    category: result.primary_category ?? cstr(result.company, 'categories'),
    location: cstr(result.company, 'company_location'),
    revenueRange: result.revenue_range ?? 'Unknown',
    revenueConfidence: result.revenue_confidence ?? 'Low',
    momentum: (result.growth_momentum ?? 'Emerging') as Momentum,
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

function Card({ title, action, children, className = '' }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
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

// Company logo tile — favicon via Google s2 with an initials fallback. Kept
// deliberately light (near-white) per the report header design.
function LogoTile({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return (
    <div
      className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/10"
      style={{ background: '#f4f5f7' }}
    >
      {err ? (
        <span className="text-xl font-bold uppercase text-gray-600" style={{ color: '#4b5563' }}>
          {name.slice(0, 2)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(clean)}&sz=128`}
          alt={`${name} logo`}
          width={44}
          height={44}
          referrerPolicy="no-referrer"
          onError={() => setErr(true)}
        />
      )}
    </div>
  );
}

// Key takeaways for the Growth Narrative card — derived strictly from real
// signal data; each line only renders when its source field exists.
function keyTakeaways(r: AnalysisResult): string[] {
  const out: string[] = [];
  const adTrend = r.trends?.active_meta_ads?.[1] ?? r.trends?.active_meta_ads?.[0];
  if (adTrend && adTrend.change_pct != null && adTrend.previous != null) {
    out.push(
      `Active Meta ads ${adTrend.change_pct >= 0 ? 'up' : 'down'} ${Math.abs(adTrend.change_pct)}% (${adTrend.previous} → ${adTrend.current}) over ${adTrend.window_days} days.`
    );
  }
  const q = r.paid_media_quality;
  if (q && q.real_creative_score != null) {
    out.push(
      `Real creative score of ${q.real_creative_score} (${creativeLabel(q.real_creative_score)}) across ${q.unique_creative_count} unique creatives.`
    );
  }
  if (q && q.campaign_angle_count > 0) {
    out.push(`${q.campaign_angle_count} distinct campaign angles in active testing.`);
  }
  if (r.growth_momentum) {
    out.push(`Growth momentum classified as ${r.growth_momentum}.`);
  }
  return out.slice(0, 4);
}

// Render inline **bold** segments within a line.
function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
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
              <span>{inlineBold(t.slice(2))}</span>
            </div>
          );
        return <p key={i}>{inlineBold(t)}</p>;
      })}
    </div>
  );
}

const NAV: { label: string; view: View; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { label: 'Home', view: 'home', icon: HomeIcon },
  { label: 'Build TAM List', view: 'build', icon: PlusSquareIcon },
  { label: 'My Accounts', view: 'accounts', icon: BuildingIcon },
  { label: 'Top Movers', view: 'movers', icon: TrendUpIcon },
  { label: 'Search Accounts', view: 'search', icon: SearchIcon },
  { label: 'Watchlist', view: 'watchlist', icon: StarIcon },
  { label: 'Imports', view: 'import', icon: UploadIcon },
  { label: 'Settings', view: 'settings', icon: SettingsIcon },
];

type View =
  | 'home'
  | 'build'
  | 'accounts'
  | 'search'
  | 'watchlist'
  | 'movers'
  | 'bulk'
  | 'import'
  | 'alerts'
  | 'settings';

interface WatchlistItem {
  id: number;
  domain: string;
  brand_name: string | null;
  list_name: string;
  latest?: {
    growth_momentum?: string | null;
    growth_score?: number | null;
    active_meta_ads?: number | null;
    revenue_range?: string | null;
  } | null;
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
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/watchlist', { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch (e) {
      setItems([]);
      setError(
        e instanceof Error && e.name === 'TimeoutError'
          ? 'Loading your accounts took too long.'
          : 'Couldn’t load your accounts.'
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (domain: string, list_name: string) => {
    try {
      await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, list_name }),
      });
    } catch {
      /* item stays in the list; reload below reflects server truth */
    }
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Accounts</h1>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={load}
            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {WATCHLISTS.map((list) => {
            const inList = items.filter((i) => i.list_name === list);
            return (
              <Card key={list} title={`${list} (${inList.length})`}>
                {inList.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<StarIcon width={16} height={16} />}
                    title="No companies yet"
                    body="Find a company in Search or Top Movers and save it here."
                  />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {inList.map((it) => {
                      const mom = it.latest?.growth_momentum;
                      const { arrow, color } = movementArrow(mom);
                      return (
                        <li key={it.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                          <button
                            onClick={() => onSelect(it.domain)}
                            className="flex-1 min-w-0 text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${color}`}>{arrow}</span>
                              <span className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 truncate">
                                {it.brand_name || it.domain}
                              </span>
                              {mom && (
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${MOMENTUM_DOT[mom] ?? 'bg-gray-400'}`}
                                  title={mom}
                                />
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5 pl-4">
                              {it.domain}
                              {it.latest?.active_meta_ads != null && it.latest.active_meta_ads > 0
                                ? ` · ${it.latest.active_meta_ads} Meta ads`
                                : ''}
                              {it.latest?.revenue_range ? ` · ${it.latest.revenue_range}` : ''}
                            </div>
                          </button>
                          <button
                            onClick={() => remove(it.domain, list)}
                            className="shrink-0 text-gray-300 hover:text-red-500 px-1"
                            title="Remove"
                            aria-label={`Remove ${it.brand_name || it.domain}`}
                          >
                            <XIcon width={12} height={12} />
                          </button>
                        </li>
                      );
                    })}
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

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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

function ImportView({ onOpenBulk }: { onOpenBulk: () => void }) {
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
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Imports</h1>
        <button
          onClick={onOpenBulk}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          Open Bulk Enrichment →
        </button>
      </div>
      <div>
        <p className="text-sm text-gray-500 -mt-4">
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
              Done — {fmt(prog.upserted)} companies imported.
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
            {bf.processed > 0 && ` · ${bf.updated.toLocaleString()} updated / ${bf.processed.toLocaleString()} scanned${bf.done ? ' · done' : '…'}`}
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
      const r = await fetch('/api/bulk-stats', { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

    let job_id: unknown = null;
    try {
      const jobRes = await fetch('/api/bulk-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!jobRes.ok) throw new Error(`HTTP ${jobRes.status}`);
      ({ job_id } = await jobRes.json());
    } catch (e) {
      setProg((p) => ({ ...p, lastError: `Could not start the job: ${e instanceof Error ? e.message : String(e)}`, failed: 1 }));
      setRunning(false);
      return;
    }
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
        if (!tRes.ok) {
          lastError = `Target fetch failed (HTTP ${tRes.status})`;
          setProg({ total: target, processed, ok, withAds, failed, lastError });
          break;
        }
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
            {running ? 'Running…' : 'Run'}
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
        <Card>
          <EmptyState
            compact
            icon={<InfoIcon width={16} height={16} />}
            title="Couldn’t load enrichment stats"
            body="The stats endpoint didn’t respond. Batches can still run — or retry loading."
            action={
              <button
                onClick={() => {
                  setLoading(true);
                  loadStats();
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                Retry
              </button>
            }
          />
        </Card>
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

// Initials for the user avatar, derived from the email local part
// (e.g. "zach@…" → "ZA", "growth.team@…" → "GT").
function emailInitials(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0];
  if (!local) return '?';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// Minimal full-screen loader shown while the Supabase session restores —
// avoids flashing the login screen for already-signed-in users.
function AuthLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: '#0a0b10' }}>
      <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/50">
        <BoltIcon width={22} height={22} />
      </div>
    </div>
  );
}

// Opens Clerk's hosted user-profile modal. Rendered only when authEnabled —
// useClerk() may only be called under ClerkProvider.
function ManageAccountButton() {
  const clerk = useClerk();
  return (
    <button
      onClick={() => clerk.openUserProfile()}
      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      Manage account
    </button>
  );
}

// Settings — minimal real account surface (email, manage account, sign out)
// plus the placeholder copy for workspace settings.
function SettingsView() {
  const { user, signOut, authEnabled } = useAuth();
  const [persona, setPersona] = usePersona();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <Card title="Account">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300 ring-1 ring-indigo-500/30">
              {emailInitials(user?.email)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-900">{user?.email ?? '—'}</div>
              <div className="text-[11px] text-gray-500">
                {authEnabled ? 'Signed in with Clerk' : 'Authentication not configured'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            {authEnabled ? (
              <>
                <ManageAccountButton />
                <button
                  onClick={() => signOut()}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/20"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-500">
                Authentication not configured — the app is running without login.
              </span>
            )}
          </div>
        </div>
      </Card>
      <Card title="Workspace">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">What do you sell?</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Tambourine reframes account intelligence through your lens — same signals,
              conclusions written for your pitch.
            </p>
          </div>
          <div role="radiogroup" aria-label="What do you sell?" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERSONAS.map((p) => {
              const selected = persona === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPersona(p.id)}
                  className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    selected
                      ? 'border-indigo-500 bg-indigo-500/[0.06] ring-2 ring-indigo-500'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{p.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Home() {
  const { user, loading: authLoading, authEnabled } = useAuth();
  if (authLoading) return <AuthLoader />;
  // When auth env vars aren't configured, run the app without a login wall
  // rather than dead-ending the whole product.
  if (authEnabled && !user) return <MarketingHome />;
  return <AppShell />;
}

function AppShell() {
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>('home');
  const [tamQuery, setTamQuery] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [lens, setLens] = useState('measurement');
  const [wlCount, setWlCount] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Snapshot history has its OWN state slot, fetched from /api/company on
  // every report load and never inherited from list-row state. Phase-2
  // enrichment must never shrink or clear it — see runAnalyze.
  const [history, setHistory] = useState<SnapshotRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshFailed, setHistoryRefreshFailed] = useState(false);
  // Monotonic sequence: a newer runAnalyze invalidates any in-flight history
  // writes from an older one (fast domain switches, slow enrichment).
  const historySeq = useRef(0);

  // Re-fetch history once after enrichment settles; only replace the current
  // array when the fresh one is at least as long (enrichment may have written
  // today's snapshot — but a partial/failed read must not shrink the chart).
  async function refreshHistory(q: string, seq: number) {
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: q }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const fresh: SnapshotRow[] = Array.isArray(data.history) ? data.history : [];
      if (seq !== historySeq.current) return;
      setHistory((curr) => (fresh.length >= (curr?.length ?? 0) ? fresh : curr));
    } catch {
      if (seq === historySeq.current) setHistoryRefreshFailed(true);
    }
  }

  // Sidebar Watchlist badge — real count from the watchlist API.
  useEffect(() => {
    fetch('/api/watchlist', { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWlCount(d && Array.isArray(d.items) ? d.items.length : null))
      .catch(() => setWlCount(null));
  }, []);

  // Cmd/Ctrl+K focuses the global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      signal: AbortSignal.timeout(15_000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Rank is an optional embellishment — on failure the report simply
        // renders without rank badges instead of blanking.
        if (!cancelled && d && typeof d === 'object') setRankInfo(d);
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
      const r = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: result.domain,
          brand_name: result.meta_ads?.advertiser_name ?? null,
          list_name,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSavedTo(list_name);
      setTimeout(() => setSavedTo(null), 2500);
    } catch {
      setError('Couldn’t save to your watchlist — please try again.');
      setTimeout(() => setError(null), 3500);
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
    // Fresh history slot for this report load — never carried over from a
    // previous report or a list row.
    const seq = ++historySeq.current;
    setHistory(null);
    setHistoryLoading(true);
    setHistoryRefreshFailed(false);
    try {
      // Phase 1: instant company + cached analysis (+ trends).
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: q }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (seq === historySeq.current) setHistoryLoading(false);
        setError(
          res.status === 404
            ? `"${data.domain ?? q}" was not found in the database.`
            : data.error || 'Something went wrong.'
        );
        return;
      }
      if (seq === historySeq.current) {
        setHistory(Array.isArray(data.history) ? data.history : []);
        setHistoryLoading(false);
      }

      const base: AnalysisResult = {
        domain: data.domain,
        company: data.company,
        trends: data.trends ?? null,
        timeline: data.timeline ?? null,
        history: data.history ?? null,
        spend_estimate: data.spend_estimate ?? null,
        cached: Boolean(data.analysis),
        enriching: Boolean(data.needs_enrichment),
        cache_age_days: data.cache_age_days ?? null,
        hiring: data.hiring ?? null,
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
            // The enrichment response doesn't carry snapshot history or the
            // spend estimate — keep them from phase 1. History lives in its
            // own slot and is NEVER replaced from this response; instead we
            // re-fetch it once (enrichment may have written today's snapshot).
            setResult({
              ...fresh,
              history: fresh.history ?? base.history,
              spend_estimate: fresh.spend_estimate ?? base.spend_estimate,
              hiring: fresh.hiring ?? base.hiring,
              enriching: false,
            });
            await refreshHistory(q, seq);
          } else {
            // keep phase-1 view (chart included); just stop the enriching
            // indicator and flag the inline refresh-failed note.
            setResult((r) => (r ? { ...r, enriching: false } : r));
            if (seq === historySeq.current) setHistoryRefreshFailed(true);
          }
        } catch {
          setResult((r) => (r ? { ...r, enriching: false } : r));
          if (seq === historySeq.current) setHistoryRefreshFailed(true);
        }
      }
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'TimeoutError'
          ? 'The analysis took too long to respond.'
          : 'Network error — please try again.'
      );
      setLoading(false);
      if (seq === historySeq.current) setHistoryLoading(false);
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
  // Server-provided estimate when available; otherwise recompute client-side
  // from the same pure heuristic (e.g. after a fresh enrichment response).
  const spendEst: SpendEstimate | null =
    result?.spend_estimate ??
    (result
      ? estimateMonthlySpend({
          metaAds: metaCount,
          googleAds: adCount(result, 'Google'),
          linkedinAds: adCount(result, 'LinkedIn'),
          qualityAdjustedAds: result.paid_media_quality?.quality_adjusted_ads ?? null,
          landingPages: result.meta_ads?.unique_landing_pages?.length ?? null,
          creativeDiversityScore: result.paid_media_quality?.creative_diversity_score ?? null,
          revenueRange: result.revenue_range ?? null,
          paidIntensity: result.paid_media_signal ?? null,
        })
      : null);

  // Growth Signals — the 6-category composite view. Fed from the same signal
  // data the report already has; renders even for zero-ad accounts.
  const signalCategories = result
    ? buildSignalCategories({
        active_meta_ads: metaCount,
        google_ads: adCount(result, 'Google'),
        linkedin_ads: adCount(result, 'LinkedIn'),
        quality_adjusted_ads: result.paid_media_quality?.quality_adjusted_ads ?? null,
        real_creative_score: result.paid_media_quality?.real_creative_score ?? null,
        creative_diversity_score: result.paid_media_quality?.creative_diversity_score ?? null,
        dpa_share: result.paid_media_quality?.dpa_share ?? null,
        ad_activity_level: result.paid_media_signal ?? result.meta_ads?.ad_activity_level ?? null,
        landing_pages: result.meta_ads?.unique_landing_pages ?? [],
        spend_label: spendEst?.label ?? null,
        open_roles: result.hiring?.open_roles ?? null,
        growth_roles: result.hiring?.growth_roles ?? null,
        ops_roles: result.hiring?.ops_roles ?? null,
        jobs_checked_at: result.hiring?.jobs_checked_at ?? null,
        ats_provider: result.hiring?.ats_provider ?? null,
      })
    : [];
  const liveSignals = signalCategories.filter((c) => c.status === 'live').length;
  const soonSignals = signalCategories.length - liveSignals;
  const scrollToSignals = () =>
    document.getElementById('growth-signals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Persona lens for the Growth Narrative — the same workspace-wide setting
  // as Settings → "What do you sell?": switching here persists and broadcasts
  // via usePersona(), so Settings and every open view stay in sync.
  const [persona, setPersona] = usePersona();

  // Growth Signals grid collapse — persisted per browser; default expanded.
  const [signalsCollapsed, setSignalsCollapsed] = useState(false);
  useEffect(() => {
    try {
      setSignalsCollapsed(localStorage.getItem('tam_signals_collapsed') === '1');
    } catch {
      /* default expanded */
    }
  }, []);
  const toggleSignals = () =>
    setSignalsCollapsed((c) => {
      try {
        localStorage.setItem('tam_signals_collapsed', c ? '0' : '1');
      } catch {
        /* noop */
      }
      return !c;
    });

  const reasonInputs: ReasonInputs | null = result
    ? {
        metaAds: metaCount,
        metaChangePct:
          result.trends?.active_meta_ads?.[1]?.change_pct ??
          result.trends?.active_meta_ads?.[0]?.change_pct ??
          null,
        realCreativeScore: result.paid_media_quality?.real_creative_score ?? null,
        creativeDiversityScore: result.paid_media_quality?.creative_diversity_score ?? null,
        dpaShare: result.paid_media_quality?.dpa_share ?? null,
        momentum: result.growth_momentum ?? null,
        growthScore: result.growth_score ?? null,
        spend: spendEst,
        landingPages: result.meta_ads?.unique_landing_pages?.length ?? null,
      }
    : null;
  const personaTakeaways = reasonInputs ? buildPersonaTakeaways(persona, reasonInputs) : [];

  return (
    <div className="dark-app min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-[215px] shrink-0 flex-col border-r border-gray-200 bg-gray-900 text-gray-300 px-3 py-5">
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-2.5 px-2 mb-7 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
            <BoltIcon width={16} height={16} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-white">Tambourine</span>
        </button>
        <nav className="space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.view || (item.view === 'import' && view === 'bulk');
            return (
              <button
                key={item.label}
                onClick={() => setView(item.view)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-indigo-500/25 font-semibold text-white ring-1 ring-inset ring-indigo-400/50'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <Icon width={15} height={15} className={active ? 'text-indigo-300' : 'text-gray-500'} />
                <span className="flex-1">{item.label}</span>
                {item.view === 'watchlist' && wlCount != null && wlCount > 0 && (
                  <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 ring-1 ring-white/10">
                    {wlCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="relative mt-auto border-t border-gray-200 pt-3">
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-full left-2 right-2 z-30 mb-2 rounded-xl border border-white/10 bg-gray-900 py-1.5 shadow-2xl shadow-black/60">
                <div className="border-b border-white/5 px-3 pb-2 pt-1">
                  <div className="truncate text-xs font-medium text-gray-200">{user?.email}</div>
                  <div className="text-[10px] text-gray-500">Tambourine Workspace</div>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    signOut();
                  }}
                  className="mt-1 block w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-gray-800"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-bold text-indigo-300 ring-1 ring-indigo-500/30">
              {emailInitials(user?.email)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-200">
                {user?.email ?? 'Signed in'}
              </span>
              <span className="block truncate text-[11px] text-gray-500">Workspace</span>
            </span>
            <ChevronUpDownIcon width={13} height={13} className="text-gray-500" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        {view === 'home' ? (
          <div className="flex items-center justify-end gap-3 px-6 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-bold text-indigo-300 ring-1 ring-indigo-500/30">
              {emailInitials(user?.email)}
            </span>
          </div>
        ) : (
          <div className="border-b border-gray-200 bg-white px-6 py-3 sticky top-0 z-10">
            <form onSubmit={analyze}>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <SearchIcon width={15} height={15} />
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="Search any company or domain..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 pl-10 pr-16 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
                  ⌘K
                </span>
              </div>
            </form>
          </div>
        )}

        <div
          className={
            view === 'home'
              ? 'px-4 py-6 sm:px-6'
              : view === 'movers'
                ? 'mx-auto max-w-[1200px] px-4 py-6 sm:px-6'
                : 'mx-auto max-w-6xl px-4 py-6 sm:px-6'
          }
        >
          {view === 'home' && (
            <CommandHome
              onBuild={(q) => {
                setTamQuery(q);
                setView('build');
              }}
              onSelectDomain={runAnalyze}
              onOpenMovers={() => setView('movers')}
              onOpenWatchlist={() => setView('watchlist')}
              onOpenMyAccounts={() => setView('accounts')}
            />
          )}
          {view === 'build' && <TamListBuilder initialQuery={tamQuery} onOpenBrief={runAnalyze} />}
          {view === 'accounts' && <MyAccountsView onOpenReport={runAnalyze} />}
          {view === 'alerts' && <AlertsView onOpenMyAccounts={() => setView('accounts')} />}
          {view === 'settings' && <SettingsView />}
          {view === 'watchlist' && <WatchlistView onSelect={runAnalyze} />}
          {view === 'movers' && <TopMoversView onSelect={runAnalyze} />}
          {view === 'bulk' && <BulkView />}
          {view === 'import' && <ImportView onOpenBulk={() => setView('bulk')} />}
          {view === 'search' && (
          <>
          {error && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              <span>{error}</span>
              {domain.trim() && (
                <button
                  onClick={() => runAnalyze(domain.trim())}
                  className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {loading && !result && <LoadingChart />}

          {!loading && !result && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white mb-5">
                <BoltIcon width={22} height={22} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Analyze any company</h2>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                Type a domain above to see its Growth Rank, momentum, modeled revenue, and the
                live growth signals behind them — in seconds.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {['ridge.com', 'gymshark.com', 'drinkag1.com'].map((d) => (
                  <button
                    key={d}
                    onClick={() => runAnalyze(d)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Brand header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <LogoTile domain={result.domain} name={brandName} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-gray-900 capitalize">{brandName}</h1>
                      {enriching ? (
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          Refreshing in background…
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Updated {result.cache_age_days != null ? relativeTime(new Date(Date.now() - result.cache_age_days * 86_400_000).toISOString()) : 'just now'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <a
                        href={`https://${result.domain.replace(/^https?:\/\//, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-indigo-400 hover:underline"
                      >
                        {result.domain}
                        <ExternalLinkIcon width={12} height={12} />
                      </a>
                      {(result.primary_category || cstr(result.company, 'categories')) && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="text-[13px]">
                            {result.primary_category || cstr(result.company, 'categories')?.replace(/^\//, '').split('/')[0]}
                          </span>
                        </>
                      )}
                      {cstr(result.company, 'platform') && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                          {cstr(result.company, 'platform')}
                        </span>
                      )}
                    </div>
                    {rankInfo?.rank && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-[12px] font-bold text-white">
                          <BoltIcon width={12} height={12} />
                          Growth Rank #{rankInfo.rank.toLocaleString()}
                        </span>
                        {rankInfo.percentile_top != null && (
                          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-gray-300 ring-1 ring-white/10">
                            Top {rankInfo.percentile_top}%
                          </span>
                        )}
                        {rankInfo.category_rank != null && rankInfo.primary_category && (
                          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-gray-300 ring-1 ring-white/10">
                            #{rankInfo.category_rank} in {rankInfo.primary_category}
                          </span>
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
                    className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Visit Website
                  </a>
                  <div className="relative">
                    <button
                      onClick={() => setSaveOpen((s) => !s)}
                      className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {savedTo ? (
                        <span className="inline-flex items-center gap-1.5 text-green-700">
                          <CheckIcon width={13} height={13} />
                          Saved to {savedTo}
                        </span>
                      ) : (
                        'Save Company'
                      )}
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
                    className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium ${
                      copied ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {copied ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckIcon width={13} height={13} />
                        Copied
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <SparkleIcon width={13} height={13} />
                        Research Brief
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Persona verdict — the one-sentence answer for the active
                  seller lens, visible above the fold with score + momentum. */}
              {reasonInputs && (
                <div className="flex items-start gap-2.5 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.08] px-4 py-3">
                  <SparkleIcon width={14} height={14} className="mt-0.5 shrink-0 text-indigo-300" />
                  <p className="text-[14px] font-medium leading-snug text-gray-200">
                    {buildPersonaReason(persona, reasonInputs)}
                  </p>
                </div>
              )}

              {/* Metric row — score first, signals second */}
              <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:grid-cols-3 xl:grid-cols-5 divide-x divide-y divide-gray-100 xl:divide-y-0">
                <MetricCard
                  label="Growth Score"
                  icon={<BoltIcon width={11} height={11} className="text-indigo-400" />}
                  sub={
                    hasAnalysis && rankInfo?.rank
                      ? `Rank #${rankInfo.rank.toLocaleString()} of ${rankInfo.total.toLocaleString()} tracked`
                      : undefined
                  }
                  footer={
                    hasAnalysis && rankInfo?.percentile_top != null ? (
                      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[0.04]">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${Math.max(3, 100 - rankInfo.percentile_top)}%` }}
                        />
                      </div>
                    ) : undefined
                  }
                >
                  {!hasAnalysis ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold tabular-nums ${scoreColor(gScore)}`}>{gScore}</span>
                      {rankInfo?.percentile_top != null ? (
                        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          Top {rankInfo.percentile_top}%
                        </span>
                      ) : (
                        <span className="rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                          {scoreLabel(gScore)}
                        </span>
                      )}
                    </div>
                  )}
                </MetricCard>
                <MetricCard
                  label="Growth Momentum"
                  icon={<TrendUpIcon width={11} height={11} className="text-green-400" />}
                  sub={result.growth_momentum ? momentumSub(result.growth_momentum) : undefined}
                >
                  {result.growth_momentum ? (
                    <div className={`inline-flex items-center gap-1.5 text-xl font-semibold ${momentumColor(result.growth_momentum)}`}>
                      <span className={`h-2 w-2 rounded-full ${MOMENTUM_DOT[result.growth_momentum] ?? 'bg-gray-400'}`} />
                      {result.growth_momentum}
                    </div>
                  ) : (
                    <Skeleton className="h-7 w-24" />
                  )}
                </MetricCard>
                <MetricCard
                  label="Est. Revenue"
                  icon={<span className="text-[11px] font-bold text-emerald-400 leading-none">$</span>}
                  sub={
                    result.revenue_confidence ? (
                      <span
                        className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${confidenceBadge(result.revenue_confidence)}`}
                      >
                        {result.revenue_confidence} confidence
                      </span>
                    ) : undefined
                  }
                >
                  {result.revenue_range || sales > 0 ? (
                    <div className="text-xl font-semibold text-gray-900 tabular-nums">
                      {result.revenue_range ?? formatMoney(sales)}
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-gray-400">No data yet</div>
                  )}
                </MetricCard>
                <MetricCard
                  label="Growth Investment"
                  icon={<span className="text-[11px] font-bold text-amber-400 leading-none">$</span>}
                  sub={
                    spendEst ? (
                      <>
                        <span className="inline-flex items-center gap-1 capitalize text-gray-400">
                          {spendEst.confidence} confidence
                          <InfoIcon width={11} height={11} />
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-tight text-gray-500">
                          Estimated annual investment in growth, modeled from acquisition activity,
                          category, and revenue signals.
                        </span>
                      </>
                    ) : undefined
                  }
                >
                  {hasAnalysis || result.meta_ads ? (
                    spendEst ? (
                      <div className="text-xl font-semibold text-gray-900 tabular-nums">{spendEst.label}</div>
                    ) : (
                      <SpendEstimateBadge estimate={spendEst} />
                    )
                  ) : (
                    <Skeleton className="h-7 w-24" />
                  )}
                </MetricCard>
                <button
                  type="button"
                  onClick={scrollToSignals}
                  className="min-w-0 text-left transition-colors hover:bg-gray-50"
                  title="Jump to Growth Signals"
                >
                  <MetricCard
                    label="Signals"
                    icon={<SparkleIcon width={11} height={11} className="text-violet-400" />}
                    sub="Growth signal categories"
                  >
                    <div className="text-xl font-semibold text-gray-900">
                      <span className="text-emerald-500">{liveSignals} live</span>
                      <span className="text-gray-400"> · {soonSignals} soon</span>
                    </div>
                  </MetricCard>
                </button>
              </div>

              {/* Growth Over Time — snapshot history chart. History comes from
                  its dedicated slot (fetched fresh from /api/company on every
                  report load), never from the enrichment response. */}
              <GrowthOverTime
                history={history}
                loading={historyLoading}
                refreshing={enriching}
                refreshFailed={historyRefreshFailed}
              />

              {/* Growth Signals — the composite categories behind the score */}
              <section id="growth-signals" className="scroll-mt-20">
                <button
                  type="button"
                  onClick={toggleSignals}
                  aria-expanded={!signalsCollapsed}
                  className="mb-3 flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      Growth Signals
                      <ChevronDownIcon
                        width={13}
                        height={13}
                        className={`text-gray-400 transition-transform ${signalsCollapsed ? '-rotate-90' : ''}`}
                      />
                    </h2>
                    <p className="mt-0.5 text-[12px] text-gray-500">
                      What&rsquo;s driving this score — new signal sources activate automatically as
                      they come online.
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-[11px] font-medium text-gray-400">
                    {signalsCollapsed ? `Show ${signalCategories.length} categories` : 'Hide'}
                  </span>
                </button>
                {!signalsCollapsed && <GrowthSignalsGrid categories={signalCategories} />}
              </section>


              {/* Bottom 3-column grid: Benchmarks · Paid Media Quality · Growth Narrative */}
              {(rankInfo?.rank != null || result.paid_media_quality || result.growth_narrative) && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
                  {/* Benchmarks */}
                  {rankInfo?.rank != null && (
                    <Card
                      title={
                        <span className="inline-flex items-center gap-1.5">
                          <BarsIcon width={13} height={13} className="text-indigo-400" />
                          Benchmarks
                        </span>
                      }
                    >
                      <div className="divide-y divide-gray-100">
                        <div className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
                          <span className="text-[13px] text-gray-500">Overall Growth Rank</span>
                          <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-900">
                            #{rankInfo.rank} of {rankInfo.total.toLocaleString()}
                            {rankInfo.percentile_top != null && (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                Top {rankInfo.percentile_top}%
                              </span>
                            )}
                          </span>
                        </div>
                        {rankInfo.category_rank != null && rankInfo.primary_category && (
                          <div className="flex items-center justify-between gap-2 py-2.5">
                            <span className="text-[13px] text-gray-500">{rankInfo.primary_category} Rank</span>
                            <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-900">
                              #{rankInfo.category_rank} of {rankInfo.category_total?.toLocaleString()}
                              {rankInfo.category_percentile_top != null && (
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  Top {rankInfo.category_percentile_top}%
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {(rankInfo.channels ?? []).map((c) => {
                          const Icon =
                            c.channel === 'Meta' ? MetaIcon : c.channel === 'Google' ? GoogleIcon : c.channel === 'LinkedIn' ? LinkedInIcon : BarsIcon;
                          return (
                            <div key={c.channel} className="flex items-center justify-between gap-2 py-2.5 last:pb-0">
                              <span className="inline-flex items-center gap-2 text-[13px] text-gray-500">
                                <Icon width={14} height={14} className="text-gray-400" />
                                {c.channel}
                              </span>
                              <span className="flex flex-wrap items-center justify-end gap-1.5 text-[13px] font-semibold text-gray-900">
                                {c.ads} ads
                                {c.ads > 0 ? (
                                  <>
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                      {c.overall_label}
                                    </span>
                                    {rankInfo.primary_category && (
                                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-gray-400 ring-1 ring-white/10">
                                        {c.category_label} in {rankInfo.primary_category}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[11px] font-medium text-gray-500">No data</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {/* Paid Media Quality */}
                  {result.paid_media_quality && result.paid_media_quality.real_creative_score != null && (() => {
                    const q = result.paid_media_quality!;
                    const dpaPct = Math.round((q.dpa_share ?? 0) * 100);
                    const callout =
                      dpaPct >= 50
                        ? 'High ad count appears primarily catalog / DPA-driven, so paid media intensity is adjusted downward to reflect real creative output.'
                        : q.real_creative_score >= 55
                          ? 'Ad activity appears driven by unique campaign creative rather than product-feed ads — a strong, active testing motion.'
                          : 'A mix of campaign creative and catalog ads, with moderate creative testing.';
                    return (
                      <Card
                        title={
                          <span className="inline-flex items-center gap-1.5">
                            <SparkleIcon width={13} height={13} className="text-indigo-400" />
                            Paid Media Quality
                          </span>
                        }
                      >
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="text-3xl font-bold text-indigo-400 tabular-nums">{q.real_creative_score}</div>
                            <div className="mt-0.5 text-[11px] leading-tight text-gray-500">
                              Real Creative Score
                              <span className="block font-semibold text-gray-400">{creativeLabel(q.real_creative_score)}</span>
                            </div>
                          </div>
                          <QStat label="Unique Angles" value={q.campaign_angle_count} />
                          <QStat label="Unique Creatives" value={q.unique_creative_count} />
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <QStat label="Offer Diversity" value={q.offer_diversity} />
                          <QStat label="LP Diversity" value={q.landing_page_diversity} />
                          <div>
                            <div className="text-xl font-bold text-gray-900 tabular-nums">{dpaPct}%</div>
                            <div className="text-[11px] text-gray-500 leading-tight">DPA / Catalog Share</div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full ${dpaPct >= 50 ? 'bg-red-400' : dpaPct >= 25 ? 'bg-yellow-400' : 'bg-green-400'}`}
                                style={{ width: `${Math.max(3, dpaPct)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 border-t border-gray-100 pt-3 text-[12px] leading-relaxed text-gray-500">{callout}</p>
                      </Card>
                    );
                  })()}

                  {/* Growth Narrative */}
                  {result.growth_narrative && (
                    <Card
                      className="min-w-0 overflow-hidden"
                      title={
                        <span className="inline-flex items-center gap-1.5">
                          <SparkleIcon width={13} height={13} className="text-indigo-400" />
                          Growth Narrative
                        </span>
                      }
                      action={
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Lens:
                          </span>
                          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[10px] font-medium">
                            {PERSONAS.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setPersona(p.id)}
                                title={p.blurb}
                                className={`rounded-md px-1.5 py-0.5 transition-colors ${
                                  persona === p.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                {p.id === '3pl' ? '3PL' : p.label}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={copyBrief}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            <CopyIcon width={11} height={11} />
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      }
                    >
                      <div className="rounded-xl bg-indigo-500/[0.07] p-4 ring-1 ring-indigo-500/20">
                        <span className="mb-2 inline-block rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300">
                          Summary
                        </span>
                        <p className="break-words text-[13px] leading-relaxed text-gray-800">{result.growth_narrative}</p>
                      </div>
                      {result.growth_momentum && (
                        <div className="mt-4">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Why now
                          </div>
                          <p className="text-[12px] leading-snug text-gray-700">
                            {momentumSub(result.growth_momentum)} — momentum is {result.growth_momentum.toLowerCase()}
                            {metaCount > 0 ? ` with ${metaCount} active Meta ads in market.` : '.'}
                          </p>
                        </div>
                      )}
                      {(personaTakeaways.length > 0 ? personaTakeaways : keyTakeaways(result)).length > 0 && (
                        <div className="mt-4">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Key takeaways
                          </div>
                          <ul className="space-y-1.5">
                            {(personaTakeaways.length > 0 ? personaTakeaways : keyTakeaways(result)).map((t, i) => (
                              <li key={i} className="flex items-start gap-2 text-[12px] leading-snug text-gray-700">
                                <CheckIcon width={13} height={13} className="mt-0.5 shrink-0 text-green-500" />
                                {t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(lensAngle ?? result.recommended_angle) && (
                        <div className="mt-4">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Suggested pitch angle
                          </div>
                          <p className="text-[12px] leading-snug text-gray-700">
                            {lensAngle ?? result.recommended_angle}
                          </p>
                        </div>
                      )}
                      <p className="mt-4 flex items-center gap-1 border-t border-gray-100 pt-3 text-[10px] text-gray-500">
                        Derived from live growth signals · directional, not financial advice
                        <InfoIcon width={10} height={10} />
                      </p>
                    </Card>
                  )}
                </div>
              )}

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
                  {/* Research Brief */}
                  {displayedBrief ? (
                    <Card
                      title={
                        <span className="inline-flex items-center gap-1.5">
                          <SparkleIcon width={13} height={13} className="text-indigo-400" />
                          Research Brief
                        </span>
                      }
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
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      }
                    >
                      <ResearchBriefBody text={displayedBrief} />
                    </Card>
                  ) : (
                    enriching && (
                      <Card
                        title={
                          <span className="inline-flex items-center gap-1.5">
                            <SparkleIcon width={13} height={13} className="text-indigo-400" />
                            Research Brief
                          </span>
                        }
                      >
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
                            {result.meta_ads.unique_landing_pages.length || result.paid_media_quality?.landing_page_diversity || 0}
                          </div>
                        </div>
                        {result.paid_media_quality ? (
                          <>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Unique Creatives</div>
                              <div className="text-2xl font-bold text-gray-900">{result.paid_media_quality.unique_creative_count}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Campaign Angles</div>
                              <div className="text-2xl font-bold text-gray-900">{result.paid_media_quality.campaign_angle_count}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Creative Velocity</div>
                              <div className="text-lg font-semibold text-gray-900">{velocity(metaCount)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Campaign Diversity</div>
                              <div className="text-lg font-semibold text-gray-900">
                                {diversity(Math.max(themes.length, result.meta_ads?.unique_landing_pages.length ?? 0))}
                              </div>
                            </div>
                          </>
                        )}
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
                          <div key={i} className="creative-tile rounded-lg border border-gray-200 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt="ad creative"
                              referrerPolicy="no-referrer"
                              className="w-full h-32 object-cover bg-gray-100"
                              onError={(e) => {
                                // Facebook CDN creative URLs expire — drop the whole
                                // tile so we never show a broken/empty box.
                                const tile = (e.currentTarget as HTMLImageElement).closest('.creative-tile');
                                if (tile) (tile as HTMLElement).style.display = 'none';
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

                  {/* Sample Ad Copy (text) — shown when no creative images available */}
                  {result.meta_ads && result.meta_ads.sample_creatives.length === 0 && result.meta_ads.sample_ad_copy.length > 0 && (
                    <Card title="Sample Ad Copy">
                      <div className="space-y-2">
                        {result.meta_ads.sample_ad_copy.slice(0, 5).map((copy, i) => (
                          <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 leading-snug">
                            &ldquo;{truncate(copy, 160)}&rdquo;
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
                      {/* Est. Revenue row removed — duplicated the metric strip verbatim. */}
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

                  {/* Est. Growth Investment card removed — the metric strip's
                      "Growth Investment" cell already shows the modeled band. */}

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
                  {(lensAngle || result.recommended_buyer || result.outbound_hook) && (
                  <Card title="Suggested Outbound Angle">
                    <div className="space-y-3 text-sm">
                      {result.recommended_buyer && (
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Ideal Buyer</div>
                          <div className="text-gray-900 font-medium">{result.recommended_buyer}</div>
                        </div>
                      )}
                      {(lensAngle ?? result.recommended_angle) && (
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Best Angle</div>
                          <div className="text-gray-900 font-medium">
                            {lensAngle ?? result.recommended_angle}
                          </div>
                        </div>
                      )}
                      {(lensHook ?? result.outbound_hook) && (
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Outbound Hook</div>
                          <div className="text-gray-700">{lensHook ?? result.outbound_hook}</div>
                        </div>
                      )}
                    </div>
                    {displayedBrief && (
                      <button
                        onClick={copyBrief}
                        className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium ${
                          copied ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {copied ? 'Brief copied' : 'Copy Research Brief'}
                      </button>
                    )}
                  </Card>
                  )}
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

          </>
          )}
        </div>
      </main>
    </div>
  );
}
