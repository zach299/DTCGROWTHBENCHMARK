'use client';

import { useEffect, useState, useCallback } from 'react';

interface WorkerStats {
  total_brands: number;
  enriched_ever: number;
  fresh_within_window: number;
  stale_or_unenriched: number;
  coverage_pct: number;
  freshness_pct: number;
  top_25k: {
    total: number;
    fresh: number;
    queue_depth: number;
    coverage_pct: number;
  };
  throughput: {
    last_24h: number;
    last_hour: number;
    per_minute_estimate: number | null;
  };
  estimates: {
    days_to_refresh_top25k: number | null;
    days_to_enrich_all: number | null;
  };
  refresh_window_days: number;
  generated_at: string;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="text-zinc-400 text-xs uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-zinc-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Bar({ pct, color = 'bg-indigo-500' }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-zinc-800 rounded-full h-2 mt-2">
      <div
        className={`${color} h-2 rounded-full transition-all duration-700`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString();
}

export default function AdminPage() {
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Tambourine — Admin</h1>
            <p className="text-zinc-500 text-sm mt-1">Background refresh worker &amp; enrichment coverage</p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={load}
              className="text-zinc-400 hover:text-white text-sm border border-zinc-700 rounded-lg px-3 py-1.5 transition"
            >
              Refresh
            </button>
            <span className="text-zinc-500 text-xs">
              Enrichment runs daily via GitHub Actions (“Enrich Top 50k Brands”) — trigger extra runs from the Actions tab.
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && !stats ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : stats ? (
          <>
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Overall Coverage</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Total Brands" value={fmt(stats.total_brands)} sub="Shopify in master_database" />
                <Stat
                  label="Enriched Ever"
                  value={fmt(stats.enriched_ever)}
                  sub={`${stats.coverage_pct}% coverage`}
                />
                <Stat
                  label={`Fresh (≤${stats.refresh_window_days}d)`}
                  value={fmt(stats.fresh_within_window)}
                  sub={`${stats.freshness_pct}% freshness`}
                />
                <Stat
                  label="Queue Depth"
                  value={fmt(stats.stale_or_unenriched)}
                  sub="stale or unenriched"
                />
              </div>
              <Bar pct={stats.freshness_pct} />
            </section>

            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Top 25k Priority Brands</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="In Cohort" value={fmt(stats.top_25k.total)} />
                <Stat
                  label="Fresh"
                  value={fmt(stats.top_25k.fresh)}
                  sub={`${stats.top_25k.coverage_pct}% coverage`}
                />
                <Stat label="Queue" value={fmt(stats.top_25k.queue_depth)} sub="need refresh" />
                <Stat
                  label="ETA to Clear"
                  value={
                    stats.estimates.days_to_refresh_top25k != null
                      ? `${stats.estimates.days_to_refresh_top25k}d`
                      : '—'
                  }
                  sub="at current rate"
                />
              </div>
              <Bar pct={stats.top_25k.coverage_pct} color="bg-emerald-500" />
            </section>

            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Throughput</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Last 24h" value={fmt(stats.throughput.last_24h)} sub="domains enriched" />
                <Stat label="Last Hour" value={fmt(stats.throughput.last_hour)} sub="domains enriched" />
                <Stat
                  label="Rate"
                  value={
                    stats.throughput.per_minute_estimate != null
                      ? `${stats.throughput.per_minute_estimate}/min`
                      : '—'
                  }
                  sub="estimated"
                />
                <Stat
                  label="100k Backfill ETA"
                  value={
                    stats.estimates.days_to_enrich_all != null
                      ? `${stats.estimates.days_to_enrich_all}d`
                      : '—'
                  }
                  sub="all unenriched"
                />
              </div>
            </section>

            <div className="text-zinc-600 text-xs text-right">
              Last updated {new Date(stats.generated_at).toLocaleTimeString()} · auto-refreshes every 30s
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
