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

interface AnalysisResult {
  domain: string;
  growth_score: number;
  northbeam_fit_score: number;
  paid_media_signal: string;
  recommended_buyer: string;
  recommended_angle: string;
  outbound_hook: string;
  reasons: string[];
  meta_ads?: MetaAds | null;
  brand_context?: BrandContext | null;
  website_signals?: WebsiteSignals | null;
  landing_page_signals?: LandingPageSignals | null;
  growth_narrative?: string | null;
  growth_prompt?: string | null;
  cached: boolean;
  company?: Record<string, unknown>;
}

function activityBadge(level: string): string {
  if (level === 'high') return 'bg-green-100 text-green-800';
  if (level === 'medium') return 'bg-yellow-100 text-yellow-800';
  if (level === 'low') return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-600';
}

function truncateUrl(url: string, max = 55): string {
  const display = url.replace(/^https?:\/\/(www\.)?/, '');
  return display.length > max ? display.slice(0, max) + '…' : display;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function signalBadge(signal: string): string {
  if (signal === 'high') return 'bg-green-100 text-green-800';
  if (signal === 'medium') return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function SignalRow({ label, active, detail }: { label: string; active: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-xs text-gray-400">{detail}</span>}
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {active ? 'YES' : 'NO'}
        </span>
      </div>
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

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowRaw(false);
    setCopied(false);
    try {
      const res = await fetch('/api/analyze-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 404
            ? `"${data.domain ?? domain}" was not found in the database.`
            : data.error || 'Something went wrong.'
        );
        return;
      }
      setResult(data);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt() {
    if (!result?.growth_prompt) return;
    await navigator.clipboard.writeText(result.growth_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Growth Signals</h1>
        <p className="text-gray-500 mb-8">
          Analyze a DTC brand&apos;s growth potential from its domain.
        </p>

        <form onSubmit={analyze} className="flex gap-3 mb-8">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="ridge.com"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !domain.trim()}
            className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{result.domain}</h2>
              {result.cached && (
                <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                  cached
                </span>
              )}
            </div>

            {/* Score cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Growth Score</div>
                <div className={`text-5xl font-bold ${scoreColor(result.growth_score)}`}>
                  {result.growth_score}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Northbeam Fit</div>
                <div className={`text-5xl font-bold ${scoreColor(result.northbeam_fit_score)}`}>
                  {result.northbeam_fit_score}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500 mb-2">Paid Media Signal</div>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-sm font-semibold uppercase ${signalBadge(result.paid_media_signal)}`}
                >
                  {result.paid_media_signal}
                </span>
              </div>
            </div>

            {/* Brand Context */}
            {result.brand_context && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Brand Context</h3>
                <div className="space-y-3">
                  {result.brand_context.seo_title && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                        Title
                      </div>
                      <div className="text-sm text-gray-900">{result.brand_context.seo_title}</div>
                    </div>
                  )}
                  {(result.brand_context.meta_description || result.brand_context.og_description) && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                        Description
                      </div>
                      <div className="text-sm text-gray-700">
                        {result.brand_context.meta_description ||
                          result.brand_context.og_description}
                      </div>
                    </div>
                  )}
                  {result.brand_context.hero_headline && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                        Hero Headline
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {result.brand_context.hero_headline}
                      </div>
                    </div>
                  )}
                  {result.brand_context.hero_subheadline && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                        Hero Subheadline
                      </div>
                      <div className="text-sm text-gray-700">
                        {result.brand_context.hero_subheadline}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Meta Ads */}
            {result.meta_ads ? (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Meta Ads</h3>
                <div className="flex flex-wrap items-center gap-6 mb-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Active Ads</div>
                    <div className="text-4xl font-bold text-gray-900">
                      {result.meta_ads.active_ads_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-2">Ad Activity Level</div>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-sm font-semibold uppercase ${activityBadge(result.meta_ads.ad_activity_level)}`}
                    >
                      {result.meta_ads.ad_activity_level}
                    </span>
                  </div>
                  {result.meta_ads.platforms.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 mb-2">Platforms</div>
                      <div className="flex flex-wrap gap-2">
                        {result.meta_ads.platforms.map((p) => (
                          <span
                            key={p}
                            className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 capitalize"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Campaign Themes */}
                {result.landing_page_signals?.campaign_themes &&
                  result.landing_page_signals.campaign_themes.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Top Campaign Themes
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {result.landing_page_signals.campaign_themes.map((theme) => (
                          <span
                            key={theme}
                            className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-800"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {result.meta_ads.unique_landing_pages.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Top Landing Pages</h4>
                    <ul className="space-y-1">
                      {result.meta_ads.unique_landing_pages.slice(0, 10).map((url, i) => (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 break-all"
                          >
                            {truncateUrl(url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.meta_ads.sample_ad_copy.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Sample Ad Copy</h4>
                    <div className="space-y-2">
                      {result.meta_ads.sample_ad_copy.slice(0, 3).map((copy, i) => (
                        <blockquote
                          key={i}
                          className="rounded-lg border-l-4 border-blue-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 italic"
                        >
                          {copy}
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !result.cached && (
                <p className="text-sm text-gray-400">No Meta Ad Library data available</p>
              )
            )}

            {/* Website Signals */}
            {result.website_signals && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Website Signals</h3>
                <SignalRow label="Subscription / Subscribe-and-Save" active={result.website_signals.subscription} />
                <SignalRow label="Affiliate / Ambassador Program" active={result.website_signals.affiliate_program} />
                <SignalRow label="Retail / Wholesale Presence" active={result.website_signals.retail_presence} />
                <SignalRow label="International / Multi-currency" active={result.website_signals.international} />
                <SignalRow
                  label="Careers Page Active"
                  active={result.website_signals.careers_active}
                  detail={
                    result.website_signals.careers_roles.length
                      ? result.website_signals.careers_roles.join(', ')
                      : undefined
                  }
                />
              </div>
            )}

            {/* Growth Narrative */}
            {result.growth_narrative && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-indigo-700 mb-3">Growth Narrative</h3>
                <p className="text-gray-800 leading-relaxed">{result.growth_narrative}</p>
              </div>
            )}

            {/* Reasons */}
            {Array.isArray(result.reasons) && result.reasons.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Signal Summary</h3>
                <ul className="space-y-2">
                  {result.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* GTM cards */}
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Recommended Buyer</h3>
                <p className="text-gray-900">{result.recommended_buyer}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Recommended Angle</h3>
                <p className="text-gray-900">{result.recommended_angle}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Outbound Hook</h3>
                <p className="text-gray-900">{result.outbound_hook}</p>
              </div>
            </div>

            {/* Growth Prompt */}
            {result.growth_prompt && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Growth Prompt</h3>
                  <button
                    onClick={copyPrompt}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {copied ? '✓ Copied!' : 'Copy Prompt'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Paste this into Claude or ChatGPT to generate outbound emails, LinkedIn messages,
                  discovery hypotheses, and GTM angles.
                </p>
                <pre className="overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {result.growth_prompt}
                </pre>
              </div>
            )}

            {/* Raw JSON toggle */}
            <div>
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
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
      </div>
    </main>
  );
}
