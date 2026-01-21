import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatCurrency } from '../../lib/utils';
import type { Item } from '../../types';

interface ChangeSummary {
    itemId: string;
    changes: Array<{ field: string; from: unknown; to: unknown }>;
}

interface ChangeSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    changeSummary: ChangeSummary[];
    items: Item[];
    isLoading?: boolean;
}

export function ChangeSummaryModal({
    isOpen,
    onClose,
    onConfirm,
    changeSummary,
    items,
    isLoading = false,
}: ChangeSummaryModalProps) {
    const getItemName = (itemId: string) => {
        const item = items.find((i) => i.id === itemId);
        return item?.name || 'Unknown Item';
    };

    const formatValue = (field: string, value: unknown): string => {
        if (value === null || value === undefined) return '—';
        if (field === 'price') return formatCurrency(Number(value));
        if (field === 'is_listed') return value ? 'Active' : 'Inactive';
        return String(value);
    };

    const getFieldLabel = (field: string): string => {
        const labels: Record<string, string> = {
            price: 'Price',
            quantity: 'Quantity',
            category: 'Category',
            is_listed: 'Status',
        };
        return labels[field] || field;
    };

    const totalChanges = changeSummary.reduce((sum, item) => sum + item.changes.length, 0);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Confirm Bulk Changes"
            size="lg"
        >
            <div className="space-y-4">
                {/* Summary header */}
                <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-2">
                        <WarningIcon />
                        <span className="text-sm font-medium text-[var(--color-foreground)]">
                            You are about to update {changeSummary.length} items
                        </span>
                    </div>
                    <Badge variant="warning">{totalChanges} changes</Badge>
                </div>

                {/* Changes list */}
                <div className="max-h-[50vh] overflow-y-auto space-y-3">
                    {changeSummary.map((summary) => (
                        <div
                            key={summary.itemId}
                            className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
                        >
                            <p className="font-medium text-sm text-[var(--color-foreground)] mb-2">
                                {getItemName(summary.itemId)}
                            </p>
                            <div className="space-y-1">
                                {summary.changes.map((change, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-2 text-xs"
                                    >
                                        <span className="text-[var(--color-muted)] w-16">
                                            {getFieldLabel(change.field)}:
                                        </span>
                                        <span className="text-red-500 line-through">
                                            {formatValue(change.field, change.from)}
                                        </span>
                                        <ArrowRightIcon />
                                        <span className="text-green-600 font-medium">
                                            {formatValue(change.field, change.to)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Warning */}
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <InfoIcon className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                        These changes will be applied immediately and cannot be undone.
                        Items with Shopify sync enabled will also be updated in Shopify.
                    </p>
                </div>
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={onConfirm} isLoading={isLoading}>
                    <CheckIcon />
                    Confirm {totalChanges} Changes
                </Button>
            </ModalFooter>
        </Modal>
    );
}

function WarningIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-500"
        >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </svg>
    );
}

function ArrowRightIcon() {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--color-muted)]"
        >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    );
}

function InfoIcon({ className }: { className?: string }) {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}
