import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, CircleAlert, Image as ImageIcon, Minus, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { useInventory } from '../hooks/useInventory';
import { cn } from '../lib/utils';
import type { Item } from '../types';

type ScanMode = 'add' | 'remove';

interface ScannedItem {
    item: Item;
    quantityChange: number;
}

const headerCellStyles = 'px-5 py-2.5 text-[12.5px] font-medium text-[var(--color-muted)] whitespace-nowrap';

export function ScanInventory() {
    const { getItemBySku, updateItem } = useInventory({ autoFetch: false });
    const [mode, setMode] = useState<ScanMode>('add');
    const [scanInput, setScanInput] = useState('');
    const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Clear messages after 3 seconds
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleScan = useCallback(async () => {
        const sku = scanInput.trim();
        if (!sku) return;

        setError(null);
        setScanInput('');
        inputRef.current?.focus();

        // Check if already in scanned list
        const existingIndex = scannedItems.findIndex(si => si.item.sku === sku);
        if (existingIndex !== -1) {
            // Increment quantity change
            setScannedItems(prev => prev.map((si, idx) =>
                idx === existingIndex
                    ? { ...si, quantityChange: si.quantityChange + 1 }
                    : si
            ));
            return;
        }

        // Look up item by SKU
        const { data: item, error: lookupError } = await getItemBySku(sku);

        if (lookupError || !item) {
            setError(`Product not found: ${sku}`);
            return;
        }

        // Add to scanned items
        setScannedItems(prev => [...prev, { item, quantityChange: 1 }]);
    }, [scanInput, scannedItems, getItemBySku]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleScan();
        }
    };

    const handleModeChange = (nextMode: ScanMode) => {
        setMode(nextMode);
        inputRef.current?.focus();
    };

    const updateQuantityChange = (index: number, value: number) => {
        setScannedItems(prev => prev.map((si, idx) =>
            idx === index ? { ...si, quantityChange: Math.max(1, value) } : si
        ));
    };

    const removeScannedItem = (index: number) => {
        setScannedItems(prev => prev.filter((_, idx) => idx !== index));
    };

    const handleSubmit = async () => {
        if (scannedItems.length === 0 || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const updates = scannedItems.map(si => {
                const currentQuantity = si.item.quantity;
                const newQuantity = mode === 'add'
                    ? currentQuantity + si.quantityChange
                    : Math.max(0, currentQuantity - si.quantityChange);

                return {
                    id: si.item.id,
                    quantity: newQuantity
                };
            });

            // Process updates sequentially to avoid conflicts
            for (const update of updates) {
                const result = await updateItem(update.id, { quantity: update.quantity });
                if (result.error) {
                    throw new Error(result.error);
                }
            }

            const totalUnits = scannedItems.reduce((sum, si) => sum + si.quantityChange, 0);
            setSuccessMessage(
                `Successfully ${mode === 'add' ? 'added' : 'removed'} ${totalUnits} unit${totalUnits !== 1 ? 's' : ''} across ${scannedItems.length} SKU${scannedItems.length !== 1 ? 's' : ''}`
            );
            setScannedItems([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update inventory');
        } finally {
            setIsSubmitting(false);
            inputRef.current?.focus();
        }
    };

    const totalQuantityChange = scannedItems.reduce((sum, si) => sum + si.quantityChange, 0);
    const unitsLabel = `${totalQuantityChange} unit${totalQuantityChange !== 1 ? 's' : ''}`;

    return (
        <>
            <Header
                title="Scan inventory"
                description="Scan products by SKU to add or remove stock in bulk."
            />

            <div className="space-y-4">
                <Card className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <ModeToggle mode={mode} onChange={handleModeChange} />
                        <div className="min-w-0 flex-1">
                            <Input
                                ref={inputRef}
                                inputSize="lg"
                                leftIcon={<ScanBarcode className="h-5 w-5" aria-hidden="true" />}
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Scan a barcode or enter a SKU"
                                aria-label="Scan a barcode or enter a SKU"
                                autoComplete="off"
                            />
                        </div>
                        <Button size="lg" variant="secondary" onClick={handleScan} disabled={!scanInput.trim()}>
                            Add to list
                        </Button>
                    </div>

                    <p className="text-[12.5px] text-[var(--color-muted)]">
                        Each scan {mode === 'add' ? 'adds' : 'removes'} 1 unit. Stock only changes when you confirm the list.
                    </p>

                    {error && (
                        <div role="alert" className="flex items-center gap-2 rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div role="status" className="flex items-center gap-2 rounded-lg bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]">
                            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {successMessage}
                        </div>
                    )}
                </Card>

                <Card padding="none" className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-5 py-4">
                        <h2 className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
                            Scanned products
                            <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-muted)]">
                                {scannedItems.length}
                            </span>
                        </h2>
                        {scannedItems.length > 0 && (
                            <span className="text-[13px] tabular-nums text-[var(--color-muted)]">
                                {unitsLabel} to {mode}
                            </span>
                        )}
                    </div>

                    {scannedItems.length === 0 ? (
                        <EmptyState
                            icon={<ScanBarcode className="h-10 w-10" aria-hidden="true" />}
                            title="No products scanned yet"
                            description="Scan a barcode or enter a SKU to get started."
                        />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[var(--color-surface)]">
                                        <tr>
                                            <th className={cn(headerCellStyles, 'text-left')}>Product</th>
                                            <th className={cn(headerCellStyles, 'text-left')}>SKU</th>
                                            <th className={cn(headerCellStyles, 'text-right')}>Current units</th>
                                            <th className={cn(headerCellStyles, 'text-center')}>{mode === 'add' ? 'Add' : 'Remove'}</th>
                                            <th className={cn(headerCellStyles, 'text-right')}>New units</th>
                                            <th className="w-14"><span className="sr-only">Remove from list</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)]">
                                        {scannedItems.map((si, index) => {
                                            const newQuantity = mode === 'add'
                                                ? si.item.quantity + si.quantityChange
                                                : Math.max(0, si.item.quantity - si.quantityChange);

                                            return (
                                                <tr key={si.item.id} className="hover:bg-[var(--color-surface-hover)]">
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-3">
                                                            {si.item.image_url ? (
                                                                <img
                                                                    src={si.item.image_url}
                                                                    alt=""
                                                                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-muted-foreground)]">
                                                                    <ImageIcon className="h-5 w-5" aria-hidden="true" />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-[var(--color-foreground)]">{si.item.name}</p>
                                                                {si.item.variant_summary && (
                                                                    <p className="text-[12.5px] text-[var(--color-muted)]">{si.item.variant_summary}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-[var(--color-muted)]">{si.item.sku}</td>
                                                    <td className="px-5 py-3 text-right text-sm tabular-nums text-[var(--color-muted)]">{si.item.quantity}</td>
                                                    <td className="px-5 py-3">
                                                        <div className="mx-auto flex w-fit items-center gap-0.5 rounded-full bg-[var(--color-surface)] p-1">
                                                            <StepperButton
                                                                label={`Decrease quantity for ${si.item.name}`}
                                                                onClick={() => updateQuantityChange(index, si.quantityChange - 1)}
                                                                disabled={si.quantityChange <= 1}
                                                            >
                                                                <Minus className="h-4 w-4" aria-hidden="true" />
                                                            </StepperButton>
                                                            <input
                                                                type="number"
                                                                value={si.quantityChange}
                                                                onChange={(e) => updateQuantityChange(index, parseInt(e.target.value) || 1)}
                                                                className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums text-[var(--color-foreground)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                                min="1"
                                                                aria-label={`Quantity for ${si.item.name}`}
                                                            />
                                                            <StepperButton
                                                                label={`Increase quantity for ${si.item.name}`}
                                                                onClick={() => updateQuantityChange(index, si.quantityChange + 1)}
                                                            >
                                                                <Plus className="h-4 w-4" aria-hidden="true" />
                                                            </StepperButton>
                                                        </div>
                                                    </td>
                                                    <td className={cn(
                                                        'px-5 py-3 text-right text-sm font-semibold tabular-nums',
                                                        mode === 'add' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                                                    )}>
                                                        {newQuantity}
                                                    </td>
                                                    <td className="py-3 pr-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeScannedItem(index)}
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                                                            aria-label={`Remove ${si.item.name} from list`}
                                                        >
                                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end border-t border-[var(--color-border)] px-5 py-4">
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    variant={mode === 'add' ? 'primary' : 'danger'}
                                >
                                    {isSubmitting ? 'Updating…' : `${mode === 'add' ? 'Add' : 'Remove'} ${unitsLabel}`}
                                </Button>
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </>
    );
}

function ModeToggle({ mode, onChange }: { mode: ScanMode; onChange: (mode: ScanMode) => void }) {
    const options = [
        { value: 'add' as const, label: 'Add stock', icon: Plus, activeText: 'text-[var(--color-success)]' },
        { value: 'remove' as const, label: 'Remove stock', icon: Minus, activeText: 'text-[var(--color-danger)]' },
    ];

    return (
        <div role="group" aria-label="Scan mode" className="flex shrink-0 gap-0.5 rounded-[14px] bg-[var(--color-track)] p-1">
            {options.map(({ value, label, icon: Icon, activeText }) => (
                <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => onChange(value)}
                    className={cn(
                        'inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-sm transition-colors',
                        mode === value
                            ? cn('bg-[var(--color-card)] font-semibold shadow-[var(--shadow-surface)]', activeText)
                            : 'font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    )}
                >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                </button>
            ))}
        </div>
    );
}

function StepperButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );
}
