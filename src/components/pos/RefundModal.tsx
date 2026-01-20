import { useState, useEffect } from 'react';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useRefunds } from '../../hooks/useRefunds';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { printRefundReceipt } from '../../lib/printReceipt';
import { sendRefundReceiptEmail } from '../../lib/emailReceipt';
import type { Sale, RefundItem, PaymentMethod, Customer } from '../../types';
import type { RefundReceiptData } from '../../types/receipt';

interface RefundModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type RefundStep = 'search' | 'select' | 'confirm' | 'success';

interface RefundFormItem extends RefundItem {
    selected: boolean;
}

export function RefundModal({ isOpen, onClose }: RefundModalProps) {
    const { isLoading, isProcessing, error, getSaleForRefund, processRefund } = useRefunds();

    const [step, setStep] = useState<RefundStep>('search');
    const [searchInput, setSearchInput] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);

    const [sale, setSale] = useState<Sale | null>(null);
    const [refundItems, setRefundItems] = useState<RefundFormItem[]>([]);

    const [completedRefund, setCompletedRefund] = useState<{
        refund_id: string;
        refund_amount: number;
        payment_method: PaymentMethod;
        stripe_refund_id?: string;
        items: RefundItem[];
    } | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('search');
            setSearchInput('');
            setSearchError(null);
            setSale(null);
            setRefundItems([]);
            setCompletedRefund(null);
            setEmailInput('');
            setEmailSuccess(null);
            setEmailError(null);
        }
    }, [isOpen]);

    const handleSearch = async () => {
        if (!searchInput.trim()) return;

        setSearchError(null);
        const { data, error: fetchError } = await getSaleForRefund(searchInput);

        if (fetchError || !data) {
            setSearchError(fetchError || 'Sale not found');
            return;
        }

        // Calculate already refunded quantities per item
        const refundedQty: Record<string, number> = {};
        for (const refund of data.existingRefunds) {
            for (const item of refund.items) {
                refundedQty[item.sale_item_id] = (refundedQty[item.sale_item_id] || 0) + item.quantity;
            }
        }

        setSale(data.sale);

        // Initialize refund items with remaining quantities
        const formItems: RefundFormItem[] = data.items.map((item) => {
            const alreadyRefunded = refundedQty[item.id] || 0;
            const remaining = item.quantity - alreadyRefunded;
            return {
                item_id: item.item_id,
                sale_item_id: item.id,
                name: item.name,
                quantity: remaining > 0 ? remaining : 0,
                max_quantity: remaining > 0 ? remaining : 0,
                price: Number(item.price),
                restocked: true,
                selected: remaining > 0,
            };
        }).filter(item => item.max_quantity > 0);

        if (formItems.length === 0) {
            setSearchError('All items in this sale have already been refunded');
            return;
        }

        setRefundItems(formItems);
        setStep('select');
    };

    const toggleItemSelected = (index: number) => {
        setRefundItems(prev => prev.map((item, i) =>
            i === index ? { ...item, selected: !item.selected } : item
        ));
    };

    const updateItemQuantity = (index: number, quantity: number) => {
        setRefundItems(prev => prev.map((item, i) =>
            i === index ? { ...item, quantity: Math.min(Math.max(1, quantity), item.max_quantity) } : item
        ));
    };

    const toggleItemRestock = (index: number) => {
        setRefundItems(prev => prev.map((item, i) =>
            i === index ? { ...item, restocked: !item.restocked } : item
        ));
    };

    const selectedItems = refundItems.filter(item => item.selected);
    const refundAmount = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const handleConfirm = () => {
        if (selectedItems.length === 0) return;
        setStep('confirm');
    };

    const handleProcessRefund = async () => {
        if (!sale || selectedItems.length === 0) return;

        const { data, error: refundError } = await processRefund({
            sale_id: sale.id,
            customer_id: sale.customer_id,
            refund_amount: refundAmount,
            payment_method: sale.payment_method,
            items: selectedItems,
        });

        if (refundError || !data) {
            setSearchError(refundError || 'Failed to process refund');
            return;
        }

        setCompletedRefund({
            refund_id: data.refund.id,
            refund_amount: refundAmount,
            payment_method: sale.payment_method,
            stripe_refund_id: data.stripe_refund_id,
            items: selectedItems,
        });
        setStep('success');
    };

    const handlePrintRefund = async () => {
        if (!completedRefund || !sale) return;

        setIsPrinting(true);
        const receiptData = buildRefundReceiptData();
        await printRefundReceipt(receiptData);
        setIsPrinting(false);
    };

    const buildRefundReceiptData = (): RefundReceiptData => {
        if (!completedRefund || !sale) throw new Error('No refund data');
        return {
            refundId: completedRefund.refund_id,
            originalTransactionId: sale.id,
            date: new Date(),
            items: completedRefund.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                lineTotal: item.price * item.quantity,
                restocked: item.restocked,
            })),
            refundAmount: completedRefund.refund_amount,
            paymentMethod: completedRefund.payment_method,
            stripeRefundId: completedRefund.stripe_refund_id,
        };
    };

    const customerEmail = sale?.customer?.email || null;
    const hasEmail = !!customerEmail || !!emailInput;

    const handleEmailRefund = async () => {
        const email = customerEmail || emailInput;
        if (!completedRefund || !sale || !email) return;

        setIsEmailing(true);
        setEmailError(null);
        setEmailSuccess(null);

        const receiptData = buildRefundReceiptData();
        const result = await sendRefundReceiptEmail(
            receiptData,
            email,
            sale.customer?.name
        );

        if (result.success) {
            setEmailSuccess(`Refund receipt emailed to ${email}`);
        } else {
            setEmailError(result.error || 'Failed to send email');
        }
        setIsEmailing(false);
    };

    const handleBothPrintAndEmail = async () => {
        const email = customerEmail || emailInput;
        if (!completedRefund || !sale || !email) return;

        setIsPrinting(true);
        setIsEmailing(true);
        setEmailError(null);
        setEmailSuccess(null);

        const receiptData = buildRefundReceiptData();

        const [, emailResult] = await Promise.all([
            printRefundReceipt(receiptData),
            sendRefundReceiptEmail(receiptData, email, sale.customer?.name),
        ]);

        if (emailResult.success) {
            setEmailSuccess(`Printed and emailed to ${email}`);
        } else {
            setEmailError(emailResult.error || 'Email failed');
        }
        setIsPrinting(false);
        setIsEmailing(false);
    };

    const handleClose = () => {
        onClose();
    };

    const renderSearchStep = () => (
        <div className="space-y-4">
            <p className="text-sm text-[var(--color-muted)]">
                Enter the receipt number or order ID to find the transaction.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
                <div className="flex gap-2">
                    <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="e.g., A1B2C3D4 or full UUID"
                        className="flex-1"
                        autoFocus
                    />
                    <Button type="submit" disabled={isLoading || !searchInput.trim()}>
                        {isLoading ? <LoadingSpinner size={16} /> : 'Search'}
                    </Button>
                </div>
            </form>
            {(searchError || error) && (
                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {searchError || error}
                </div>
            )}
        </div>
    );

    const renderSelectStep = () => (
        <div className="space-y-4">
            {/* Sale Info */}
            {sale && (
                <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-mono text-sm text-[var(--color-muted)]">
                                #{sale.id.slice(0, 8).toUpperCase()}
                            </p>
                            <p className="text-sm">{formatDateTime(sale.completed_at)}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-medium">{formatCurrency(Number(sale.total))}</p>
                            <p className="text-xs text-[var(--color-muted)] capitalize">
                                {sale.payment_method} payment
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Items */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
                {refundItems.map((item, index) => (
                    <div
                        key={item.sale_item_id}
                        className={`p-3 rounded-lg border transition-colors ${item.selected
                            ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30'
                            : 'bg-[var(--color-surface)] border-[var(--color-border)]'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItemSelected(index)}
                                className="mt-1 w-4 h-4 rounded border-[var(--color-border)]"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{item.name}</p>
                                <p className="text-sm text-[var(--color-muted)]">
                                    {formatCurrency(item.price)} each
                                </p>
                            </div>
                            {item.selected && (
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-[var(--color-muted)]">Qty:</span>
                                        <select
                                            value={item.quantity}
                                            onChange={(e) => updateItemQuantity(index, parseInt(e.target.value))}
                                            className="px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-white"
                                        >
                                            {Array.from({ length: item.max_quantity }, (_, i) => i + 1).map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-1 text-xs">
                                        <input
                                            type="checkbox"
                                            checked={item.restocked}
                                            onChange={() => toggleItemRestock(index)}
                                            className="w-3 h-3 rounded"
                                        />
                                        Restock
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Refund Total */}
            <div className="p-4 rounded-lg bg-[var(--color-surface)] border-2 border-[var(--color-border)]">
                <div className="flex justify-between items-center">
                    <span className="font-medium">Refund Amount</span>
                    <span className="text-2xl font-bold text-[var(--color-primary)]">
                        {formatCurrency(refundAmount)}
                    </span>
                </div>
            </div>

            {searchError && (
                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {searchError}
                </div>
            )}

            <ModalFooter>
                <Button variant="ghost" onClick={() => setStep('search')}>
                    Back
                </Button>
                <Button onClick={handleConfirm} disabled={selectedItems.length === 0}>
                    Continue
                </Button>
            </ModalFooter>
        </div>
    );

    const renderConfirmStep = () => (
        <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/20">
                <p className="font-medium text-[var(--color-warning)]">Confirm Refund</p>
                <p className="text-sm mt-1">
                    {sale?.payment_method === 'card'
                        ? 'This will process a refund through Stripe. The customer will receive the refund in 5-10 business days.'
                        : 'Please give the customer cash for this refund.'}
                </p>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium">Items to refund:</p>
                {selectedItems.map(item => (
                    <div key={item.sale_item_id} className="flex justify-between text-sm">
                        <span>
                            {item.name} × {item.quantity}
                            {item.restocked && <span className="text-[var(--color-success)] ml-1">↻</span>}
                        </span>
                        <span>{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                ))}
            </div>

            <div className="pt-3 border-t border-[var(--color-border)]">
                <div className="flex justify-between text-lg font-bold">
                    <span>Total Refund</span>
                    <span className="text-[var(--color-primary)]">{formatCurrency(refundAmount)}</span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-1 capitalize">
                    via {sale?.payment_method}
                </p>
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={() => setStep('select')}>
                    Back
                </Button>
                <Button
                    onClick={handleProcessRefund}
                    isLoading={isProcessing}
                    className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90"
                >
                    Process Refund
                </Button>
            </ModalFooter>
        </div>
    );

    const renderSuccessStep = () => {
        const isLoading = isPrinting || isEmailing;

        return (
            <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                    </svg>
                </div>

                <div>
                    <h3 className="text-lg font-semibold">Refund Processed</h3>
                    <p className="text-[var(--color-muted)]">
                        {formatCurrency(completedRefund?.refund_amount || 0)} refunded via {completedRefund?.payment_method}
                    </p>
                </div>

                {/* Success/Error Messages */}
                {emailSuccess && (
                    <div className="p-3 rounded-lg bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm">
                        {emailSuccess}
                    </div>
                )}
                {emailError && (
                    <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                        {emailError}
                    </div>
                )}

                {completedRefund?.stripe_refund_id && (
                    <div className="p-3 rounded-lg bg-[var(--color-surface)] text-sm">
                        <p className="text-[var(--color-muted)]">Stripe Refund ID</p>
                        <p className="font-mono">{completedRefund.stripe_refund_id}</p>
                    </div>
                )}

                <div className="text-left space-y-1 p-3 rounded-lg bg-[var(--color-surface)]">
                    <p className="text-sm font-medium mb-2">Items Refunded:</p>
                    {completedRefund?.items.map(item => (
                        <div key={item.sale_item_id} className="flex justify-between text-sm">
                            <span>
                                {item.name} × {item.quantity}
                            </span>
                            <span className={item.restocked ? 'text-[var(--color-success)]' : 'text-[var(--color-muted)]'}>
                                {item.restocked ? 'Restocked ✓' : 'Not restocked'}
                            </span>
                        </div>
                    ))}
                </div>

                {completedRefund?.payment_method === 'card' && (
                    <p className="text-xs text-[var(--color-muted)]">
                        Customer will receive the refund within 5-10 business days.
                    </p>
                )}

                {/* Customer Email Input (if no email on file) */}
                {sale?.customer && !customerEmail && (
                    <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                        <p className="text-sm font-medium text-left">{sale.customer.name}</p>
                        <div className="mt-2">
                            <Input
                                type="email"
                                placeholder="customer@email.com"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                inputSize="sm"
                            />
                        </div>
                    </div>
                )}

                {/* Customer with email on file */}
                {sale?.customer && customerEmail && (
                    <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-left">
                        <p className="text-sm font-medium">{sale.customer.name}</p>
                        <p className="text-sm text-[var(--color-muted)]">{customerEmail}</p>
                    </div>
                )}

                {/* Receipt Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button
                        variant="secondary"
                        onClick={handlePrintRefund}
                        isLoading={isPrinting && !isEmailing}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2"
                    >
                        <PrinterIcon />
                        Print
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleEmailRefund}
                        isLoading={isEmailing && !isPrinting}
                        disabled={isLoading || !hasEmail}
                        className="flex items-center justify-center gap-2"
                    >
                        <EmailIcon />
                        Email
                    </Button>
                    <Button
                        onClick={handleBothPrintAndEmail}
                        isLoading={isPrinting && isEmailing}
                        disabled={isLoading || !hasEmail}
                        className="col-span-2 flex items-center justify-center gap-2"
                    >
                        <PrinterIcon />
                        <span>+</span>
                        <EmailIcon />
                        Both
                    </Button>
                </div>

                <Button onClick={handleClose} variant="ghost" className="w-full">
                    Close
                </Button>
            </div>
        );
    };

    const getTitle = () => {
        switch (step) {
            case 'search': return 'Process Refund';
            case 'select': return 'Select Items to Refund';
            case 'confirm': return 'Confirm Refund';
            case 'success': return 'Refund Complete';
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={getTitle()}
            size="lg"
        >
            {step === 'search' && renderSearchStep()}
            {step === 'select' && renderSelectStep()}
            {step === 'confirm' && renderConfirmStep()}
            {step === 'success' && renderSuccessStep()}
        </Modal>
    );
}

function PrinterIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
        </svg>
    );
}

function EmailIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
    );
}
