import type { ReactNode } from 'react';

// Polished empty state used across async surfaces. Keep copy helpful and
// specific — an empty table should tell the user how to fill it.
export default function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 ${compact ? 'py-6' : 'py-14'} text-center ${className}`}>
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20">
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-gray-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
