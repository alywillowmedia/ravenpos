import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { sendGiftCardEmail } from '../../lib/emailGiftCard';

const PRESET_AMOUNTS = [5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250];

interface GiftCardSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    connectedReader: boolean;
    onOpenReaderModal: () => void;
    collectCardPayment: (amountInCents: number) => Promise<{
        paymentIntentId: string;
        cardLast4?: string;
        error: string | null;
    }>;
    purchaserCustomerId?: string | null;
}

interface IssuedGiftCard {
    code: string;
    amount: number;
    recipientEmail: string | null;
}

export function GiftCardSaleModal({
    isOpen,
    onClose,
    connectedReader,
    onOpenReaderModal,
    collectCardPayment,
    purchaserCustomerId,
}: GiftCardSaleModalProps) {
    const [amount, setAmount] = useState<number>(25);
    const [recipientName, setRecipientName] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [fromName, setFromName] = useState('');
    const [message, setMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
    const [cashTendered, setCashTendered] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [issued, setIssued] = useState<IssuedGiftCard | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setAmount(25);
        setRecipientName('');
        setRecipientEmail('');
        setFromName('');
        setMessage('');
        setPaymentMethod('cash');
        setCashTendered('');
        setError(null);
        setIssued(null);
        setIsSubmitting(false);
    }, [isOpen]);

    const cashAmount = useMemo(() => Number.parseFloat(cashTendered) || 0, [cashTendered]);
    const changeDue = useMemo(() => Math.max(0, cashAmount - amount), [cashAmount, amount]);

    const handleIssueGiftCard = async () => {
        setError(null);

        if (!amount || amount < 5 || amount > 250) {
            setError('Gift card amount must be between $5 and $250');
            return;
        }

        if (!recipientEmail.trim()) {
            setError('Recipient email is required');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipientEmail.trim())) {
            setError('Enter a valid recipient email');
            return;
        }

        if (paymentMethod === 'cash' && cashAmount < amount) {
            setError('Insufficient cash tendered');
            return;
        }

        let paymentIntentId: string | null = null;

        setIsSubmitting(true);

        if (paymentMethod === 'card') {
            if (!connectedReader) {
                setError('Connect a card reader first');
                setIsSubmitting(false);
                return;
            }

            const cardResult = await collectCardPayment(Math.round(amount * 100));
            if (cardResult.error) {
                setError(cardResult.error);
                setIsSubmitting(false);
                return;
            }
            paymentIntentId = cardResult.paymentIntentId || null;
        }

        const { data, error: issueError } = await supabase.rpc('create_gift_card', {
            p_amount: amount,
            p_recipient_name: recipientName.trim() || null,
            p_recipient_email: recipientEmail.trim(),
            p_from_name: fromName.trim() || null,
            p_message: message.trim() || null,
            p_purchaser_customer_id: purchaserCustomerId || null,
            p_purchase_payment_method: paymentMethod,
            p_purchase_payment_intent_id: paymentIntentId,
        });

        const created = Array.isArray(data) ? data[0] : null;

        if (issueError || !created?.code) {
            setError(issueError?.message || 'Failed to issue gift card');
            setIsSubmitting(false);
            return;
        }

        const emailResult = await sendGiftCardEmail({
            code: created.code,
            amount,
            toName: recipientName.trim() || null,
            toEmail: recipientEmail.trim(),
            fromName: fromName.trim() || null,
            message: message.trim() || null,
        });

        if (!emailResult.success) {
            setError(`Gift card created (${created.code}) but email failed: ${emailResult.error}`);
            setIsSubmitting(false);
            return;
        }

        setIssued({
            code: created.code,
            amount,
            recipientEmail: created.recipient_email || recipientEmail.trim(),
        });
        setIsSubmitting(false);
    };

    const handleCopyCode = async () => {
        if (!issued?.code) return;
        try {
            await navigator.clipboard.writeText(issued.code);
        } catch {
            // Ignore clipboard failures and leave code visible.
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Sell Gift Card"
            size="lg"
        >
            {issued ? (
                <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] p-4">
                        <p className="text-sm text-[var(--color-success)] font-medium">Gift card sent successfully</p>
                        <p className="mt-1 text-sm text-[var(--color-foreground)]">
                            {formatCurrency(issued.amount)} sent to {issued.recipientEmail || 'recipient'}.
                        </p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Gift Card Code</p>
                        <p className="mt-1 font-mono text-xl font-semibold">{issued.code}</p>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={handleCopyCode}>Copy Code</Button>
                        <Button onClick={onClose}>Done</Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                            {error}
                        </div>
                    )}

                    <div>
                        <p className="text-sm font-medium mb-2">Amount</p>
                        <div className="grid grid-cols-4 gap-2">
                            {PRESET_AMOUNTS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setAmount(value)}
                                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${amount === value
                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                                        : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                >
                                    ${value}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Input
                        label="Recipient Email"
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        required
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                            label="To"
                            value={recipientName}
                            onChange={(e) => setRecipientName(e.target.value)}
                            placeholder="Recipient name"
                        />
                        <Input
                            label="From"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            placeholder="Sender name"
                        />
                    </div>

                    <Textarea
                        label="Message (optional)"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={250}
                        placeholder="Add a short note..."
                    />

                    <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${paymentMethod === 'cash'
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                            >
                                Cash
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentMethod('card')}
                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${paymentMethod === 'card'
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                            >
                                Card
                            </button>
                        </div>

                        {paymentMethod === 'cash' ? (
                            <div className="space-y-2">
                                <Input
                                    label="Cash Tendered"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={cashTendered}
                                    onChange={(e) => setCashTendered(e.target.value)}
                                    placeholder="0.00"
                                />
                                {cashAmount > 0 && (
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Change due: <span className="font-semibold">{formatCurrency(changeDue)}</span>
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-3 py-2">
                                <span className="text-sm text-[var(--color-muted)]">
                                    {connectedReader ? 'Card reader connected' : 'No card reader connected'}
                                </span>
                                {!connectedReader && (
                                    <Button type="button" size="sm" variant="secondary" onClick={onOpenReaderModal}>
                                        Connect Reader
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <p className="text-sm text-[var(--color-muted)]">
                            Charge amount: <span className="font-semibold text-[var(--color-foreground)]">{formatCurrency(amount)}</span>
                        </p>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button onClick={handleIssueGiftCard} isLoading={isSubmitting}>
                                Issue & Email
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
