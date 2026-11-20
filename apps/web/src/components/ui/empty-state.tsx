import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-overlay/10 bg-overlay/5 text-text-muted">
          {icon}
        </div>
      ) : null}
      <p className="font-mono text-sm font-bold uppercase tracking-widest text-text-primary">
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-text-secondary">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
