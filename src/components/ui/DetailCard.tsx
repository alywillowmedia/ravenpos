import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from './Card';
import { DetailRow, type DetailRowProps } from './DetailRow';

export interface DetailCardItem extends Omit<DetailRowProps, 'className'> {
    key?: string;
}

export interface DetailCardProps {
    title?: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    items?: DetailCardItem[];
    children?: ReactNode;
    compact?: boolean;
    className?: string;
}

export function DetailCard({
    title,
    subtitle,
    actions,
    items,
    children,
    compact = false,
    className,
}: DetailCardProps) {
    return (
        <Card variant="outlined" className={cn('h-full', className)}>
            <CardContent className={cn(compact ? 'p-4' : 'p-5')}>
                {(title || subtitle || actions) && (
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            {title && (
                                <h3 className="text-base font-semibold text-[var(--color-foreground)]">
                                    {title}
                                </h3>
                            )}
                            {subtitle && (
                                <p className="mt-1 text-sm text-[var(--color-muted)]">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        {actions && <div className="shrink-0">{actions}</div>}
                    </div>
                )}

                {items && items.length > 0 ? (
                    <div className="w-full">
                        {items.map((item, index) => (
                            <DetailRow
                                key={item.key || `${String(item.label)}-${index}`}
                                label={item.label}
                                value={item.value}
                                description={item.description}
                                leftMeta={item.leftMeta}
                                rightMeta={item.rightMeta}
                                tone={item.tone}
                                size={item.size || (compact ? 'sm' : 'md')}
                            />
                        ))}
                    </div>
                ) : (
                    children
                )}
            </CardContent>
        </Card>
    );
}
