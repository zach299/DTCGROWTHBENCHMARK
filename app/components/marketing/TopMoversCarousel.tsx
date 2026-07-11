'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TICKER_COMPANIES, type TickerEntry } from '@/lib/marketingData';

// "Top Movers" — a rotating set of detailed company cards. Auto-advances
// every ~5s (paused on hover, disabled under reduced motion), with manual
// prev/next controls. Attempts to hydrate real movers from /api/top-movers;
// sample data renders immediately and stays as the fallback.

interface MoverCard {
  domain: string;
  name: string;
  category: string | null;
  score: number;
  delta7d: number | null;
  spark: number[];
  signals: string[];
}

const SAMPLE_CATEGORIES: Record<string, string> = {
  'jonesroadbeauty.com': 'Beauty',
  'eightsleep.com': 'Sleep Tech',
  'ridge.com': 'Accessories',
  'monos.com': 'Travel',
  'gymshark.com': 'Apparel',
  'ruggable.com': 'Home',
  'carawayhome.com': 'Kitchen',
  'hexclad.com': 'Kitchen',
  'trueclassictees.com': 'Apparel',
  'drinkolipop.com': 'Beverage',
};

function sampleCards(entries: TickerEntry[]): MoverCard[] {
  return entries.slice(0, 10).map((e) => ({
    domain: e.domain,
    name: e.name,
    category: SAMPLE_CATEGORIES[e.domain] ?? 'DTC',
    score: e.score,
    delta7d: e.delta7d ?? null,
    spark: e.spark,
    signals: [e.signal, 'Growth score in the top decile'],
  }));
}

function sparkFromScore(domain: string, score: number): number[] {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return Array.from({ length: 8 }, (_, i) =>
    Math.max(5, score - (7 - i) * 3 + (((h >> (i * 3)) % 11) - 5))
  );
}

function Favicon({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-xs font-bold uppercase text-gray-300">
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={36}
      height={36}
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
      className="h-9 w-9 rounded-lg bg-white/5"
    />
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 88;
  const h = 26;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#7c6ef5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

const VISIBLE = 5;

export default function TopMoversCarousel() {
  const [cards, setCards] = useState<MoverCard[]>(() => sampleCards(TICKER_COMPANIES));
  const [start, setStart] = useState(0);
  const [hovered, setHovered] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/top-movers', { signal: AbortSignal.timeout(12_000) });
        if (!r.ok) return;
        const d = await r.json();
        const movers: Array<{
          domain: string;
          company_name: string | null;
          primary_category: string | null;
          growth_score: number;
          growth_momentum: string | null;
          active_meta_ads: number;
          landing_pages_count: number;
        }> = Array.isArray(d.movers) ? d.movers : [];
        const mapped: MoverCard[] = movers
          .filter((m) => m.domain && Number(m.growth_score) > 0)
          .slice(0, 10)
          .map((m) => ({
            domain: m.domain,
            name: m.company_name || m.domain.replace(/^www\./, ''),
            category: m.primary_category,
            score: Math.round(Number(m.growth_score)),
            delta7d: null,
            spark: sparkFromScore(m.domain, Math.round(Number(m.growth_score))),
            signals: [
              m.active_meta_ads > 0 ? `${m.active_meta_ads} active Meta ads` : 'Paid media quiet',
              m.growth_momentum ? `Momentum: ${m.growth_momentum}` : `${m.landing_pages_count} landing pages tracked`,
            ],
          }));
        if (!cancelled && mapped.length >= VISIBLE) setCards(mapped);
      } catch {
        /* keep samples */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(
    (dir: 1 | -1) => setStart((s) => (s + dir + cards.length) % cards.length),
    [cards.length]
  );

  useEffect(() => {
    if (hovered || reduced.current) return;
    const id = window.setInterval(() => advance(1), 5000);
    return () => window.clearInterval(id);
  }, [hovered, advance]);

  const visible = Array.from({ length: Math.min(VISIBLE, cards.length) }, (_, i) => cards[(start + i) % cards.length]);

  return (
    <section
      id="top-movers"
      aria-label="Top movers"
      className="mx-auto w-full max-w-6xl px-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Top Movers</h2>
          <p className="mt-1 text-sm text-gray-400">Companies with the strongest signal acceleration right now.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous companies"
            onClick={() => advance(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-gray-300 transition-colors hover:border-white/25 hover:text-white"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next companies"
            onClick={() => advance(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-gray-300 transition-colors hover:border-white/25 hover:text-white"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {visible.map((c) => (
          <div
            key={c.domain}
            className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 transition-[border-color,transform] duration-300 hover:border-[#7c6ef5]/40"
          >
            <div className="flex items-center gap-3">
              <Favicon domain={c.domain} name={c.name} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                <div className="truncate text-[11px] text-gray-400">{c.category ?? 'DTC'}</div>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Growth Score</div>
                <div className="text-2xl font-bold tabular-nums text-[#a99cff]">{c.score}</div>
                {c.delta7d != null && (
                  <div className={`text-[11px] font-semibold ${c.delta7d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.delta7d >= 0 ? '↑' : '↓'} {Math.abs(c.delta7d).toFixed(1)}% · 7d
                  </div>
                )}
              </div>
              <Spark values={c.spark} />
            </div>
            <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
              {c.signals.slice(0, 2).map((s) => (
                <li key={s} className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-400">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#7c6ef5]" />
                  {s}
                </li>
              ))}
            </ul>
            <Link
              href={`/b/${encodeURIComponent(c.domain)}`}
              className="mt-auto pt-3 text-[12px] font-medium text-[#a99cff] transition-colors hover:text-white"
            >
              View company →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
