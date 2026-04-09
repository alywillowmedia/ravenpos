import { type ReactNode } from 'react';
import { Card, CardContent } from './Card';
import { cn } from '../../lib/utils';

export interface StatCardProps {
    label: ReactNode;
    value: ReactNode;
    subtext?: ReactNode;
    icon?: ReactNode;
    highlight?: boolean;
    trend?: ReactNode;
    className?: string;
}

export function StatCard({
    label,
    value,
    subtext,
    icon,
    highlight = false,
    trend,
    className,
}: StatCardProps) {
    return (
        <Card
            variant="elevated"
            className={cn(
                'h-full min-h-[120px]',
                highlight && 'ring-2 ring-[var(--color-primary)]/20',
                className
            )}
        >
            <CardContent className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm text-[var(--color-muted)]">{label}</p>
                        <p
                            className={cn(
                                'mt-1 text-2xl font-bold leading-tight break-words',
                                highlight ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
                            )}
                        >
                            {value}
                        </p>
                    </div>
                    {icon && (
                        <div className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</div>
                    )}
                </div>
                {(subtext || trend) && (
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                        {subtext ? (
                            <p className="text-xs text-[var(--color-muted-foreground)]">{subtext}</p>
                        ) : <span />}
                        {trend}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
