import { useEffect, useCallback, useMemo } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import type { Item, ItemInput } from '../../types';
import type { StagedChange } from '../../hooks/useBulkEdit';

interface BulkEditTableProps {
    items: Item[];
    categories: string[];
    stagedChanges: Map<string, Map<string, StagedChange>>;
    onStageChange: (itemId: string, field: keyof ItemInput, newValue: unknown, originalValue: unknown) => void;
    onEscapePressed: () => void;
}

export function BulkEditTable({
    items,
    categories,
    stagedChanges,
    onStageChange,
    onEscapePressed,
}: BulkEditTableProps) {
    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onEscapePressed();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onEscapePressed]);

    const categoryOptions = useMemo(() =>
        categories.map((name) => ({ value: name, label: name })),
        [categories]
    );

    const statusOptions = [
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Inactive' },
    ];

    const getFieldValue = useCallback((item: Item, field: keyof ItemInput) => {
        const itemChanges = stagedChanges.get(item.id);
        if (itemChanges?.has(field)) {
            return itemChanges.get(field)!.newValue;
        }
        return item[field as keyof Item];
    }, [stagedChanges]);

    const hasItemChanges = useCallback((itemId: string) => {
        const changes = stagedChanges.get(itemId);
        return !!changes && changes.size > 0;
    }, [stagedChanges]);

    return (
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-white">
            {/* Header info */}
            <div className="px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SpreadsheetIcon />
                    <span className="text-sm font-medium text-[var(--color-foreground)]">
                        Editing {items.length} items
                    </span>
                </div>
                <span className="text-xs text-[var(--color-muted)]">
                    Press <kbd className="px-1.5 py-0.5 bg-[var(--color-border)] rounded text-[10px] font-mono">Esc</kbd> to exit
                </span>
            </div>

            {/* Spreadsheet table */}
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider w-[200px]">
                                Item
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider w-[100px]">
                                SKU
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider w-[120px]">
                                Price
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider w-[100px]">
                                Quantity
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider w-[150px]">
                                Category
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider w-[120px]">
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                        {items.map((item) => {
                            const hasChanges = hasItemChanges(item.id);
                            return (
                                <tr
                                    key={item.id}
                                    className={`
                                        transition-colors
                                        ${hasChanges
                                            ? 'bg-amber-50 hover:bg-amber-100'
                                            : 'bg-white hover:bg-[var(--color-surface-hover)]'
                                        }
                                    `}
                                >
                                    {/* Item name (read-only) */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-[var(--color-surface)] flex-shrink-0 flex items-center justify-center border border-[var(--color-border)]">
                                                {item.image_url ? (
                                                    <img
                                                        src={item.image_url}
                                                        alt={item.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <ImagePlaceholderIcon />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                                                    {item.name}
                                                </p>
                                                {item.variant && (
                                                    <p className="text-xs text-[var(--color-muted)] truncate">
                                                        {item.variant}
                                                    </p>
                                                )}
                                            </div>
                                            {hasChanges && (
                                                <Badge variant="warning" className="ml-auto flex-shrink-0">
                                                    Modified
                                                </Badge>
                                            )}
                                        </div>
                                    </td>

                                    {/* SKU (read-only) */}
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                                            {item.sku}
                                        </span>
                                    </td>

                                    {/* Price (editable) */}
                                    <td className="px-4 py-3">
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] text-sm">
                                                $
                                            </span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={String(getFieldValue(item, 'price'))}
                                                onChange={(e) => {
                                                    const newValue = parseFloat(e.target.value) || 0;
                                                    onStageChange(item.id, 'price', newValue, item.price);
                                                }}
                                                inputSize="sm"
                                                className="pl-6 w-24"
                                            />
                                        </div>
                                    </td>

                                    {/* Quantity (editable) */}
                                    <td className="px-4 py-3">
                                        <Input
                                            type="number"
                                            min="0"
                                            value={String(getFieldValue(item, 'quantity'))}
                                            onChange={(e) => {
                                                const newValue = parseInt(e.target.value) || 0;
                                                onStageChange(item.id, 'quantity', newValue, item.quantity);
                                            }}
                                            inputSize="sm"
                                            className="w-20"
                                        />
                                    </td>

                                    {/* Category (editable) */}
                                    <td className="px-4 py-3">
                                        <Select
                                            options={categoryOptions}
                                            value={String(getFieldValue(item, 'category'))}
                                            onChange={(e) => {
                                                onStageChange(item.id, 'category', e.target.value, item.category);
                                            }}
                                            selectSize="sm"
                                        />
                                    </td>

                                    {/* Status (editable) */}
                                    <td className="px-4 py-3">
                                        <Select
                                            options={statusOptions}
                                            value={String(getFieldValue(item, 'is_listed'))}
                                            onChange={(e) => {
                                                const newValue = e.target.value === 'true';
                                                onStageChange(item.id, 'is_listed', newValue, item.is_listed);
                                            }}
                                            selectSize="sm"
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SpreadsheetIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--color-primary)]"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
            <path d="M9 3v18" />
        </svg>
    );
}

function ImagePlaceholderIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
    );
}
