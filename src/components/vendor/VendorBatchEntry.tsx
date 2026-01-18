import { useState, useRef, KeyboardEvent } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import type { Item } from '../../types';

interface VendorBatchEntryProps {
    categories: string[];
    onSubmit: (items: Partial<Item>[]) => Promise<{ error: string | null }>;
    onCancel: () => void;
}

interface BatchRow {
    id: string;
    sku: string;
    name: string;
    variant: string;
    category: string;
    quantity: number;
    price: number;
}

const createEmptyRow = (): BatchRow => ({
    id: Math.random().toString(36).substring(7),
    sku: '',
    name: '',
    variant: '',
    category: 'Other',
    quantity: 1,
    price: 0,
});

export function VendorBatchEntry({ categories, onSubmit, onCancel }: VendorBatchEntryProps) {
    const [rows, setRows] = useState<BatchRow[]>([createEmptyRow()]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const updateRow = (id: string, field: keyof BatchRow, value: string | number) => {
        setRows((prev) =>
            prev.map((row) =>
                row.id === id ? { ...row, [field]: value } : row
            )
        );
    };

    const addRow = () => {
        setRows((prev) => [...prev, createEmptyRow()]);
        // Focus the new row's name input after render
        setTimeout(() => {
            const inputs = containerRef.current?.querySelectorAll('input[data-field="name"]');
            const lastInput = inputs?.[inputs.length - 1] as HTMLInputElement;
            lastInput?.focus();
        }, 0);
    };

    const removeRow = (id: string) => {
        if (rows.length === 1) {
            setRows([createEmptyRow()]);
        } else {
            setRows((prev) => prev.filter((row) => row.id !== id));
        }
    };

    const handleKeyDown = (e: KeyboardEvent, rowId: string, field: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const rowIndex = rows.findIndex((r) => r.id === rowId);

            // If on last row and pressing enter in price field, add new row
            if (field === 'price' && rowIndex === rows.length - 1) {
                addRow();
            } else {
                // Move to next field or next row
                const allInputs = containerRef.current?.querySelectorAll('input, select');
                const currentIndex = Array.from(allInputs || []).findIndex(
                    (el) => el === document.activeElement
                );
                const nextInput = allInputs?.[currentIndex + 1] as HTMLElement;
                nextInput?.focus();
            }
        }
    };

    const handleSubmit = async () => {
        setError(null);

        const validRows = rows.filter((row) => row.name.trim() && row.price > 0);

        if (validRows.length === 0) {
            setError('Please add at least one item with a name and price');
            return;
        }

        setIsSubmitting(true);
        const result = await onSubmit(validRows);
        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
        // Parent will close modal on success
    };

    const categoryOptions = categories.map((name) => ({
        value: name,
        label: name,
    }));

    const validCount = rows.filter((row) => row.name.trim() && row.price > 0).length;

    return (
        <div ref={containerRef}>
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-3">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-[var(--color-muted)] px-1">
                    <div className="col-span-2">SKU</div>
                    <div className="col-span-2">Name *</div>
                    <div className="col-span-2">Variant</div>
                    <div className="col-span-2">Category</div>
                    <div className="col-span-1">Qty</div>
                    <div className="col-span-2">Price *</div>
                    <div className="col-span-1"></div>
                </div>

                {/* Rows */}
                {rows.map((row) => (
                    <div
                        key={row.id}
                        className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-[var(--color-surface-hover)]/50 hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                        <div className="col-span-12 sm:col-span-2">
                            <Input
                                data-field="sku"
                                placeholder="Auto"
                                value={row.sku}
                                onChange={(e) => updateRow(row.id, 'sku', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'sku')}
                                inputSize="sm"
                                className="font-mono"
                            />
                        </div>
                        <div className="col-span-12 sm:col-span-2">
                            <Input
                                data-field="name"
                                placeholder="Item name"
                                value={row.name}
                                onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'name')}
                                inputSize="sm"
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                            <Input
                                placeholder="Size, color..."
                                value={row.variant}
                                onChange={(e) => updateRow(row.id, 'variant', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'variant')}
                                inputSize="sm"
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                            <Select
                                options={categoryOptions}
                                value={row.category}
                                onChange={(e) => updateRow(row.id, 'category', e.target.value)}
                                selectSize="sm"
                            />
                        </div>
                        <div className="col-span-4 sm:col-span-1">
                            <Input
                                type="number"
                                min="1"
                                placeholder="Qty"
                                value={row.quantity}
                                onChange={(e) => updateRow(row.id, 'quantity', parseInt(e.target.value) || 1)}
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'quantity')}
                                inputSize="sm"
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={row.price || ''}
                                onChange={(e) => updateRow(row.id, 'price', parseFloat(e.target.value) || 0)}
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'price')}
                                inputSize="sm"
                                leftIcon={<span className="text-[var(--color-muted)] text-xs">$</span>}
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end">
                            <button
                                onClick={() => removeRow(row.id)}
                                className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                                title="Remove row"
                            >
                                <XIcon />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <Button variant="ghost" size="sm" onClick={addRow}>
                    <PlusIcon />
                    Add Row
                </Button>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--color-muted)]">
                        {validCount} item{validCount !== 1 ? 's' : ''} ready
                    </span>
                    <Button variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={validCount === 0}>
                        Save All Items
                    </Button>
                </div>
            </div>

            <p className="mt-4 text-xs text-[var(--color-muted)]">
                Tip: Press Enter to move to the next field. Press Enter on the last field to add a new row.
            </p>
        </div>
    );
}

function PlusIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}
