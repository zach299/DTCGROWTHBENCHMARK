import type { SpendEstimate } from '@/lib/adSpend';

const CONF_DOT: Record<SpendEstimate['confidence'], string> = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-gray-500',
};

export const SPEND_HELPER =
  'Estimated from ad volume, creative diversity, category, and revenue signals.';

// Estimated monthly ad spend band + confidence dot. `compact` renders just the
// label + dot for table cells; the full variant adds the helper subtext.
export default function SpendEstimateBadge({
  estimate,
  compact = false,
}: {
  estimate: SpendEstimate | null | undefined;
  compact?: boolean;
}) {
  if (!estimate) {
    return <span className="text-sm text-gray-500">—</span>;
  }
  const dot = (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${CONF_DOT[estimate.confidence]}`}
      title={`${estimate.confidence} confidence · ${SPEND_HELPER}`}
    />
  );
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={SPEND_HELPER}>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">{estimate.label}</span>
        {dot}
      </span>
    );
  }
  return (
    <div title={SPEND_HELPER}>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-gray-900 tabular-nums">{estimate.label}</span>
        {dot}
      </div>
      <div className="mt-0.5 text-[10px] capitalize text-gray-400">
        {estimate.confidence} confidence · per month
      </div>
    </div>
  );
}
