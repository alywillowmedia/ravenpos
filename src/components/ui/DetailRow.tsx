import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type DetailTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type DetailSize = 'sm' | 'md';

export interface DetailRowProps {
    label: ReactNode;
    value: ReactNode;
    description?: ReactNode;
    leftMeta?: ReactNode;
    rightMeta?: ReactNode;
    tone?: DetailTone;
    size?: DetailSize;
    className?: string;
}

const toneClasses: Record<DetailTone, string> = {
    default: 'text-[var(--color-foreground)]',
    success: 'text-[var(--color-success)]',
    warning: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]',
    info: 'text-[var(--color-info)]',
};

const sizeClasses: Record<DetailSize, string> = {
    sm: 'py-2',
    md: 'py-3',
};

export function DetailRow({
    label,
    value,
    description,
    leftMeta,
    rightMeta,
    tone = 'default',
    size = 'md',
    className,
}: DetailRowProps) {
    return (
        <div
            className={cn(
                'flex w-full flex-col gap-1 border-b border-[var(--color-border)] last:border-b-0',
                sizeClasses[size],
                className
            )}
        >
            <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="min-w-[140px] flex-1 text-sm text-[var(--color-muted)]">{label}</div>
                <div className={cn('text-sm font-medium text-right break-words', toneClasses[tone])}>
                    {value}
                </div>
            </div>
            {(description || leftMeta || rightMeta) && (
                <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
                    <div className="break-words">{description || leftMeta}</div>
                    {rightMeta && <div className="ml-auto">{rightMeta}</div>}
                </div>
            )}
        </div>
    );
}
