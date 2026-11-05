import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
    children: ReactNode;
    variant?: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
    size?: 'sm' | 'md';
    dot?: boolean;
    className?: string;
}

export function Badge({
    children,
    variant = 'default',
    size = 'md',
    dot = false,
    className,
}: BadgeProps) {
    const variants = {
        default: 'bg-[var(--color-surface)] text-[var(--color-muted)]',
        secondary: 'bg-[var(--color-muted)]/10 text-[var(--color-muted)]',
        success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
        warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
        danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
        info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
    };

    const sizes = {
        sm: 'px-1.5 py-0.5 text-xs',
        md: 'min-h-[26px] px-2.5 py-1 text-xs',
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 font-semibold rounded-full',
                variants[variant],
                sizes[size],
                className
            )}
        >
            {dot && <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />}
            {children}
        </span>
    );
}
