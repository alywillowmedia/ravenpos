import { useState, useRef, useEffect, useCallback } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { useInventory } from '../hooks/useInventory';
import type { Item } from '../types';

interface ScannedItem {
    item: Item;
    quantityChange: number;
}

export function ScanInventory() {
    const { getItemBySku, updateItem } = useInventory();
    const [mode, setMode] = useState<'add' | 'remove'>('add');
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
            setError(`Item not found: ${sku}`);
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

            const totalItems = scannedItems.reduce((sum, si) => sum + si.quantityChange, 0);
            setSuccessMessage(
                `Successfully ${mode === 'add' ? 'added' : 'removed'} ${totalItems} item${totalItems !== 1 ? 's' : ''} across ${scannedItems.length} SKU${scannedItems.length !== 1 ? 's' : ''}`
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

    return (
        <>
            <Header
                title="Scan Inventory"
                description="Scan items by SKU to add or remove stock in bulk"
            />

            <div className="space-y-6">
                {/* Mode Toggle and Scan Input */}
                <div className="card p-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* Mode Toggle */}
                        <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)]">
                            <button
                                onClick={() => setMode('add')}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${mode === 'add'
                                        ? 'bg-[var(--color-success)] text-white'
                                        : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    <PlusIcon />
                                    Add Stock
                                </span>
                            </button>
                            <button
                                onClick={() => setMode('remove')}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${mode === 'remove'
                                        ? 'bg-[var(--color-danger)] text-white'
                                        : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    <MinusIcon />
                                    Remove Stock
                                </span>
                            </button>
                        </div>

                        {/* Scan Input */}
                        <div className="flex-1 relative">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                <BarcodeIcon />
                            </div>
                            <input
                                ref={inputRef}
                                type="text"
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Scan barcode or enter SKU..."
                                className="input pl-10 w-full"
                                autoComplete="off"
                            />
                        </div>

                        <Button onClick={handleScan} variant="secondary">
                            Add to List
                        </Button>
                    </div>

                    {/* Feedback Messages */}
                    {error && (
                        <div className="mt-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm flex items-center gap-2">
                            <AlertIcon />
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div className="mt-4 p-3 rounded-lg bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm flex items-center gap-2">
                            <CheckIcon />
                            {successMessage}
                        </div>
                    )}
                </div>

                {/* Scanned Items List */}
                <div className="card">
                    <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
                            Scanned Items ({scannedItems.length})
                        </h2>
                        {scannedItems.length > 0 && (
                            <span className="text-sm text-[var(--color-muted)]">
                                Total quantity: {totalQuantityChange}
                            </span>
                        )}
                    </div>

                    {scannedItems.length === 0 ? (
                        <div className="p-12 text-center text-[var(--color-muted)]">
                            <BarcodeIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
                            <p>No items scanned yet</p>
                            <p className="text-sm mt-1">Scan a barcode or enter a SKU to get started</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-[var(--color-surface)]">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Item</th>
                                        <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">SKU</th>
                                        <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Current Qty</th>
                                        <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">
                                            {mode === 'add' ? 'Add' : 'Remove'}
                                        </th>
                                        <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">New Qty</th>
                                        <th className="w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-border)]">
                                    {scannedItems.map((si, index) => {
                                        const newQuantity = mode === 'add'
                                            ? si.item.quantity + si.quantityChange
                                            : Math.max(0, si.item.quantity - si.quantityChange);

                                        return (
                                            <tr key={si.item.id} className="hover:bg-[var(--color-surface-hover)]">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        {si.item.image_url ? (
                                                            <img
                                                                src={si.item.image_url}
                                                                alt={si.item.name}
                                                                className="w-10 h-10 rounded object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded bg-[var(--color-surface)] flex items-center justify-center">
                                                                <ImagePlaceholderIcon />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="font-medium text-[var(--color-foreground)]">{si.item.name}</p>
                                                            {si.item.variant && (
                                                                <p className="text-xs text-[var(--color-muted)]">{si.item.variant}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-sm text-[var(--color-muted)]">{si.item.sku}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-[var(--color-foreground)]">{si.item.quantity}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => updateQuantityChange(index, si.quantityChange - 1)}
                                                            className="p-1 rounded hover:bg-[var(--color-surface)] transition-colors"
                                                            disabled={si.quantityChange <= 1}
                                                        >
                                                            <MinusIcon />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            value={si.quantityChange}
                                                            onChange={(e) => updateQuantityChange(index, parseInt(e.target.value) || 1)}
                                                            className="w-16 text-center input py-1 px-2"
                                                            min="1"
                                                        />
                                                        <button
                                                            onClick={() => updateQuantityChange(index, si.quantityChange + 1)}
                                                            className="p-1 rounded hover:bg-[var(--color-surface)] transition-colors"
                                                        >
                                                            <PlusIcon />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={`font-semibold ${mode === 'add'
                                                            ? 'text-[var(--color-success)]'
                                                            : 'text-[var(--color-danger)]'
                                                        }`}>
                                                        {newQuantity}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => removeScannedItem(index)}
                                                        className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Submit Button */}
                    {scannedItems.length > 0 && (
                        <div className="p-4 border-t border-[var(--color-border)] flex justify-end">
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                variant={mode === 'add' ? 'primary' : 'danger'}
                            >
                                {isSubmitting ? 'Updating...' : `${mode === 'add' ? 'Add' : 'Remove'} ${totalQuantityChange} Item${totalQuantityChange !== 1 ? 's' : ''}`}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// Icons
function PlusIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function MinusIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
        </svg>
    );
}

function BarcodeIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5v14" />
            <path d="M8 5v14" />
            <path d="M12 5v14" />
            <path d="M17 5v14" />
            <path d="M21 5v14" />
        </svg>
    );
}

function AlertIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    );
}

function ImagePlaceholderIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
        </svg>
    );
}
