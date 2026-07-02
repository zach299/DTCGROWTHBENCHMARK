'use client';

import { useId, useState } from 'react';

export interface ChartPoint {
  date: string; // ISO date
  value: number;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Smooth cubic path through points (Catmull-Rom → Bézier).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// Hand-rolled SVG line/area chart for snapshot history. No deps.
// 0 points → nothing (caller shows empty state); 1 point → big current value;
// 2 points → two dots + change label; 3+ → smooth line with gradient area.
export default function GrowthLineChart({
  points,
  height = 200,
  color = '#818cf8',
  valueLabel = 'value',
  formatValue = (v: number) => v.toLocaleString(),
}: {
  points: ChartPoint[];
  height?: number;
  color?: string;
  valueLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);

  // Defensive: never render from invalid values, even if the caller slips.
  points = points.filter((p) => p && Number.isFinite(p.value) && Number.isFinite(new Date(p.date).getTime()));

  if (points.length === 0) return null;

  if (points.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10">
        <div className="text-4xl font-bold tabular-nums" style={{ color }}>
          {formatValue(points[0].value)}
        </div>
        <div className="text-xs text-gray-400">
          Tracking started {fmtDate(points[0].date)} — history builds with each snapshot.
        </div>
      </div>
    );
  }

  const W = 720;
  const H = height;
  const PAD = { t: 16, r: 16, b: 26, l: 44 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;

  const xy = points.map((p, i) => ({
    x: PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw),
    y: PAD.t + ih - ((p.value - lo) / (hi - lo)) * ih,
  }));

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const changePct =
    first === 0 ? (last > 0 ? 100 : 0) : Math.round(((last - first) / Math.abs(first)) * 100);

  const line = smoothPath(xy);
  const area = `${line} L ${xy[xy.length - 1].x} ${PAD.t + ih} L ${xy[0].x} ${PAD.t + ih} Z`;

  // y-axis gridlines at min / mid / max
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${valueLabel} over time`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          for (let i = 1; i < xy.length; i++) {
            if (Math.abs(xy[i].x - x) < Math.abs(xy[best].x - x)) best = i;
          }
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => {
          const y = PAD.t + ih - ((t - lo) / (hi - lo)) * ih;
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="currentColor" className="text-white/[0.06]" strokeDasharray="3 5" />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize="10" className="fill-gray-500">
                {formatValue(Math.round(t))}
              </text>
            </g>
          );
        })}
        {points.length >= 3 && <path d={area} fill={`url(#${gid}-fill)`} />}
        {points.length >= 3 && (
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.length === 2 && (
          <line x1={xy[0].x} y1={xy[0].y} x2={xy[1].x} y2={xy[1].y} stroke={color} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
        )}
        {/* Last point highlight: vertical dashed guide */}
        <line
          x1={xy[xy.length - 1].x}
          x2={xy[xy.length - 1].x}
          y1={PAD.t}
          y2={PAD.t + ih}
          stroke={color}
          strokeOpacity="0.45"
          strokeDasharray="3 4"
        />
        {xy.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 5 : points.length <= 12 ? 3.5 : 2.5}
            fill={hover === i ? color : '#101218'}
            stroke={color}
            strokeWidth="2"
          />
        ))}
        {/* Value labels above dots (only when uncluttered) */}
        {points.length <= 12 &&
          xy.map((p, i) => (
            <text
              key={`v${i}`}
              x={Math.min(W - PAD.r, Math.max(PAD.l, p.x))}
              y={Math.max(10, p.y - 9)}
              textAnchor="middle"
              fontSize={i === xy.length - 1 ? 11 : 10}
              fontWeight={i === xy.length - 1 ? 700 : 500}
              className={i === xy.length - 1 ? 'fill-gray-100' : 'fill-gray-500'}
            >
              {formatValue(points[i].value)}
            </text>
          ))}
        {/* x labels: first, last, and a middle one when room */}
        {[0, points.length >= 5 ? Math.floor(points.length / 2) : -1, points.length - 1]
          .filter((i) => i >= 0)
          .map((i) => (
            <text
              key={i}
              x={xy[i].x}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize="10"
              className="fill-gray-500"
            >
              {fmtDate(points[i].date)}
            </text>
          ))}
      </svg>
      {points.length === 2 && (
        <div className="absolute right-2 top-1 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-gray-400 ring-1 ring-white/10">
          {changePct > 0 ? '+' : ''}
          {changePct}% since last tracked
        </div>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-white/10 bg-[#1a1e28] px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: `${(xy[hover].x / W) * 100}%`,
            top: `${Math.max(0, (xy[hover].y / H) * 100 - 22)}%`,
          }}
        >
          <div className="font-semibold text-gray-100 tabular-nums">{formatValue(points[hover].value)}</div>
          <div className="text-[10px] text-gray-400">{fmtDate(points[hover].date)}</div>
        </div>
      )}
    </div>
  );
}
