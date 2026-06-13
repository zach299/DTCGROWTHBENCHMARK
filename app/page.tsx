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
  cached: boolean;
  company?: Record<string, unknown>;
}

function activityBadge(level: string): string {
  if (level === 'high') return 'bg-green-100 text-green-800';
  if (level === 'medium') return 'bg-yellow-100 text-yellow-800';
  if (level === 'low') return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-600';
}

function truncateUrl(url: string, max = 60): string {
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

export default function Home() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowRaw(false);
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
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{result.domain}</h2>
              {result.cached && (
                <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                  cached
                </span>
              )}
            </div>

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

                {result.meta_ads.unique_landing_pages.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Top Landing Pages
                    </h4>
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

            {Array.isArray(result.reasons) && result.reasons.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Reasons</h3>
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
