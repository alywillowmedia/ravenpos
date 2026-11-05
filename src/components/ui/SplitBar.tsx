import { toSplitBarSegments, type SplitBarPart } from '../../lib/splitBar';
import { cn } from '../../lib/utils';

export interface SplitBarProps {
    parts: [SplitBarPart] | [SplitBarPart, SplitBarPart] | [SplitBarPart, SplitBarPart, SplitBarPart];
    label: string;
    className?: string;
}

const toneColors: Record<SplitBarPart['tone'], string> = {
    1: 'bg-[var(--color-chart-1)]',
    2: 'bg-[var(--color-chart-2)]',
    3: 'bg-[var(--color-chart-3)]',
};

export function SplitBar({ parts, label, className }: SplitBarProps) {
    const segments = toSplitBarSegments(parts);
    const description = `${label}: ${parts.map((part) => `${part.label} ${part.display}`).join(', ')}`;

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
                {parts.map((part) => (
                    <span key={part.label} className="inline-flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', toneColors[part.tone])} aria-hidden="true" />
                        {part.label}
                        <span className="font-semibold text-[var(--color-foreground)]">{part.display}</span>
                    </span>
                ))}
            </div>
            <div role="img" aria-label={description} className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                {segments.length === 0 ? (
                    <span className="w-full bg-[var(--color-track)]" />
                ) : segments.map((segment) => (
                    <span
                        key={segment.label}
                        className={cn('min-w-1', toneColors[segment.tone])}
                        style={{ flexGrow: segment.share }}
                    />
                ))}
            </div>
        </div>
    );
}
