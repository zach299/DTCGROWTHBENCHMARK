'use client';

import { useState } from 'react';

interface AnalysisResult {
  domain: string;
  growth_score: number;
  northbeam_fit_score: number;
  paid_media_signal: string;
  recommended_buyer: string;
  recommended_angle: string;
  outbound_hook: string;
  reasons: string[];
  cached: boolean;
  company?: Record<string, unknown>;
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
