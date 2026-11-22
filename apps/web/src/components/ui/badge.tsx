import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger' | 'critical' | 'high' | 'medium' | 'low';

const tones: Record<BadgeTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-risk-low',
  info: 'text-accent-brand',
  warning: 'text-risk-medium',
  danger: 'text-risk-critical',
  critical: 'text-risk-critical',
  high: 'text-risk-high',
  medium: 'text-risk-medium',
  low: 'text-risk-low',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { tone?: BadgeTone }

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold', tones[tone], className)} {...props} />;
}
