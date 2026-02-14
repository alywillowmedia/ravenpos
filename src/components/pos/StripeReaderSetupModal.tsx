import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

type SetupStep = 'mode' | 'location' | 'done';

interface StripeReaderSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'simulated' | 'live';
    locationId: string;
    onSave: (settings: { mode: 'simulated' | 'live'; locationId: string }) => void;
}

export function StripeReaderSetupModal({
    isOpen,
    onClose,
    mode,
    locationId,
    onSave,
}: StripeReaderSetupModalProps) {
    const [step, setStep] = useState<SetupStep>('mode');
    const [draftMode, setDraftMode] = useState<'simulated' | 'live'>(mode);
    const [draftLocationId, setDraftLocationId] = useState(locationId);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setStep('mode');
        setDraftMode(mode);
        setDraftLocationId(locationId);
        setError(null);
    }, [isOpen, mode, locationId]);

    const handleNext = () => {
        setError(null);
        if (step === 'mode') {
            if (draftMode === 'simulated') {
                onSave({ mode: 'simulated', locationId: '' });
                setStep('done');
                return;
            }
            setStep('location');
            return;
        }

        if (step === 'location') {
            const value = draftLocationId.trim();
            if (!value) {
                setError('Enter your Stripe Terminal Location ID');
                return;
            }
            if (!value.startsWith('tml_')) {
                setError('Location ID should start with "tml_"');
                return;
            }
            onSave({ mode: 'live', locationId: value });
            setStep('done');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Stripe Reader Setup"
            description="Configure card reader mode without code changes"
            size="md"
        >
            <div className="space-y-5">
                <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3].map((num) => {
                        const activeStep =
                            (step === 'mode' && num === 1) ||
                            (step === 'location' && num === 2) ||
                            (step === 'done' && num === 3);
                        const isComplete =
                            (step === 'location' || step === 'done') && num === 1 ||
                            step === 'done' && num === 2;
                        return (
                            <div
                                key={num}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${activeStep
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : isComplete
                                        ? 'bg-[var(--color-success)] text-white'
                                        : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
                                    }`}
                            >
                                {isComplete ? '✓' : num}
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger)]/20 p-3 text-sm text-[var(--color-danger)]">
                        {error}
                    </div>
                )}

                {step === 'mode' && (
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--color-muted)]">
                            Choose how RavenPOS should look for card readers.
                        </p>
                        <button
                            type="button"
                            onClick={() => setDraftMode('simulated')}
                            className={`w-full text-left rounded-lg border p-3 transition-colors ${draftMode === 'simulated'
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                }`}
                        >
                            <p className="font-medium">Test Mode (Simulated)</p>
                            <p className="text-sm text-[var(--color-muted)]">No physical reader required.</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDraftMode('live')}
                            className={`w-full text-left rounded-lg border p-3 transition-colors ${draftMode === 'live'
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                }`}
                        >
                            <p className="font-medium">Live Mode (Physical Reader)</p>
                            <p className="text-sm text-[var(--color-muted)]">Connect to a real Stripe reader.</p>
                        </button>
                    </div>
                )}

                {step === 'location' && (
                    <div className="space-y-3">
                        <Input
                            label="Stripe Location ID"
                            value={draftLocationId}
                            onChange={(e) => setDraftLocationId(e.target.value)}
                            placeholder="tml_1234567890"
                            hint="Find this in Stripe Dashboard: Terminal > Locations"
                        />
                        <p className="text-xs text-[var(--color-muted)]">
                            This is the one value you update when moving to a new business location.
                        </p>
                    </div>
                )}

                {step === 'done' && (
                    <div className="rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 p-4">
                        <p className="font-medium text-[var(--color-success)]">Reader setup saved</p>
                        <p className="text-sm text-[var(--color-muted)] mt-1">
                            Current mode: {draftMode === 'simulated' ? 'Test Mode' : 'Live Mode'}
                            {draftMode === 'live' && draftLocationId ? ` (${draftLocationId})` : ''}
                        </p>
                    </div>
                )}

                <div className="flex justify-between gap-3 pt-2">
                    {step === 'location' ? (
                        <Button variant="ghost" onClick={() => setStep('mode')}>
                            Back
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={onClose}>
                            {step === 'done' ? 'Close' : 'Cancel'}
                        </Button>
                    )}

                    {step !== 'done' && (
                        <Button onClick={handleNext}>
                            {step === 'mode' ? 'Continue' : 'Save Setup'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
