import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { LoadingSpinner } from './LoadingSpinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'dangerQuiet' | 'success';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    isLoading?: boolean;
    fullWidth?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = 'primary',
            size = 'md',
            isLoading = false,
            fullWidth = false,
            disabled,
            leftIcon,
            rightIcon,
            children,
            ...props
        },
        ref
    ) => {
        const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-semibold rounded-lg
      transition-[background-color,opacity,transform] duration-200 ease-[var(--dw-ease)]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]
      disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
      active:scale-[0.98]
      touch-manipulation tap-highlight-none select-none
    `;

        const variants = {
            primary: `
        bg-[var(--color-primary)] text-[var(--color-primary-foreground)]
        hover:bg-[var(--color-primary-hover)]
        focus-visible:ring-[var(--color-primary)]

      `,
            secondary: `
        bg-[var(--color-card)] text-[var(--color-foreground)]
        border border-[var(--color-border-strong)]
        hover:bg-[var(--color-surface-hover)]
        focus-visible:ring-[var(--color-ring)]
      `,
            soft: `
        bg-[var(--color-primary-soft)] text-[var(--color-primary)]
        hover:brightness-95
        focus-visible:ring-[var(--color-ring)]
      `,
            ghost: `
        text-[var(--color-muted)]
        hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]
        focus-visible:ring-[var(--color-ring)]
      `,
            dangerQuiet: `
        text-[var(--color-danger)]
        border border-[var(--color-border-strong)]
        hover:bg-[var(--color-danger-bg)]
        focus-visible:ring-[var(--color-danger)]
      `,
            danger: `
        bg-[var(--color-danger)] text-[var(--color-danger-foreground)]
        hover:bg-[var(--color-danger-hover)]
        focus-visible:ring-[var(--color-danger)]

      `,
            success: `
        bg-[var(--color-success)] text-[var(--color-success-foreground)]
        hover:bg-[var(--color-success-hover)]
        focus-visible:ring-[var(--color-success)]

      `,
        };

        const sizes = {
            sm: 'h-9 min-h-[36px] px-3 text-sm',
            md: 'h-11 min-h-[44px] px-4 text-sm',
            lg: 'h-12 min-h-[48px] px-5 text-base',
            xl: 'h-14 min-h-[56px] px-8 text-lg',
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variants[variant], sizes[size], fullWidth && 'w-full', className)}
                disabled={disabled || isLoading}
                aria-busy={isLoading || undefined}
                {...props}
            >
                {isLoading ? (
                    <LoadingSpinner size={size === 'sm' ? 14 : size === 'xl' ? 20 : 16} />
                ) : leftIcon ? (
                    leftIcon
                ) : null}
                {children}
                {!isLoading && rightIcon}
            </button>
        );
    }
);

Button.displayName = 'Button';
