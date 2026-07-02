// Small pill showing a directional change: "▲ +13% since last tracked".
// Neutral (flat / no data) renders muted; up is green, down is red.
export default function TrendPill({
  changePct,
  label,
  suffix,
}: {
  changePct: number | null | undefined;
  label?: string; // full override label; when absent, built from changePct + suffix
  suffix?: string; // e.g. "since last tracked"
}) {
  const has = changePct != null;
  const up = has && changePct! > 0;
  const down = has && changePct! < 0;
  const tone = up
    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
    : down
      ? 'bg-red-500/10 text-red-400 ring-red-500/20'
      : 'bg-white/[0.04] text-gray-400 ring-white/10';
  const arrow = up ? '▲' : down ? '▼' : '—';
  const text =
    label ??
    (has
      ? `${changePct! > 0 ? '+' : ''}${changePct}%${suffix ? ` ${suffix}` : ''}`
      : 'tracking');
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tone}`}
    >
      <span className="text-[9px] leading-none">{arrow}</span>
      {text}
    </span>
  );
}
