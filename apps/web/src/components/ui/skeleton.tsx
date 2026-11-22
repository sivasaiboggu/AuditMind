import { cn } from '../../lib/utils';

/** Static placeholder block. Size it with width/height utilities. A
 * loading block is a state, not a decoration — no animation on it. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded bg-overlay/5', className)} />;
}
