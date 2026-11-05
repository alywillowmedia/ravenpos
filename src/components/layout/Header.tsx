import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface HeaderProps {
    title: string;
    description?: string;
    actions?: ReactNode;
    className?: string;
}

export function Header({ title, description, actions, className }: HeaderProps) {
    return (
        <div
            className={cn(
                'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
                'mb-5',
                className
            )}
        >
            <div className="min-w-0">
                <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-[var(--color-foreground)]">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                        {description}
                    </p>
                )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
        </div>
    );
}
