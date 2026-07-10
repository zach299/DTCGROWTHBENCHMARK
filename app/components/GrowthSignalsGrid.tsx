import type { SignalCategory } from '@/lib/signals';

// "Growth Signals" grid — the composite-intelligence view. Live categories
// show their contributing metrics; coming-soon categories render greyed but
// intentional (they communicate roadmap, not breakage).
export default function GrowthSignalsGrid({ categories }: { categories: SignalCategory[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat) =>
        cat.status === 'live' ? (
          <div
            key={cat.key}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{cat.label}</h4>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/30">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{cat.blurb}</p>
            {cat.metrics.length > 0 && (
              <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
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
            )}
          </div>
        ) : (
          <div
            key={cat.key}
            className="rounded-2xl border border-dashed border-gray-200/70 bg-white/50 p-4 opacity-70"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-500">{cat.label}</h4>
              <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 ring-1 ring-gray-400/30">
                Coming soon
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{cat.blurb}</p>
          </div>
        )
      )}
    </div>
  );
}
