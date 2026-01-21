import { useState, useEffect } from 'react';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { DiscountType, Discount } from '../../types';
import { validateDiscountValue } from '../../lib/discounts';

interface DiscountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (type: DiscountType, value: number, reason?: string) => void;
    onRemove?: () => void;
    scope: 'order' | 'item';
    itemName?: string;
    maxAmount: number;
    existingDiscount?: Discount;
}

export function DiscountModal({
    isOpen,
    onClose,
    onApply,
    onRemove,
    scope,
    itemName,
    maxAmount,
    existingDiscount,
}: DiscountModalProps) {
    const [discountType, setDiscountType] = useState<DiscountType>('percentage');
    const [value, setValue] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (existingDiscount) {
                setDiscountType(existingDiscount.type);
                setValue(existingDiscount.value.toString());
                setReason(existingDiscount.reason || '');
            } else {
                setDiscountType('percentage');
                setValue('');
                setReason('');
            }
            setError(null);
        }
    }, [isOpen, existingDiscount]);

    const handleApply = () => {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue <= 0) {
            setError('Please enter a valid discount value');
            return;
        }

        const validation = validateDiscountValue(discountType, numValue, maxAmount);
        if (!validation.valid) {
            setError(validation.message || 'Invalid discount value');
            return;
        }

        onApply(discountType, numValue, reason.trim() || undefined);
        onClose();
    };

    const handleRemove = () => {
        if (onRemove) {
            onRemove();
            onClose();
        }
    };

    const title = scope === 'order'
        ? 'Add Order Discount'
        : `Add Discount${itemName ? ` - ${itemName}` : ''}`;

    // Calculate preview of discount amount
    const numValue = parseFloat(value) || 0;
    const previewAmount = discountType === 'percentage'
        ? (maxAmount * numValue / 100)
        : Math.min(numValue, maxAmount);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="space-y-4">
                {/* Discount Type Toggle */}
                <div>
                    <label className="block text-sm font-medium mb-2">Discount Type</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setDiscountType('percentage')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${discountType === 'percentage'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                }`}
                        >
                            <PercentIcon />
                            Percentage
                        </button>
                        <button
                            onClick={() => setDiscountType('fixed')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${discountType === 'fixed'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                }`}
                        >
                            <DollarIcon />
                            Fixed Amount
                        </button>
                    </div>
                </div>

                {/* Value Input */}
                <Input
                    label={discountType === 'percentage' ? 'Percentage Off' : 'Amount Off'}
                    type="number"
                    step={discountType === 'percentage' ? '1' : '0.01'}
                    min="0"
                    max={discountType === 'percentage' ? '100' : maxAmount.toString()}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setError(null);
                    }}
                    placeholder={discountType === 'percentage' ? '10' : '5.00'}
                    leftIcon={
                        discountType === 'percentage'
                            ? <span className="text-[var(--color-muted)]">%</span>
                            : <span className="text-[var(--color-muted)]">$</span>
                    }
                    error={error || undefined}
                />

                {/* Preview */}
                {numValue > 0 && (
                    <div className="p-3 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20">
                        <p className="text-sm text-[var(--color-muted)]">Discount Preview</p>
                        <p className="text-lg font-bold text-[var(--color-success)]">
                            -${previewAmount.toFixed(2)}
                        </p>
                        {discountType === 'percentage' && (
                            <p className="text-xs text-[var(--color-muted)]">
                                {numValue}% of ${maxAmount.toFixed(2)}
                            </p>
                        )}
                    </div>
                )}

                {/* Reason/Note */}
                <Input
                    label="Reason (Optional)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Loyal customer, Damaged item..."
                />

                {/* Info about max amount */}
                <p className="text-xs text-[var(--color-muted)]">
                    {scope === 'order'
                        ? `Applies to subtotal of $${maxAmount.toFixed(2)}`
                        : `Maximum discount: $${maxAmount.toFixed(2)}`
                    }
                </p>
            </div>

            <ModalFooter>
                <div className="flex gap-2 w-full">
                    {existingDiscount && onRemove && (
                        <Button variant="danger" onClick={handleRemove}>
                            Remove
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleApply}>
                        {existingDiscount ? 'Update' : 'Apply'} Discount
                    </Button>
                </div>
            </ModalFooter>
        </Modal>
    );
}

// Icons
function PercentIcon() {
    return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 5L5 19M9 7a2 2 0 100-4 2 2 0 000 4zM15 21a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
    );
}

function DollarIcon() {
    return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}
