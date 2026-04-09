import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { LoadingSpinner } from './LoadingSpinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
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
      font-medium rounded-lg
      transition-all duration-150 ease-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
      active:scale-[0.98]
      touch-manipulation tap-highlight-none select-none
    `;

        const variants = {
            primary: `
        bg-[var(--color-primary)] text-white
        hover:bg-[var(--color-primary-hover)]
        focus-visible:ring-[var(--color-primary)]
        shadow-sm hover:shadow-md
      `,
            secondary: `
        bg-[var(--color-surface)] text-[var(--color-foreground)]
        border border-[var(--color-border)]
        hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-muted-foreground)]
        focus-visible:ring-[var(--color-ring)]
      `,
            ghost: `
        text-[var(--color-foreground)]
        hover:bg-[var(--color-surface-hover)]
        focus-visible:ring-[var(--color-ring)]
      `,
            danger: `
        bg-[var(--color-danger)] text-white
        hover:bg-[var(--color-danger-hover)]
        focus-visible:ring-[var(--color-danger)]
        shadow-sm hover:shadow-md
      `,
            success: `
        bg-[var(--color-success)] text-white
        hover:bg-[var(--color-success-hover)]
        focus-visible:ring-[var(--color-success)]
        shadow-sm hover:shadow-md
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
