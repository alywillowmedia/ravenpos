import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps {
    children: ReactNode;
    className?: string;
    variant?: 'default' | 'elevated' | 'outlined' | 'inset';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
    children,
    className,
    variant = 'default',
    padding = 'md',
}: CardProps) {
    const variants = {
        default: 'bg-[var(--color-card)] shadow-[var(--shadow-surface)]',
        elevated: 'bg-[var(--color-card)] shadow-[var(--shadow-surface)]',
        outlined: 'bg-[var(--color-card)] border border-[var(--color-border)]',
        inset: 'bg-[var(--color-surface)]',
    };

    const paddings = {
        none: '',
        sm: 'p-3',
        md: 'p-5',
        lg: 'p-6',
    };

    return (
        <div
            className={cn(
                'rounded-xl',
                variants[variant],
                paddings[padding],
                className
            )}
        >
            {children}
        </div>
    );
}

export interface CardHeaderProps {
    children: ReactNode;
    className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
    return (
        <div className={cn('mb-4', className)}>
            {children}
        </div>
    );
}

export interface CardTitleProps {
    children: ReactNode;
    className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
    return (
        <h3 className={cn('text-base font-semibold tracking-[-0.01em] text-[var(--color-foreground)]', className)}>
            {children}
        </h3>
    );
}

export interface CardDescriptionProps {
    children: ReactNode;
    className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
    return (
        <p className={cn('text-sm text-[var(--color-muted)] mt-1', className)}>
            {children}
        </p>
    );
}

export interface CardContentProps {
    children: ReactNode;
    className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
    return <div className={className}>{children}</div>;
}

export interface CardFooterProps {
    children: ReactNode;
    className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
    return (
        <div className={cn('mt-4 pt-4 border-t border-[var(--color-border)]', className)}>
            {children}
        </div>
    );
}
