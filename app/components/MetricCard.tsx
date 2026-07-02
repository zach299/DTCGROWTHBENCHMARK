import type { ReactNode } from 'react';

// One cell in the scannable top-metrics row of a company report.
export default function MetricCard({
  label,
  children,
  sub,
}: {
  label: string;
  children: ReactNode; // the big value (text or richer node)
  sub?: ReactNode; // secondary line under the value
}) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
      {sub != null && <div className="mt-1 text-[11px] leading-tight text-gray-400">{sub}</div>}
    </div>
  );
}
