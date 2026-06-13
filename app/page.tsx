'use client';

import { useState } from 'react';

interface ScoreResult {
  domain: string;
  growth_score?: number;
  paid_media_signal?: string;
  social_signal?: string;
  hiring_signal?: string;
  site_signal?: string;
  signals?: string[];
  summary?: string;
  recommended_buyer?: string;
  recommended_angle?: string;
  outbound_hook?: string;
  last_updated?: string;
  status?: string;
  message?: string;
  error?: string;
}

function SignalBadge({ label, value }: { label: string; value?: string }) {
  const color =
    value === 'high'
      ? 'bg-green-100 text-green-800'
      : value === 'medium'
      ? 'bg-yellow-100 text-yellow-800'
      : value === 'low'
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}: {value ?? 'unknown'}
    </span>
  );
}

export default function Home() {
  const [domain, setDomain] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;

    setLoading(true);
    setResult(null);
    setShowRaw(false);

    try {
      const res = await fetch('/api/v1/analyze-domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ domain, error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Growth Signals</h1>
          <p className="text-gray-500">Ecommerce brand GTM intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ridge.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsa_..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Analyzing...' : 'Analyze Domain'}
            </button>
          </div>
        </form>

        {result && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            {result.error ? (
              <div className="text-red-600">Error: {result.error}</div>
            ) : result.status === 'queued' || result.status === 'no_data' ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">⏳</div>
                <p className="text-gray-600">{result.message}</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{result.domain}</h2>
                    {result.last_updated && (
                      <p className="text-sm text-gray-400 mt-1">
                        Updated {new Date(result.last_updated).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {result.growth_score !== undefined && result.growth_score !== null && (
                    <div className="text-center">
                      <div
                        className={`text-5xl font-bold ${
                          result.growth_score >= 70
                            ? 'text-green-600'
                            : result.growth_score >= 40
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {result.growth_score}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">Growth Score</div>
                    </div>
                  )}
                </div>

                {(result.paid_media_signal || result.social_signal || result.hiring_signal || result.site_signal) && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    <SignalBadge label="Paid Media" value={result.paid_media_signal} />
                    <SignalBadge label="Social" value={result.social_signal} />
                    <SignalBadge label="Hiring" value={result.hiring_signal} />
                    <SignalBadge label="Site" value={result.site_signal} />
                  </div>
                )}

                {result.summary && (
                  <p className="text-gray-700 mb-6 leading-relaxed">{result.summary}</p>
                )}

                {result.signals && result.signals.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Signals</h3>
                    <ul className="space-y-2">
                      {result.signals.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-700">
                          <span className="text-blue-500 mt-0.5">→</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.recommended_buyer && (
                  <div className="bg-blue-50 rounded-lg p-4 mb-4">
                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Recommended Buyer</div>
                    <div className="text-gray-900 font-medium">{result.recommended_buyer}</div>
                  </div>
                )}

                {result.recommended_angle && (
                  <div className="bg-purple-50 rounded-lg p-4 mb-4">
                    <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Recommended Angle</div>
                    <div className="text-gray-900">{result.recommended_angle}</div>
                  </div>
                )}

                {result.outbound_hook && (
                  <div className="bg-green-50 rounded-lg p-4 mb-6 border-l-4 border-green-400">
                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Outbound Hook</div>
                    <div className="text-gray-900 italic">&quot;{result.outbound_hook}&quot;</div>
                  </div>
                )}

                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showRaw ? 'Hide' : 'Show'} raw JSON
                </button>
                {showRaw && (
                  <pre className="mt-4 bg-gray-900 text-green-400 rounded-lg p-4 overflow-auto text-xs">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
