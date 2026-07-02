import type { ReactNode } from 'react';

// One cell in the scannable top-metrics row of a company report.
export default function MetricCard({
  label,
  icon,
  children,
  sub,
  footer,
}: {
  label: string;
  icon?: ReactNode; // small colored icon beside the label
  children: ReactNode; // the big value (text or richer node)
  sub?: ReactNode; // secondary line under the value
  footer?: ReactNode; // pinned bottom element (e.g. progress bar)
}) {
  return (
    <div className="relative min-w-0 px-5 py-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {icon}
        {label}
      </div>
      <div className="min-w-0">{children}</div>
      {sub != null && <div className="mt-1 text-[11px] leading-tight text-gray-400">{sub}</div>}
      {footer}
    </div>
  );
}
