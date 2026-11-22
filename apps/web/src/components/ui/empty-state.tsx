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
    <div className={cn('px-4 py-8 sm:px-6 sm:py-12', className)}>
      <div className="margin-note flex flex-col items-start gap-3">
        {icon && <span className="text-text-muted" aria-hidden="true">{icon}</span>}
        <p className="text-xl font-semibold tracking-tight">{title}</p>
        {description && <p className="reading text-text-secondary">{description}</p>}
        {action}
      </div>
    </div>
  );
}
