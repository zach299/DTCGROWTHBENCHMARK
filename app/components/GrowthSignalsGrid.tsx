import type { SignalCategory } from '@/lib/signals';

// "Growth Signals" — the composite-intelligence view, simplified.
// LIVE categories render as compact metric cards sized to their content.
// Everything not yet live collapses into a single unobtrusive chip row —
// roadmap communication, never a wall of grey placeholder tiles.
export default function GrowthSignalsGrid({ categories }: { categories: SignalCategory[] }) {
  const live = categories.filter((c) => c.status === 'live');
  const upcoming = categories.filter((c) => c.status !== 'live');

  return (
    <div className="space-y-4">
      {live.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((cat) => (
            <div
              key={cat.key}
              className="self-start rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-gray-900" title={cat.blurb}>
                  {cat.label}
                </h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/30">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>
              {cat.metrics.length > 0 ? (
                <dl className="mt-3 space-y-1.5">
                  {cat.metrics.map((m) => (
                    <div key={m.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[12px] text-gray-500">{m.label}</dt>
                      <dd
                        className={`text-[12px] font-semibold tabular-nums ${
                          m.tone === 'positive'
                            ? 'text-emerald-500'
                            : m.tone === 'muted'
                              ? 'text-gray-400'
                              : 'text-gray-900'
                        }`}
                      >
                        {m.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[12px] text-gray-500">{cat.blurb}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200/60 bg-white/40 px-3.5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            More signals coming
          </span>
          {upcoming.map((cat) => (
            <span
              key={cat.key}
              title={cat.blurb}
              className="inline-flex items-center rounded-full bg-gray-500/10 px-2.5 py-1 text-[11px] font-medium text-gray-400 ring-1 ring-gray-400/20"
            >
              {cat.key === 'hiring' ? 'Hiring Velocity — populates on next refresh' : cat.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
