import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  // Solid brand button: white text on the indigo accent in both themes,
  // so the label stays readable where the old tinted style was a ghost.
  primary:
    'bg-accent-cyan text-white hover:bg-accent-cyan/90 active:bg-accent-cyan border border-accent-cyan shadow-card hover:shadow-lift',
  outline:
    'border border-overlay/10 bg-transparent text-text-secondary hover:text-text-primary hover:bg-overlay/5 hover:border-overlay/20',
  ghost:
    'border border-transparent bg-transparent text-text-secondary hover:text-text-primary hover:bg-overlay/5',
  danger:
    'bg-risk-critical/10 text-risk-critical border border-risk-critical/30 hover:bg-risk-critical/20 hover:border-risk-critical',
  subtle:
    'bg-overlay/5 text-text-secondary border border-overlay/10 hover:bg-overlay/10 hover:text-text-primary',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 min-h-8 text-xs',
  md: 'px-4 py-2 min-h-11 text-xs sm:text-sm',
  lg: 'px-6 py-3 text-sm',
  icon: 'h-9 w-9 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded font-mono font-bold uppercase tracking-wider precise-transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
