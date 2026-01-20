import { useState } from 'react';
import { Button } from '../ui/Button';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { printReceipt, createReceiptData } from '../../lib/printReceipt';
import type { CartItem, Sale } from '../../types';

interface ReceiptProps {
    sale: Sale;
    items: CartItem[];
    onNewSale: () => void;
}

export function Receipt({ sale, items, onNewSale }: ReceiptProps) {
    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrintReceipt = async () => {
        setIsPrinting(true);
        const receiptData = createReceiptData(sale, items);
        await printReceipt(receiptData);
        setIsPrinting(false);
    };

    return (
        <div className="text-center">
            {/* Success Icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                </svg>
            </div>

            {/* Receipt Content */}
            <div className="text-left bg-[var(--color-surface)] rounded-xl p-4 font-mono text-sm">
                {/* Header */}
                <div className="text-center border-b border-dashed border-[var(--color-border)] pb-3 mb-3">
                    <p className="font-bold text-lg">Ravenlia</p>
                    <p className="text-xs text-[var(--color-muted)]">
                        {formatDateTime(sale.completed_at)}
                    </p>
                </div>

                {/* Items */}
                <div className="space-y-1 border-b border-dashed border-[var(--color-border)] pb-3 mb-3">
                    {items.map((item) => (
                        <div key={item.item.id} className="flex justify-between">
                            <div className="flex-1 min-w-0">
                                <span className="truncate block">{item.item.name}</span>
                                {item.quantity > 1 && (
                                    <span className="text-xs text-[var(--color-muted)]">
                                        {item.quantity} x {formatCurrency(Number(item.item.price))}
                                    </span>
                                )}
                            </div>
                            <span className="ml-4">{formatCurrency(item.lineTotal)}</span>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatCurrency(Number(sale.subtotal))}</span>
                    </div>
                    <div className="flex justify-between text-[var(--color-muted)]">
                        <span>Tax</span>
                        <span>{formatCurrency(Number(sale.tax_amount))}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base pt-1">
                        <span>Total</span>
                        <span>{formatCurrency(Number(sale.total))}</span>
                    </div>
                    {sale.payment_method === 'cash' && (
                        <>
                            <div className="flex justify-between pt-2 border-t border-dashed border-[var(--color-border)] mt-2">
                                <span>Cash</span>
                                <span>{formatCurrency(Number(sale.cash_tendered))}</span>
                            </div>
                            <div className="flex justify-between font-bold text-[var(--color-success)]">
                                <span>Change</span>
                                <span>{formatCurrency(Number(sale.change_given))}</span>
                            </div>
                        </>
                    )}
                    {sale.payment_method === 'card' && (
                        <div className="flex justify-between pt-2 border-t border-dashed border-[var(--color-border)] mt-2">
                            <span>Paid by</span>
                            <span>Card</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="text-center text-xs text-[var(--color-muted)] mt-4 pt-3 border-t border-dashed border-[var(--color-border)]">
                    <p>Thank you for shopping at Ravenlia!</p>
                    <p className="font-mono mt-1">
                        #{sale.id.slice(0, 8).toUpperCase()}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
                <Button
                    onClick={handlePrintReceipt}
                    variant="secondary"
                    size="lg"
                    className="flex-1"
                    isLoading={isPrinting}
                >
                    <PrinterIcon />
                    Print Receipt
                </Button>
                <Button onClick={onNewSale} size="lg" className="flex-1">
                    Start New Sale
                </Button>
            </div>
        </div>
    );
}

function PrinterIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
        </svg>
    );
}
