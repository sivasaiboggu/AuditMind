import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary: 'action-primary',
  outline: 'action-outline',
  ghost: 'action-ghost',
  danger: 'action-danger',
  subtle: 'action-outline bg-background-base',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-sm',
  md: '',
  lg: 'min-h-12 px-6',
  icon: 'size-11 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn('action', variants[variant], sizes[size], className)} {...props} />
  ),
);
Button.displayName = 'Button';
