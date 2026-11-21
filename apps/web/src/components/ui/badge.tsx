import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-overlay/15 text-text-muted bg-overlay/5',
  success: 'border-risk-low/30 text-risk-low bg-risk-low/5',
  info: 'border-accent-cyan/30 text-accent-cyan bg-accent-cyan/5',
  warning: 'border-risk-medium/30 text-risk-medium bg-risk-medium/5',
  danger: 'border-risk-critical/30 text-risk-critical bg-risk-critical/5',
  critical: 'border-risk-critical/30 text-risk-critical bg-risk-critical/5',
  high: 'border-risk-high/30 text-risk-high bg-risk-high/5',
  medium: 'border-risk-medium/30 text-risk-medium bg-risk-medium/5',
  low: 'border-risk-low/30 text-risk-low bg-risk-low/5',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
