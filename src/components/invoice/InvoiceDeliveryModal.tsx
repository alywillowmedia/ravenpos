import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { sendInvoiceEmail } from '../../lib/emailReceipt';
import type { InvoiceEmailData } from '../../types/invoice';

interface InvoiceDeliveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: InvoiceEmailData | null;
    recipientEmail?: string | null;
    recipientName?: string | null;
    onRecipientEmailUpdate?: (email: string) => Promise<void>;
    onPrint?: () => { success: boolean; error?: string };
}

type DeliveryStatus = 'idle' | 'sending' | 'success' | 'error';

export function InvoiceDeliveryModal({
    isOpen,
    onClose,
    invoice,
    recipientEmail,
    recipientName,
    onRecipientEmailUpdate,
    onPrint,
}: InvoiceDeliveryModalProps) {
    const [status, setStatus] = useState<DeliveryStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [newEmail, setNewEmail] = useState('');
    const [isAddingEmail, setIsAddingEmail] = useState(false);

    const email = recipientEmail || newEmail;
    const hasEmail = !!email;

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

    const handleSend = async () => {
        if (!invoice || !email) return;

        setStatus('sending');
        setErrorMessage(null);

        if (!recipientEmail && newEmail && onRecipientEmailUpdate) {
            await onRecipientEmailUpdate(newEmail);
        }

        const result = await sendInvoiceEmail(invoice, email, recipientName || undefined);

        if (result.success) {
            setStatus('success');
            setSuccessMessage(`Invoice emailed to ${email}`);
            setTimeout(handleClose, 2000);
        } else {
            setStatus('error');
            setErrorMessage(result.error || 'Failed to send invoice');
        }
    };

    const handlePrint = () => {
        const result = onPrint?.();
        if (result?.success) {
            setStatus('idle');
            setErrorMessage(null);
        } else if (result) {
            setStatus('error');
            setErrorMessage(result.error || 'Failed to print invoice');
        }
    };

    const isLoading = status === 'sending';

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Invoice Delivery" size="md">
            <div className="space-y-6">
                {status === 'success' && successMessage && (
                    <div className="p-4 rounded-lg bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm">
                        {successMessage}
                    </div>
                )}

                {status === 'error' && errorMessage && (
                    <div className="p-4 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                        {errorMessage}
                    </div>
                )}

                {invoice && (
                    <div className="p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm space-y-2">
                        <p className="font-medium">Invoice #{invoice.invoiceId.slice(0, 8).toUpperCase()}</p>
                        <div className="flex justify-between text-[var(--color-muted)]">
                            <span>Recipient</span>
                            <span>{invoice.recipientName}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                            <span>Total</span>
                            <span>${invoice.total.toFixed(2)}</span>
                        </div>
                    </div>
                )}

                {/* Email Selection */}
                {recipientEmail ? (
                    <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-left">
                        <p className="text-sm font-medium">{recipientName || 'Recipient'}</p>
                        <p className="text-sm text-[var(--color-muted)]">{recipientEmail}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-sm text-[var(--color-muted)]">No email on file</p>
                        {isAddingEmail ? (
                            <div className="space-y-2">
                                <Input
                                    type="email"
                                    placeholder="recipient@email.com"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setIsAddingEmail(false);
                                            setNewEmail('');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSend} disabled={!newEmail || isLoading}>
                                        Send
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsAddingEmail(true)}
                                className="text-sm text-[var(--color-primary)] hover:underline"
                            >
                                + Add email to send invoice
                            </button>
                        )}
                    </div>
                )}

                {(recipientEmail || onPrint) && (
                    <div className="grid grid-cols-2 gap-3">
                        {recipientEmail && (
                            <Button
                                onClick={handleSend}
                                isLoading={isLoading}
                                disabled={isLoading || !hasEmail}
                                className={onPrint ? '' : 'col-span-2'}
                            >
                                Email Invoice
                            </Button>
                        )}
                        {onPrint && (
                            <Button
                                variant="secondary"
                                onClick={handlePrint}
                                disabled={isLoading}
                                className={recipientEmail ? '' : 'col-span-2'}
                            >
                                Print Invoice
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            onClick={handleClose}
                            disabled={isLoading}
                            className="col-span-2"
                        >
                            Close
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}
