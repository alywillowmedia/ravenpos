import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface SectionHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function SectionHeader({
    title,
    description,
    actions,
    className,
}: SectionHeaderProps) {
    return (
        <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
            <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[var(--color-foreground)]">{title}</h2>
                {description && (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
                )}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
        </div>
    );
}
