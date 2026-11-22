import { cn } from '../../lib/utils';

export function Spinner({
  className,
  label = 'Loading',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-brand/30 border-t-accent-brand',
        className,
      )}
    />
  );
}
