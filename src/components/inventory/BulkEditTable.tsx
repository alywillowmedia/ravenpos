import { useEffect, useCallback, useMemo, useState } from 'react';
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
    const [bulkQuantity, setBulkQuantity] = useState('');

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

    const applyQuantityToAll = useCallback(() => {
        const parsedQuantity = Number.parseInt(bulkQuantity, 10);
        if (Number.isNaN(parsedQuantity) || parsedQuantity < 0) return;

        items.forEach((item) => {
            onStageChange(item.id, 'quantity', parsedQuantity, item.quantity);
        });
    }, [bulkQuantity, items, onStageChange]);

    return (
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-card)]">
            {/* Header info */}
            <div className="px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    <SpreadsheetIcon />
                    <div className="min-w-0">
                        <span className="text-sm font-medium text-[var(--color-foreground)]">
                            Editing {items.length} items
                        </span>
                        <p className="text-xs text-[var(--color-muted)]">
                            Shelf Description feeds the smaller text on shelf tags.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Set qty for all:</span>
                        <Input
                            type="number"
                            min="0"
                            value={bulkQuantity}
                            onChange={(e) => setBulkQuantity(e.target.value)}
                            inputSize="sm"
                            className="w-24"
                            placeholder="0"
                        />
                        <button
                            type="button"
                            onClick={applyQuantityToAll}
                            disabled={bulkQuantity.trim() === '' || Number.parseInt(bulkQuantity, 10) < 0}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] hover:bg-[var(--color-surface)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Apply
                        </button>
                    </div>
                    <span className="text-xs text-[var(--color-muted)]">
                        Press <kbd className="px-1.5 py-0.5 bg-[var(--color-border)] rounded text-[10px] font-mono">Esc</kbd> to exit
                    </span>
                </div>
            </div>

            {/* Spreadsheet table */}
            <div className="overflow-auto max-h-[66vh]">
                <table className="w-full min-w-[1120px] table-fixed">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                            <th className="sticky left-0 z-20 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[220px]">
                                Item
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[110px]">
                                SKU
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[260px]">
                                Shelf Description
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[108px]">
                                Price
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[86px]">
                                Qty
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[160px]">
                                Category
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider w-[112px]">
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
                                            ? 'bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning-bg)]/80'
                                            : 'bg-[var(--color-card)] hover:bg-[var(--color-surface-hover)]'
                                        }
                                    `}
                                >
                                    {/* Item name (read-only) */}
                                    <td className={`sticky left-0 z-[1] px-3 py-2 ${hasChanges ? 'bg-[var(--color-warning-bg)]' : 'bg-[var(--color-card)]'}`}>
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
                                                {item.category && (
                                                    <p className="text-xs text-[var(--color-muted)] truncate">
                                                        {item.category}
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
                                    <td className="px-3 py-2">
                                        <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                                            {item.sku}
                                        </span>
                                    </td>

                                    {/* Shelf description / variant summary (editable) */}
                                    <td className="px-3 py-2">
                                        <textarea
                                            value={String(getFieldValue(item, 'variant_summary') ?? '')}
                                            maxLength={25}
                                            rows={2}
                                            onChange={(e) => {
                                                const newValue = e.target.value.slice(0, 25);
                                                onStageChange(
                                                    item.id,
                                                    'variant_summary',
                                                    newValue || null,
                                                    item.variant_summary
                                                );
                                            }}
                                            className="min-h-[42px] w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-1.5 text-sm text-[var(--color-foreground)] outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                            placeholder="Smaller shelf tag text"
                                        />
                                        <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                                            {String(getFieldValue(item, 'variant_summary') ?? '').length}/25
                                        </p>
                                    </td>

                                    {/* Price (editable) */}
                                    <td className="px-3 py-2">
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
                                                className="pl-6 w-full"
                                            />
                                        </div>
                                    </td>

                                    {/* Quantity (editable) */}
                                    <td className="px-3 py-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            value={String(getFieldValue(item, 'quantity'))}
                                            onChange={(e) => {
                                                const newValue = parseInt(e.target.value) || 0;
                                                onStageChange(item.id, 'quantity', newValue, item.quantity);
                                            }}
                                            inputSize="sm"
                                            className="w-full"
                                        />
                                    </td>

                                    {/* Category (editable) */}
                                    <td className="px-3 py-2">
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
                                    <td className="px-3 py-2">
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
