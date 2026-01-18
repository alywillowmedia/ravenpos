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
                'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
                'pb-6 mb-6 border-b border-[var(--color-border)]',
                className
            )}
        >
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                        {description}
                    </p>
                )}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
    );
}
