'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TickerEntry } from '@/lib/marketingData';

// The live market ticker. Infinite seamless horizontal loop (duplicated track
// + CSS keyframe translate, GPU-friendly), pause on hover and while dragging,
// second row reversed when rows=2. Reduced motion renders a static
// horizontally-scrollable row instead.

interface MoverRow {
  domain: string;
  company_name: string | null;
  growth_score: number;
  growth_momentum: string | null;
  active_meta_ads: number;
}

// Deterministic pseudo-sparkline for API rows that don't carry history.
function sparkFromScore(domain: string, score: number): number[] {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const wobble = ((h >> (i * 3)) % 11) - 5;
    out.push(Math.max(5, score - (7 - i) * 3 + wobble));
  }
  return out;
}

function Favicon({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[9px] font-bold uppercase text-gray-300">
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={24}
      height={24}
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
      className="h-6 w-6 shrink-0 rounded-md bg-white/5"
    />
  );
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const w = 56;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? '#34d399' : '#f87171'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mk-spark-draw"
        opacity="0.85"
      />
    </svg>
  );
}

function TickerItem({ e, tick, idx }: { e: TickerEntry; tick: number; idx: number }) {
  // Deterministic, cheap ±1 score flicker — reads as live data.
  const jitter = (tick + idx) % 7 === 0 ? ((tick + idx) % 2 === 0 ? 1 : -1) : 0;
  const score = Math.max(1, Math.min(99, e.score + jitter));
  const up = e.delta7d == null ? true : e.delta7d >= 0;
  return (
    <div className="group/item relative flex shrink-0 items-center gap-3 border-r border-white/[0.06] px-5 py-3">
      <Favicon domain={e.domain} name={e.name} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="max-w-[130px] truncate text-[13px] font-medium text-gray-200">{e.name}</span>
          {e.delta7d != null && (
            <span className={`text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? '↑' : '↓'} {Math.abs(e.delta7d).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Growth Score</span>
          <span className="text-[13px] font-semibold tabular-nums text-[#a99cff]">{score}</span>
          <span className="hidden max-w-[150px] truncate text-[11px] text-gray-500 sm:block">{e.signal}</span>
        </div>
      </div>
      <Sparkline values={e.spark} up={up} />
      {/* Hover tooltip with signal detail */}
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden w-max max-w-[240px] -translate-x-1/2 rounded-lg border border-white/10 bg-[#171a26] px-3 py-2 text-[11px] text-gray-300 shadow-xl shadow-black/50 group-hover/item:block">
        <span className="font-semibold text-white">{e.name}</span> — {e.signal}
      </div>
    </div>
  );
}

function TickerRow({
  entries,
  reverse,
  tick,
  reduced,
}: {
  entries: TickerEntry[];
  reverse: boolean;
  tick: number;
  reduced: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const start = useRef({ x: 0, offset: 0 });

  if (reduced) {
    return (
      <div className="flex overflow-x-auto" role="list" aria-label="Company growth ticker">
        {entries.map((e, i) => (
          <TickerItem key={e.domain} e={e} tick={0} idx={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="group overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(ev) => {
        setDragging(true);
        start.current = { x: ev.clientX, offset };
        (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
      }}
      onPointerMove={(ev) => {
        if (!dragging) return;
        setOffset(start.current.offset + (ev.clientX - start.current.x));
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <div style={{ transform: `translateX(${offset}px)` }}>
        <div
          className={`flex w-max ${reverse ? 'mk-ticker-reverse' : 'mk-ticker'} group-hover:[animation-play-state:paused]`}
          style={dragging ? { animationPlayState: 'paused' } : undefined}
        >
          {[0, 1].map((dup) => (
            <div key={dup} className="flex" aria-hidden={dup === 1}>
              {entries.map((e, i) => (
                <TickerItem key={`${dup}-${e.domain}`} e={e} tick={tick} idx={i} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GrowthTicker({
  rows = 2,
  title = 'The market, moving',
  entries,
}: {
  rows?: 1 | 2;
  title?: string;
  entries: TickerEntry[];
}) {
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState<TickerEntry[] | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const id = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  // Hydrate with real movers when the API has data; sample data is the
  // immediate render and the fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/top-movers', { signal: AbortSignal.timeout(12_000) });
        if (!r.ok) return;
        const d = await r.json();
        const movers: MoverRow[] = Array.isArray(d.movers) ? d.movers : [];
        const mapped: TickerEntry[] = movers
          .filter((m) => m.domain && Number(m.growth_score) > 0)
          .slice(0, 14)
          .map((m) => ({
            domain: m.domain,
            name: m.company_name || m.domain.replace(/^www\./, ''),
            score: Math.round(Number(m.growth_score)),
            // No historical delta on this endpoint — omit the arrow and lead
            // with momentum text instead.
            signal: m.growth_momentum
              ? `Momentum: ${m.growth_momentum}`
              : `${m.active_meta_ads} active Meta ads`,
            spark: sparkFromScore(m.domain, Math.round(Number(m.growth_score))),
          }));
        if (!cancelled && mapped.length >= 6) setLive(mapped);
      } catch {
        /* keep sample data */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = live ?? entries;
  const half = Math.ceil(data.length / 2);
  const rowSets = useMemo(
    () => (rows === 2 ? [data.slice(0, half), data.slice(half)] : [data]),
    [data, rows, half]
  );

  return (
    <section aria-label="Growth ticker" className="w-full">
      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between px-6">
        <h2 className="text-sm font-semibold tracking-wide text-gray-300">{title}</h2>
        <span className="flex items-center gap-2 text-[11px] text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Updated live
        </span>
      </div>
      <div className="border-y border-white/[0.07] bg-white/[0.015]">
        {rowSets.map((set, i) => (
          <div key={i} className={i > 0 ? 'border-t border-white/[0.06]' : ''}>
            <TickerRow entries={set} reverse={i === 1} tick={tick} reduced={reduced} />
          </div>
        ))}
      </div>
    </section>
  );
}
