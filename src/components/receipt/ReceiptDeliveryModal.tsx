import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { printReceipt } from '../../lib/printReceipt';
import { sendReceiptEmail } from '../../lib/emailReceipt';
import { formatCurrency } from '../../lib/utils';
import type { ReceiptData } from '../../types/receipt';
import type { Customer } from '../../types';

interface ReceiptDeliveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    receipt: ReceiptData;
    customer: Customer | null;
    onCustomerEmailUpdate?: (customerId: string, email: string) => Promise<void>;
}

type DeliveryStatus = 'idle' | 'printing' | 'emailing' | 'both' | 'success' | 'error';

export function ReceiptDeliveryModal({
    isOpen,
    onClose,
    receipt,
    customer,
    onCustomerEmailUpdate,
}: ReceiptDeliveryModalProps) {
    const [status, setStatus] = useState<DeliveryStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [newEmail, setNewEmail] = useState('');
    const [isAddingEmail, setIsAddingEmail] = useState(false);

    const customerEmail = customer?.email || null;
    const hasEmail = !!customerEmail || !!newEmail;

    const resetState = () => {
        setStatus('idle');
        setErrorMessage(null);
        setSuccessMessage(null);
        setNewEmail('');
        setIsAddingEmail(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handlePrint = async () => {
        setStatus('printing');
        setErrorMessage(null);

        const result = await printReceipt(receipt);

        if (result.success) {
            setStatus('success');
            setSuccessMessage('Receipt sent to printer');
            setTimeout(handleClose, 1500);
        } else {
            setStatus('error');
            setErrorMessage(result.error || 'Print failed');
        }
    };

    const handleEmail = async () => {
        const email = customerEmail || newEmail;
        if (!email) return;

        setStatus('emailing');
        setErrorMessage(null);

        // If adding a new email, save it first
        if (newEmail && customer && onCustomerEmailUpdate) {
            try {
                await onCustomerEmailUpdate(customer.id, newEmail);
            } catch (err) {
                console.warn('Failed to save customer email:', err);
                // Continue anyway - we can still send the email
            }
        }

        const result = await sendReceiptEmail(
            receipt,
            email,
            customer?.name
        );

        if (result.success) {
            setStatus('success');
            setSuccessMessage(`Receipt emailed to ${email}`);
            setTimeout(handleClose, 2000);
        } else {
            setStatus('error');
            setErrorMessage(result.error || 'Email failed');
        }
    };

    const handleBoth = async () => {
        const email = customerEmail || newEmail;
        if (!email) return;

        setStatus('both');
        setErrorMessage(null);

        // If adding a new email, save it first
        if (newEmail && customer && onCustomerEmailUpdate) {
            try {
                await onCustomerEmailUpdate(customer.id, newEmail);
            } catch (err) {
                console.warn('Failed to save customer email:', err);
            }
        }

        // Run both in parallel
        const [printResult, emailResult] = await Promise.all([
            printReceipt(receipt),
            sendReceiptEmail(receipt, email, customer?.name),
        ]);

        if (printResult.success && emailResult.success) {
            setStatus('success');
            setSuccessMessage(`Printed and emailed to ${email}`);
            setTimeout(handleClose, 2000);
        } else {
            setStatus('error');
            const errors: string[] = [];
            if (!printResult.success) errors.push(`Print: ${printResult.error}`);
            if (!emailResult.success) errors.push(`Email: ${emailResult.error}`);
            setErrorMessage(errors.join('. '));
        }
    };

    const isLoading = ['printing', 'emailing', 'both'].includes(status);

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Receipt Options"
            size="md"
        >
            <div className="space-y-6">
                {/* Success Message */}
                {status === 'success' && successMessage && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-success-bg)] border border-[var(--color-success)]/20">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-success)] flex items-center justify-center flex-shrink-0">
                            <CheckIcon />
                        </div>
                        <p className="text-[var(--color-success)] font-medium">{successMessage}</p>
                    </div>
                )}

                {/* Error Message */}
                {status === 'error' && errorMessage && (
                    <div className="p-4 rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger)]/20">
                        <p className="text-[var(--color-danger)] text-sm">{errorMessage}</p>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStatus('idle')}
                            className="mt-2"
                        >
                            Try Again
                        </Button>
                    </div>
                )}

                {/* Receipt Summary */}
                {status !== 'success' && (
                    <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-[var(--color-muted)]">Transaction</span>
                            <span className="font-mono text-sm">#{receipt.transactionId.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--color-muted)]">Total</span>
                            <span className="text-xl font-bold text-[var(--color-primary)]">{formatCurrency(receipt.total)}</span>
                        </div>
                    </div>
                )}

                {/* Customer Info */}
                {status !== 'success' && customer && (
                    <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                        <p className="text-sm font-medium">{customer.name}</p>
                        {customerEmail ? (
                            <p className="text-sm text-[var(--color-muted)]">{customerEmail}</p>
                        ) : (
                            <div className="mt-2">
                                {isAddingEmail ? (
                                    <div className="flex gap-2">
                                        <Input
                                            type="email"
                                            placeholder="customer@email.com"
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            inputSize="sm"
                                            className="flex-1"
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setIsAddingEmail(false);
                                                setNewEmail('');
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setIsAddingEmail(true)}
                                        className="text-sm text-[var(--color-primary)] hover:underline"
                                    >
                                        + Add email to send receipt
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                {status !== 'success' && (
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            onClick={handlePrint}
                            isLoading={status === 'printing'}
                            disabled={isLoading}
                            variant="secondary"
                            className="flex items-center justify-center gap-2"
                        >
                            <PrinterIcon />
                            Print
                        </Button>

                        <Button
                            onClick={handleEmail}
                            isLoading={status === 'emailing'}
                            disabled={isLoading || !hasEmail}
                            variant="secondary"
                            className="flex items-center justify-center gap-2"
                        >
                            <EmailIcon />
                            Email
                        </Button>

                        <Button
                            onClick={handleBoth}
                            isLoading={status === 'both'}
                            disabled={isLoading || !hasEmail}
                            className="col-span-2 flex items-center justify-center gap-2"
                        >
                            <PrinterIcon />
                            <span>+</span>
                            <EmailIcon />
                            Both
                        </Button>

                        <Button
                            variant="ghost"
                            onClick={handleClose}
                            disabled={isLoading}
                            className="col-span-2"
                        >
                            Skip
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

function PrinterIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
        </svg>
    );
}

function EmailIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}
