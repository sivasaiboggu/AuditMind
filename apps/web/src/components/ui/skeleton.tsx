import { cn } from '../../lib/utils';

/** Shimmering placeholder block. Size it with width/height utilities. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton-shimmer rounded', className)} />;
}
