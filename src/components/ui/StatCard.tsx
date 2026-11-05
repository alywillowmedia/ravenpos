import { type ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '../../lib/utils';

export interface StatCardProps {
    label: ReactNode;
    value: ReactNode;
    subtext?: ReactNode;
    className?: string;
}

export function StatCard({ label, value, subtext, className }: StatCardProps) {
    return (
        <Card className={cn('flex h-full flex-col gap-1.5', className)}>
            <div className="text-[13px] text-[var(--color-muted)]">{label}</div>
            <div className="break-words text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--color-foreground)]">
                {value}
            </div>
            {subtext && <div className="mt-1 text-[12.5px] text-[var(--color-muted)]">{subtext}</div>}
        </Card>
    );
}
