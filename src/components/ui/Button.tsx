import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { LoadingSpinner } from './LoadingSpinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    isLoading?: boolean;
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
        hover:bg-[#dc2626]
        focus-visible:ring-[var(--color-danger)]
        shadow-sm hover:shadow-md
      `,
            success: `
        bg-[var(--color-success)] text-white
        hover:bg-[#059669]
        focus-visible:ring-[var(--color-success)]
        shadow-sm hover:shadow-md
      `,
        };

        const sizes = {
            sm: 'h-8 px-3 text-sm',
            md: 'h-10 px-4 text-sm',
            lg: 'h-11 px-5 text-base',
            xl: 'h-14 px-8 text-lg',
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variants[variant], sizes[size], className)}
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
