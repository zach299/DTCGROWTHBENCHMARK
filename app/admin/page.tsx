'use client';

import { useEffect, useState, useCallback } from 'react';
import Skeleton from '@/app/components/Skeleton';

interface SnapshotStats {
  total_snapshots: number;
  domains_with_snapshots: number;
  brands_zero_snapshots: number;
  brands_one_snapshot: number;
  brands_trend_ready: number;
  brands_deep_history: number;
  trend_ready_top100: number;
  trend_ready_top1000: number;
  trend_ready_viewed: number;
  viewed_total: number;
}

interface LastRun {
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  processed: number | null;
  succeeded: number | null;
  failed: number | null;
}

interface RunNotes {
  runner?: string;
  snapshots_written?: number;
  priority_processed?: number;
  no_ads?: number;
  partial?: boolean;
}

// `notes` may be a JSON object string from newer runs, or plain text from
// older rows — parse defensively and fall back to raw text.
function parseNotes(notes: string | null | undefined): { parsed: RunNotes | null; raw: string | null } {
  if (!notes) return { parsed: null, raw: null };
  try {
    const p = JSON.parse(notes);
    if (p && typeof p === 'object' && !Array.isArray(p)) return { parsed: p as RunNotes, raw: null };
  } catch {
    /* plain text */
  }
  return { parsed: null, raw: notes };
}

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
  snapshots?: SnapshotStats | null;
  last_run?: LastRun | null;
  cadence?: string;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleString() : '—';
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function CohortRow({ label, ready, total }: { label: string; ready: number; total: number }) {
  const pct = total > 0 ? (ready / total) * 100 : 0;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-zinc-400 text-xs uppercase tracking-widest">{label}</span>
        <span className="text-sm font-semibold text-white tabular-nums">
          {fmt(ready)}/{fmt(total)}
        </span>
      </div>
      <Bar pct={pct} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="text-zinc-400 text-xs uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-zinc-400 text-xs mt-1">{sub}</div>}
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
      const res = await fetch('/api/worker/stats', { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'TimeoutError'
          ? 'Stats took too long to load — retrying automatically, or hit Refresh.'
          : e instanceof Error
            ? e.message
            : 'Failed to load stats'
      );
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
            <p className="text-zinc-400 text-sm mt-1">Background refresh worker &amp; enrichment coverage</p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={load}
              className="text-zinc-400 hover:text-white text-sm border border-zinc-700 rounded-lg px-3 py-1.5 transition"
            >
              Refresh
            </button>
            <span className="text-zinc-400 text-xs">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : stats ? (
          <>
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Overall Coverage</h2>
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
              <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Top 25k Priority Brands</h2>
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
              <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Throughput</h2>
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

            {stats.snapshots && (
              <section className="mb-8">
                <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Trend Readiness</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <Stat label="0 Snapshots" value={fmt(stats.snapshots.brands_zero_snapshots)} sub="not started" />
                  <Stat label="1 Snapshot" value={fmt(stats.snapshots.brands_one_snapshot)} sub="tracking started" />
                  <Stat label="2+ Snapshots" value={fmt(stats.snapshots.brands_trend_ready)} sub="trend-ready" />
                  <Stat label="7+ Snapshots" value={fmt(stats.snapshots.brands_deep_history)} sub="deep history" />
                  <Stat label="Total Snapshots" value={fmt(stats.snapshots.total_snapshots)} sub={`${fmt(stats.snapshots.domains_with_snapshots)} domains`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <CohortRow label="Top 100 movers trend-ready" ready={stats.snapshots.trend_ready_top100} total={100} />
                  <CohortRow label="Top 1,000" ready={stats.snapshots.trend_ready_top1000} total={1000} />
                  <CohortRow label="Viewed brands" ready={stats.snapshots.trend_ready_viewed} total={stats.snapshots.viewed_total} />
                </div>
              </section>
            )}

            {stats.last_run &&
              (() => {
                const run = stats.last_run;
                const { parsed, raw } = parseNotes(run.notes);
                const failed = run.failed ?? 0;
                const stalled =
                  !run.completed_at &&
                  run.started_at != null &&
                  Date.now() - new Date(run.started_at).getTime() > 8 * 3_600_000;
                const partial = failed > 0 || Boolean(parsed?.partial);
                const badge = partial
                  ? { text: 'Partial', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/40' }
                  : stalled
                    ? { text: 'Did not finish', cls: 'bg-red-500/10 text-red-400 border-red-500/40' }
                    : run.completed_at
                      ? { text: 'Complete', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40' }
                      : { text: 'Running', cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-600' };
                return (
                  <section className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-xs uppercase tracking-widest text-zinc-400">Last Nightly Run</h2>
                      <span className={`text-[11px] font-semibold border rounded-full px-2.5 py-0.5 ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Stat
                        label="Started"
                        value={fmtDateTime(run.started_at)}
                        sub={run.completed_at ? `ended ${fmtDateTime(run.completed_at)}` : 'not completed'}
                      />
                      <Stat label="Duration" value={fmtDuration(run.started_at, run.completed_at)} />
                      <Stat
                        label="Processed"
                        value={fmt(run.processed ?? 0)}
                        sub={`${fmt(run.succeeded ?? 0)} ok · ${fmt(failed)} failed`}
                      />
                      <Stat
                        label="Snapshots Written"
                        value={parsed?.snapshots_written != null ? fmt(parsed.snapshots_written) : '—'}
                        sub={
                          parsed?.priority_processed != null
                            ? `${fmt(parsed.priority_processed)} priority processed`
                            : undefined
                        }
                      />
                    </div>
                    <div className="text-zinc-400 text-xs mt-3">
                      {stats.cadence && <span>Cadence: {stats.cadence}</span>}
                      {raw && <span>{stats.cadence ? ' · ' : ''}{raw}</span>}
                    </div>
                  </section>
                );
              })()}

            <div className="text-zinc-500 text-xs text-right">
              Last updated {new Date(stats.generated_at).toLocaleTimeString()} · auto-refreshes every 30s
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
