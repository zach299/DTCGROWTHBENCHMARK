// Loading skeleton block. Uses a CSS var-driven color so it reads correctly on
// the dark surface (see .gs-skeleton in globals.css).
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`gs-skeleton animate-pulse rounded-md ${className}`} />;
}
