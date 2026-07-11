'use client';

// /company-growth — the lead-magnet lookup experience for cold outbound,
// paid, and SEO traffic. One job: run a company lookup, show a limited free
// report, convert via the in-place email unlock.
//
// Flow: resolve input → POST /api/lookup (metering) → POST /api/company →
// POST /api/analyze-domain when uncached → LeadReport with locked modules →
// POST /api/request-brand (source: report_unlock) unlocks in place.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ParticleField from './ParticleField';
import MarketingNav from './MarketingNav';
import GrowthTicker from './GrowthTicker';
import LeadReport, { type ReportData, brandNameOf } from './LeadReport';
import { type SnapshotRow } from '@/app/components/GrowthOverTime';
import { SearchIcon, BoltIcon } from '@/app/components/icons';
import { TICKER_COMPANIES } from '@/lib/marketingData';

const EXAMPLES = ['gymshark.com', 'ruggable.com', 'jonesroadbeauty.com'];

const LOADING_MESSAGES = [
  'Analyzing advertising activity',
  'Detecting hiring momentum',
  'Measuring website growth',
  'Reviewing technology changes',
  'Calculating Growth Score',
];

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'report'; data: ReportData; history: SnapshotRow[] | null }
  | { kind: 'untracked'; domain: string };

type Wall = { kind: 'signup_required' } | { kind: 'daily_limit'; limit: number };

const unlockKey = (domain: string) => `tam_report_unlock:${domain}`;

// ---------- animated loader ----------

function AnalyzeLoader() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % LOADING_MESSAGES.length),
      900
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-5 rounded-2xl border border-white/[0.08] bg-[#0d0e17]/90 px-6 py-14">
      <svg width="200" height="100" viewBox="0 0 200 100" aria-hidden="true">
        <polyline
          points="0,88 30,78 60,82 90,52 120,58 150,28 200,8"
          fill="none"
          stroke="#7c6ef5"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="gs-draw"
        />
        <circle cx="200" cy="8" r="4" fill="#7c6ef5" className="gs-pulse" />
      </svg>
      <div className="text-center" role="status" aria-live="polite">
        <div className="text-sm font-semibold text-gray-200">{LOADING_MESSAGES[step]}…</div>
        <p className="mt-1.5 text-xs text-gray-400">First scan of a company can take ~30 seconds.</p>
      </div>
    </div>
  );
}

// ---------- untracked capture ----------

function UntrackedPanel({ domain }: { domain: string }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError('Enter a valid email, like you@company.com');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/request-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, domain }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setDone(true);
        return;
      }
      setError(typeof d.error === 'string' ? d.error : 'Something went wrong — please try again.');
    } catch {
      setError('Network hiccup — please try again.');
    }
    setSubmitting(false);
  }

  if (done) {
    return (
      <div className="tam-wall rounded-2xl p-6 text-center sm:p-8">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          ✓
        </div>
        <h3 className="mt-3 text-lg font-bold text-white">You&apos;re in — we&apos;ll email you when {domain} is scored.</h3>
        <p className="mt-1.5 text-sm text-gray-400">Usually within 24 hours.</p>
      </div>
    );
  }

  return (
    <div className="tam-wall rounded-2xl p-6 sm:p-8">
      <h3 className="text-lg font-bold text-white sm:text-xl">
        We&apos;re not tracking <span className="text-[#b5aaff]">{domain}</span> yet
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
        Drop your email and we&apos;ll score it within 24 hours.
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
          aria-label="Email for the report"
          autoComplete="email"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#101218] px-4 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-indigo-500/60"
        />
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Notify me'}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- soft metering wall ----------

function MeterWall({ wall }: { wall: Wall }) {
  return (
    <div className="tam-wall rounded-2xl p-6 sm:p-8">
      <h3 className="text-lg font-bold text-white sm:text-xl">
        {wall.kind === 'daily_limit'
          ? `You've used today's ${wall.limit} free lookups`
          : "You've used your free lookup"}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
        Create a free account for 5 lookups a day, watchlists, and alerts when companies start moving.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/sign-up"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-indigo-500"
        >
          Create free account →
        </Link>
        <Link href="/sign-in" className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-200">
          Sign in
        </Link>
      </div>
    </div>
  );
}

// ---------- how it works + footer ----------

function HowItWorks() {
  const steps = [
    ['Enter a company', 'A name, a domain, or a pasted URL — we resolve it either way.'],
    ['We read its live growth signals', 'Advertising, hiring, traffic, and technology — pulled fresh, not from a stale database.'],
    ['You get the score and the why', 'One Growth Score, the momentum behind it, and the signals that drive it.'],
  ] as const;
  return (
    <section id="how" aria-label="How it works" className="mx-auto w-full max-w-4xl scroll-mt-24 px-6">
      <h2 className="text-center text-xl font-semibold tracking-tight text-white sm:text-2xl">How it works</h2>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {steps.map(([title, body], i) => (
          <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <span className="font-mono text-[11px] tabular-nums text-[#a99cff]">0{i + 1}</span>
            <h3 className="mt-2 text-sm font-semibold text-white">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-400">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link
          href="/sign-up"
          className="inline-block rounded-full bg-[#7c6ef5] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-[#8b7cf7]"
        >
          Create a free account — 5 lookups a day
        </Link>
      </div>
    </section>
  );
}

function MiniFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 pb-10 pt-4">
      <div className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-8 sm:flex-row">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <BoltIcon width={12} height={12} />
          </span>
          <span className="text-sm font-semibold text-gray-200">Tambourine</span>
        </span>
        <span className="text-[12px] text-gray-500">© {new Date().getFullYear()} Tambourine Growth</span>
      </div>
    </footer>
  );
}

// ---------- main ----------

export default function LeadMagnet({ initialQuery }: { initialQuery?: string }) {
  const [value, setValue] = useState(initialQuery ?? '');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [wall, setWall] = useState<Wall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  // Resolve free-text input to a domain. Dots → treat as domain; otherwise
  // try /api/search and take the top hit. No hit → untracked (with a guess).
  const resolveDomain = useCallback(async (raw: string): Promise<
    { domain: string } | { untracked: string } | { error: string }
  > => {
    const trimmed = raw.trim();
    if (!trimmed) return { error: 'Enter a company name or website to analyze.' };
    if (trimmed.includes('.')) {
      const d = normalizeDomain(trimmed);
      if (VALID_HOST.test(d)) return { domain: d };
      return { error: 'That doesn’t look like a company or website — try something like gymshark.com.' };
    }
    // Name search.
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, limit: 5 }),
        signal: AbortSignal.timeout(12_000),
      });
      const d = await r.json().catch(() => ({}));
      const top = Array.isArray(d.results) ? d.results[0] : null;
      if (top?.domain && typeof top.domain === 'string') return { domain: normalizeDomain(top.domain) };
    } catch {
      /* fall through to untracked guess */
    }
    const guess = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (guess) return { untracked: `${guess}.com` };
    return { error: 'That doesn’t look like a company or website — try something like gymshark.com.' };
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setValue(raw.trim());

      const resolved = await resolveDomain(raw);
      if ('error' in resolved) {
        setError(resolved.error);
        setBusy(false);
        return;
      }
      if ('untracked' in resolved) {
        setStage({ kind: 'untracked', domain: resolved.untracked });
        setBusy(false);
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const domain = resolved.domain;

      // 1) Metering.
      let allowed = true;
      try {
        const r = await fetch('/api/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: AbortSignal.timeout(15_000),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(typeof d.error === 'string' ? d.error : 'Enter a valid company website, like gymshark.com.');
          setBusy(false);
          return;
        }
        if (d.allowed === false) {
          allowed = false;
          setWall(
            d.reason === 'daily_limit'
              ? { kind: 'daily_limit', limit: Number(d.limit ?? 5) }
              : { kind: 'signup_required' }
          );
        }
      } catch {
        /* metering unreachable — fail open, never break the funnel */
      }
      if (!allowed) {
        // Keep any report already on screen — the email-unlock path stays live.
        setBusy(false);
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      setWall(null);
      setPercentile(null);
      setUnlocked(false);
      setStage({ kind: 'loading' });
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 2) Cached payload, then live enrichment when needed. The loader keeps
      // cycling through the whole (possibly long) analyze call.
      let data: ReportData | null = null;
      let history: SnapshotRow[] | null = null;
      let needsEnrichment = false;
      try {
        const r = await fetch('/api/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: AbortSignal.timeout(15_000),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          data = {
            domain: d.domain ?? domain,
            company: d.company ?? null,
            hiring: d.hiring ?? null,
            spend_estimate: d.spend_estimate ?? null,
            trends: d.trends ?? null,
            ...(d.analysis ?? {}),
          };
          needsEnrichment = Boolean(d.needs_enrichment);
          history = Array.isArray(d.history) ? d.history : [];
        }
      } catch {
        /* handled below */
      }

      const hasScore = data?.growth_score != null;
      if (!data || needsEnrichment || !hasScore) {
        try {
          const r = await fetch('/api/analyze-domain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
          });
          const fresh = await r.json().catch(() => ({}));
          if (r.ok && fresh && fresh.growth_score != null) {
            data = {
              ...(data ?? { domain }),
              ...fresh,
              domain,
              spend_estimate: fresh.spend_estimate ?? data?.spend_estimate ?? null,
              hiring: fresh.hiring ?? data?.hiring ?? null,
            };
            if (Array.isArray(fresh.history) && fresh.history.length > 0) history = fresh.history;
          }
        } catch {
          /* fall through — score check below decides */
        }
      }

      if (!data || data.growth_score == null) {
        setStage({ kind: 'untracked', domain });
        setBusy(false);
        return;
      }

      // Revisits stay unlocked for this domain.
      try {
        if (window.localStorage.getItem(unlockKey(domain))) setUnlocked(true);
      } catch {
        /* storage unavailable */
      }

      setStage({ kind: 'report', data, history });
      setBusy(false);

      // 3) Percentile (best-effort — omit when unavailable).
      try {
        const r = await fetch('/api/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: AbortSignal.timeout(15_000),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && typeof d.percentile_top === 'number') setPercentile(d.percentile_top);
      } catch {
        /* percentile omitted */
      }
    },
    [busy, resolveDomain]
  );

  // Auto-run a query handed over from / or the old /lookup link.
  useEffect(() => {
    if (initialQuery && !autoRan.current) {
      autoRan.current = true;
      submit(initialQuery);
    }
  }, [initialQuery, submit]);

  const onUnlocked = useCallback(
    (email: string) => {
      setUnlocked(true);
      if (stage.kind === 'report') {
        try {
          window.localStorage.setItem(
            unlockKey(stage.data.domain),
            JSON.stringify({ unlocked: true, email, at: new Date().toISOString() })
          );
        } catch {
          /* storage unavailable — session-only unlock */
        }
      }
    },
    [stage]
  );

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#08090f] text-gray-200">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] tam-hero-glow" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-[720px]">
        <ParticleField />
      </div>

      <MarketingNav variant="lead" />

      <main className="relative">
        {/* Hero + search */}
        <div className="mx-auto max-w-3xl px-6 pt-32 text-center sm:pt-40">
          <h1 className="text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
            See how fast <span className="tam-gradient-text">any company</span> is growing.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Enter a company to see its Growth Score, advertising momentum, hiring activity, traffic
            trends, and technology signals.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(value);
            }}
            className="tam-prompt mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-[#101218]/90 p-2 pl-4 backdrop-blur-sm"
          >
            <SearchIcon width={16} height={16} className="shrink-0 text-gray-500" />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter a company name or website…"
              inputMode="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Company name or website"
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-gray-100 outline-none placeholder:text-gray-500"
            />
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="shrink-0 rounded-xl bg-[#7c6ef5] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-900/50 transition-colors hover:bg-[#8b7cf7] disabled:opacity-50"
            >
              {busy ? 'Analyzing…' : 'Analyze company'}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-gray-500">Try:</span>
            {EXAMPLES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => submit(d)}
                disabled={busy}
                className="rounded-full border border-white/[0.09] bg-white/[0.02] px-3.5 py-1.5 text-[12px] text-gray-400 transition-colors hover:border-[#7c6ef5]/40 hover:text-gray-200 disabled:opacity-50"
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Results region */}
        <div ref={resultsRef} className="mx-auto mt-10 w-full max-w-4xl scroll-mt-24 space-y-5 px-4 sm:px-6">
          {wall && <MeterWall wall={wall} />}
          {stage.kind === 'loading' && <AnalyzeLoader />}
          {stage.kind === 'untracked' && <UntrackedPanel domain={stage.domain} />}
          {stage.kind === 'report' && (
            <LeadReport
              data={stage.data}
              history={stage.history}
              percentile={percentile}
              unlocked={unlocked}
              onUnlocked={onUnlocked}
            />
          )}
          {stage.kind === 'report' && (
            <p className="sr-only">
              Growth report for {brandNameOf(stage.data, stage.data.domain)} loaded.
            </p>
          )}
        </div>

        {/* Companies moving right now */}
        <div className="mt-20 sm:mt-24">
          <GrowthTicker rows={1} title="Companies moving right now" entries={TICKER_COMPANIES} />
        </div>

        <div className="mt-20 sm:mt-24">
          <HowItWorks />
        </div>

        <div className="mt-16">
          <MiniFooter />
        </div>
      </main>
    </div>
  );
}
