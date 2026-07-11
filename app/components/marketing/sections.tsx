'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SparkleIcon,
  PaperclipIcon,
  MicIcon,
  ArrowRightIcon,
  BoltIcon,
  MetaIcon,
  PersonIcon,
  TrendUpIcon,
  LayersIcon,
  DollarCircleIcon,
  DocIcon,
} from '@/app/components/icons';
import { EXAMPLE_QUERIES, SIGNAL_CATEGORIES, USE_CASES, NAV_LINKS } from '@/lib/marketingData';

const DEMO_HREF =
  'mailto:zach@tambourinegrowth.com?subject=' + encodeURIComponent('Tambourine demo');

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
export function Hero() {
  return (
    <div className="mx-auto max-w-3xl px-6 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#7c6ef5]/30 bg-[#7c6ef5]/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b5aaff]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#7c6ef5]" />
        Live growth signals · AI company intelligence
      </span>
      <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
        Find the <span className="tam-gradient-text">fastest-growing</span> companies before
        everyone else.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-400 sm:text-lg">
        Search millions of live signals across advertising, hiring, traffic, revenue, and
        technology to find the companies entering a buying window.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI search bar — routes signed-out searches into the /lookup lead magnet.
// ---------------------------------------------------------------------------
export function AISearchBar() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = () => {
    const q = value.trim();
    if (!q || loading) return;
    setLoading(true);
    router.push(`/lookup?q=${encodeURIComponent(q)}`);
  };

  return (
    <div id="search" className="mx-auto mt-10 w-full max-w-2xl scroll-mt-32 px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="tam-prompt flex items-center gap-2 rounded-2xl bg-[#101218]/90 py-2.5 pl-4 pr-2 backdrop-blur-sm"
      >
        <SparkleIcon width={18} height={18} className="shrink-0 text-[#a99cff]" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a brand, category, or growth signal…"
          aria-label="Search companies and growth signals"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
        />
        <span className="hidden items-center gap-1 text-gray-600 sm:flex" aria-hidden="true">
          <PaperclipIcon width={16} height={16} />
          <MicIcon width={16} height={16} />
        </span>
        <button
          type="submit"
          aria-label="Search"
          disabled={loading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7c6ef5] text-white shadow-md shadow-indigo-900/50 transition-colors hover:bg-[#8b7cf7] disabled:opacity-60"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <ArrowRightIcon width={16} height={16} />
          )}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Example query pills
// ---------------------------------------------------------------------------
export function QueryPills() {
  const router = useRouter();
  return (
    <div className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2 px-6">
      {EXAMPLE_QUERIES.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => router.push(`/lookup?q=${encodeURIComponent(q)}`)}
          className="rounded-full border border-white/[0.09] bg-white/[0.02] px-3.5 py-1.5 text-[12px] text-gray-400 transition-colors hover:border-[#7c6ef5]/40 hover:text-gray-200"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Honest stat strip (instead of fake customer logos)
// ---------------------------------------------------------------------------
export function StatStrip() {
  const stats = [
    ['60,000+', 'brands tracked'],
    ['59k+', 'live snapshots'],
    ['6', 'signal categories'],
    ['Daily', 'refresh cadence'],
  ] as const;
  return (
    <div className="mx-auto mt-14 max-w-3xl px-6">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-y border-white/[0.06] py-5">
        {stats.map(([n, label]) => (
          <div key={label} className="text-center">
            <span className="text-sm font-semibold tabular-nums text-gray-200">{n}</span>
            <span className="ml-1.5 text-[12px] text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal coverage — technical rows, thin dividers, existing stroke icons.
// ---------------------------------------------------------------------------
const SIGNAL_ICONS = [MetaIcon, PersonIcon, TrendUpIcon, LayersIcon, DollarCircleIcon, DocIcon];

export function SignalCoverage() {
  return (
    <section id="signals" aria-label="Signal coverage" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6">
      <div className="mb-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Data coverage</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Six signal families, one growth score.
        </h2>
      </div>
      <div className="grid grid-cols-1 divide-y divide-white/[0.06] border-y border-white/[0.06] md:grid-cols-2 md:gap-x-12">
        {SIGNAL_CATEGORIES.map((c, i) => {
          const Icon = SIGNAL_ICONS[i % SIGNAL_ICONS.length];
          return (
            <div key={c.name} className="flex items-start gap-4 py-5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-gray-400">
                <Icon width={15} height={15} />
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[10px] tabular-nums text-gray-600">0{i + 1}</span>
                  <h3 className="text-sm font-semibold text-gray-100">{c.name}</h3>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{c.blurb}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------
export function UseCases() {
  return (
    <section id="use-cases" aria-label="Use cases" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6">
      <div className="mb-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Who it&apos;s for</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Built for teams that sell into growth.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {USE_CASES.map((u) => (
          <div
            key={u.title}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors hover:border-[#7c6ef5]/35"
          >
            <h3 className="text-sm font-semibold text-white">{u.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-400">{u.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------
export function FinalCTA() {
  return (
    <section id="cta" aria-label="Get started" className="mx-auto w-full max-w-4xl scroll-mt-24 px-6">
      <div className="relative overflow-hidden rounded-3xl border border-[#7c6ef5]/25 bg-[#0d0e17] px-6 py-14 text-center sm:px-12">
        <div className="pointer-events-none absolute inset-0 tam-hero-glow" aria-hidden="true" />
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Stop prospecting from static lists.
          </h2>
          <p className="mt-3 text-base text-gray-400">Search the market as it changes.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#search"
              onClick={() => {
                // Move focus into the search box after the scroll.
                setTimeout(() => {
                  document
                    .querySelector<HTMLInputElement>('#search input')
                    ?.focus({ preventScroll: true });
                }, 350);
              }}
              className="rounded-full bg-[#7c6ef5] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-[#8b7cf7]"
            >
              Start searching
            </a>
            <a
              href={DEMO_HREF}
              className="rounded-full border border-white/15 px-6 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:border-white/30 hover:text-white"
            >
              Book a demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 pb-10 pt-4">
      <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <BoltIcon width={12} height={12} />
          </span>
          <span className="text-sm font-semibold text-gray-200">Tambourine</span>
        </span>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              title={l.comingSoon ? 'Coming soon' : undefined}
              className="text-[12px] text-gray-500 transition-colors hover:text-gray-300"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <span className="text-[12px] text-gray-600">
          © {new Date().getFullYear()} Tambourine Growth
        </span>
      </div>
    </footer>
  );
}
