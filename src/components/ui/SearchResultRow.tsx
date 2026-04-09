import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface SearchResultRowProps {
    title: ReactNode;
    subtitle?: ReactNode;
    value?: ReactNode;
    meta?: ReactNode;
    detail?: ReactNode;
    onClick?: () => void;
    selected?: boolean;
    className?: string;
}

export function SearchResultRow({
    title,
    subtitle,
    value,
    meta,
    detail,
    onClick,
    selected = false,
    className,
}: SearchResultRowProps) {
    const content = (
        <div
            className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                selected
                    ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/12'
                    : 'border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-surface-hover)]',
                className
            )}
        >
            <div className="mb-1 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-medium text-[var(--color-foreground)]">{title}</h3>
                    {subtitle && <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{subtitle}</p>}
                </div>
                {(value || meta) && (
                    <div className="ml-2 text-right">
                        {value && <p className="text-lg font-semibold text-[var(--color-foreground)]">{value}</p>}
                        {meta && <p className="text-xs text-[var(--color-muted)]">{meta}</p>}
                    </div>
                )}
            </div>
            {detail && (
                <div className="mt-2 inline-block rounded bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-foreground)]">
                    {detail}
                </div>
            )}
        </div>
    );

    if (!onClick) return content;

    return (
        <button type="button" onClick={onClick} className="w-full">
            {content}
        </button>
    );
}
