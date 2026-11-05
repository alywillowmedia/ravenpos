import { useEffect, useState } from 'react';
import { markPayoutPaid, type MarkPaidEmailOutcome } from '../../hooks/usePayouts';
import { useToast } from '../../contexts/ToastContext';
import { describeFinalizeError, PAYMENT_METHODS, validatePayment } from '../../lib/payoutDraft';
import { localDateString } from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, ModalFooter } from '../ui/Modal';
import { Select } from '../ui/Select';

export interface MarkPaidTarget {
    payoutId: string;
    vendorName: string;
    payToName: string;
    amount: number;
    rollsForward: number;
    email: string | null;
    reasonRequired: boolean;
    reason: string;
}

export function MarkPaidDialog({
    target,
    beforeFinalize,
    onClose,
    onPaid,
}: {
    target: MarkPaidTarget | null;
    beforeFinalize?: () => Promise<boolean>;
    onClose: () => void;
    onPaid: (payoutId: string) => void;
}) {
    const toast = useToast();
    const [method, setMethod] = useState('check');
    const [date, setDate] = useState(() => localDateString(new Date()));
    const [reference, setReference] = useState('');
    const [reason, setReason] = useState('');
    const [sendEmail, setSendEmail] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const payoutId = target?.payoutId;
    const initialReason = target?.reason ?? '';
    useEffect(() => {
        if (!payoutId) return;
        setMethod('check');
        setDate(localDateString(new Date()));
        setReference('');
        setReason(initialReason);
        setSendEmail(true);
        setError(null);
    }, [payoutId, initialReason]);

    if (!target) return <Modal isOpen={false} onClose={onClose}>{null}</Modal>;

    const errors = validatePayment({
        method,
        date,
        reference,
        amount: target.amount,
        reasonRequired: target.reasonRequired,
        reason,
    });
    const isValid = Object.keys(errors).length === 0;

    const notify = (outcome: MarkPaidEmailOutcome) => {
        if (outcome === 'failed') toast.warning('Paid, email failed', 'Resend it from the statement.');
        else toast.success('Payout marked paid');
    };

    const confirm = async () => {
        if (!isValid) return;
        setIsSaving(true);
        setError(null);
        try {
            if (beforeFinalize && !(await beforeFinalize())) return;
            const { email } = await markPayoutPaid({
                payoutId: target.payoutId,
                paymentMethod: method,
                paymentDate: date,
                paymentReference: reference.trim() || null,
                belowThresholdOverrideReason: target.reasonRequired ? reason.trim() : null,
                sendEmail: sendEmail && !!target.email,
            });
            notify(email);
            onPaid(target.payoutId);
        } catch (err) {
            setError(describeFinalizeError(err instanceof Error ? err.message : 'Could not mark this payout paid.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={isSaving ? () => {} : onClose} title="Mark paid" size="md">
            <div className="space-y-4">
                <div>
                    <p className="text-sm text-[var(--color-muted)]">
                        {target.vendorName}
                        {target.payToName && target.payToName !== target.vendorName ? ` · Pay to ${target.payToName}` : ''}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--color-foreground)]">{formatCurrency(target.amount)}</p>
                    {target.rollsForward > 0 ? (
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                            Rolls forward: {formatCurrency(target.rollsForward)}
                        </p>
                    ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                        label="Method"
                        options={PAYMENT_METHODS}
                        value={method}
                        onChange={(event) => setMethod(event.target.value)}
                    />
                    <Input
                        label="Payment date"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        error={errors.date}
                    />
                </div>
                <Input
                    label={method === 'check' ? 'Check number' : 'Reference'}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    error={errors.reference}
                />
                {target.reasonRequired ? (
                    <Input
                        label="Reason for paying below the minimum"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        error={errors.reason}
                    />
                ) : null}
                {target.email ? (
                    <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                        <input
                            type="checkbox"
                            checked={sendEmail}
                            onChange={(event) => setSendEmail(event.target.checked)}
                            className="h-4 w-4 accent-[var(--color-primary)]"
                        />
                        Email statement to {target.email}
                    </label>
                ) : (
                    <p className="text-sm text-[var(--color-muted)]">No email on file for this vendor</p>
                )}
                {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
            </div>
            <ModalFooter>
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
                <Button type="button" onClick={() => void confirm()} disabled={!isValid} isLoading={isSaving}>
                    Mark paid · {formatCurrency(target.amount)}
                </Button>
            </ModalFooter>
        </Modal>
    );
}
