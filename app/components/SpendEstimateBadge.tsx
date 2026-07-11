import type { SpendEstimate } from '@/lib/adSpend';

const CONF_DOT: Record<SpendEstimate['confidence'], string> = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-gray-500',
};

export const SPEND_HELPER =
  'Estimated from ad volume, creative diversity, category, and revenue signals.';

// Confidence dot with a pure-CSS hover tooltip listing the estimate's
// explanation (why the band/confidence landed where it did). Old cached rows
// may predate the `explanation` field — fall back to the generic helper.
function ConfidenceDot({ estimate }: { estimate: SpendEstimate }) {
  const lines =
    Array.isArray(estimate.explanation) && estimate.explanation.length > 0
      ? estimate.explanation
      : null;
  return (
    <span className="group/dot relative inline-flex items-center">
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${CONF_DOT[estimate.confidence]}`}
        aria-label={`${estimate.confidence} confidence`}
      />
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full right-0 z-30 mb-2 w-60 rounded-lg border border-white/10 bg-[#171a24] p-3 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover/dot:visible group-hover/dot:opacity-100"
      >
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 capitalize">
          {estimate.confidence} confidence
        </span>
        {lines ? (
          <ul className="mt-1.5 space-y-1">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-gray-300">
                <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-gray-500" />
                <span className="normal-case">{l}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="mt-1.5 block text-[11px] leading-snug normal-case text-gray-300">
            {SPEND_HELPER}
          </span>
        )}
      </span>
    </span>
  );
}

// Estimated monthly ad spend band + confidence dot. `compact` renders just the
// label + hoverable dot for table cells; the full variant adds helper subtext.
export default function SpendEstimateBadge({
  estimate,
  compact = false,
}: {
  estimate: SpendEstimate | null | undefined;
  compact?: boolean;
}) {
  if (!estimate) {
    // Thin-data state: say why the cell is empty instead of a bare dash.
    return compact ? (
      <span className="text-[12px] text-gray-500" title="No spend estimate yet — needs observed ad activity.">—</span>
    ) : (
      <span className="text-sm font-medium text-gray-400">No data yet</span>
    );
  }
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{estimate.label}</span>
        <ConfidenceDot estimate={estimate} />
      </span>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-gray-900 tabular-nums">{estimate.label}</span>
        <ConfidenceDot estimate={estimate} />
      </div>
      <div className="mt-0.5 text-[10px] capitalize text-gray-400">
        {estimate.confidence} confidence · per month
      </div>
    </div>
  );
}
