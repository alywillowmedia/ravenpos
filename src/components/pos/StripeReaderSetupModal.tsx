import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

type SetupStep = 'mode' | 'location' | 'connect' | 'done';
type ReaderMode = 'simulated' | 'live';
type TerminalStatus = 'not_initialized' | 'initialized' | 'discovering' | 'connecting' | 'connected' | 'collecting' | 'processing' | 'error';

interface ReaderOption {
    id: string;
    label: string;
    device_type: string;
    status: string;
}

interface StripeReaderSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: ReaderMode;
    locationId: string;
    autoReconnect: boolean;
    terminalStatus: TerminalStatus;
    discoveredReaders: ReaderOption[];
    connectedReader: ReaderOption | null;
    onSave: (settings: { mode: ReaderMode; locationId: string; autoReconnect: boolean }) => void;
    onDiscoverReaders: (settings: { mode: ReaderMode; locationId: string }) => Promise<void>;
    onConnectReader: (reader: ReaderOption) => Promise<void>;
    onRegisterReader: (registrationCode: string, label?: string) => Promise<boolean>;
}

export function StripeReaderSetupModal({
    isOpen,
    onClose,
    mode,
    locationId,
    autoReconnect,
    terminalStatus,
    discoveredReaders,
    connectedReader,
    onSave,
    onDiscoverReaders,
    onConnectReader,
    onRegisterReader,
}: StripeReaderSetupModalProps) {
    const [step, setStep] = useState<SetupStep>('mode');
    const [draftMode, setDraftMode] = useState<ReaderMode>(mode);
    const [draftLocationId, setDraftLocationId] = useState(locationId);
    const [draftAutoReconnect, setDraftAutoReconnect] = useState(autoReconnect);
    const [registrationCode, setRegistrationCode] = useState('');
    const [readerLabel, setReaderLabel] = useState('Front Counter');
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setStep('mode');
        setDraftMode(mode);
        setDraftLocationId(locationId);
        setDraftAutoReconnect(autoReconnect);
        setRegistrationCode('');
        setReaderLabel('Front Counter');
        setIsRegistering(false);
        setError(null);
    }, [isOpen, mode, locationId, autoReconnect]);

    const handleNext = async () => {
        setError(null);
        if (step === 'mode') {
            setStep(draftMode === 'live' ? 'location' : 'connect');
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
            setDraftLocationId(value);
            setStep('connect');
            return;
        }

        if (step === 'connect') {
            const saveLocation = draftMode === 'live' ? draftLocationId.trim() : '';
            onSave({ mode: draftMode, locationId: saveLocation, autoReconnect: draftAutoReconnect });
            setStep('done');
        }
    };

    const handleDiscover = async () => {
        setError(null);
        if (draftMode === 'live' && !draftLocationId.trim()) {
            setError('Enter your Stripe Terminal Location ID first');
            setStep('location');
            return;
        }
        await onDiscoverReaders({
            mode: draftMode,
            locationId: draftMode === 'live' ? draftLocationId.trim() : '',
        });
    };

    const handleConnect = async (reader: ReaderOption) => {
        setError(null);
        await onConnectReader(reader);
    };

    const handleRegisterReader = async () => {
        if (draftMode !== 'live') return;

        const code = registrationCode.trim();
        if (!code) {
            setError('Enter the registration code shown on the reader');
            return;
        }
        if (!draftLocationId.trim()) {
            setError('Enter your Stripe Location ID first');
            setStep('location');
            return;
        }

        setError(null);
        setIsRegistering(true);
        const ok = await onRegisterReader(code, readerLabel.trim() || undefined);
        setIsRegistering(false);

        if (!ok) {
            setError('Registration failed. Verify code/location and try again.');
            return;
        }

        setRegistrationCode('');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Stripe Reader Setup"
            description="Connection wizard for Stripe Terminal readers"
            size="md"
        >
            <div className="space-y-5">
                <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3, 4].map((num) => {
                        const activeStep =
                            (step === 'mode' && num === 1) ||
                            (step === 'location' && num === 2) ||
                            (step === 'connect' && num === 3) ||
                            (step === 'done' && num === 4);
                        const isComplete =
                            (step === 'location' || step === 'connect' || step === 'done') && num === 1 ||
                            (step === 'connect' || step === 'done') && num === 2 ||
                            step === 'done' && num === 3;
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

                {step === 'connect' && (
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={draftAutoReconnect}
                                onChange={(e) => setDraftAutoReconnect(e.target.checked)}
                            />
                            Enable automatic reconnect on app launch
                        </label>

                        {draftMode === 'live' && (
                            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
                                <p className="text-sm font-medium">Register this reader code</p>
                                <Input
                                    label="Registration Code"
                                    value={registrationCode}
                                    onChange={(e) => setRegistrationCode(e.target.value.toUpperCase())}
                                    placeholder="e.g. AB12CD34"
                                    hint="Shown directly on the POS E screen"
                                />
                                <Input
                                    label="Reader Label (optional)"
                                    value={readerLabel}
                                    onChange={(e) => setReaderLabel(e.target.value)}
                                    placeholder="Front Counter"
                                />
                                <Button
                                    variant="secondary"
                                    onClick={handleRegisterReader}
                                    isLoading={isRegistering}
                                >
                                    Register Reader
                                </Button>
                            </div>
                        )}

                        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Discover readers</p>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleDiscover}
                                    isLoading={terminalStatus === 'discovering'}
                                >
                                    {terminalStatus === 'discovering' ? 'Searching...' : 'Search'}
                                </Button>
                            </div>

                            {connectedReader ? (
                                <div className="rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 p-3">
                                    <p className="text-sm font-medium text-[var(--color-success)]">Connected: {connectedReader.label}</p>
                                    <p className="text-xs text-[var(--color-muted)]">{connectedReader.device_type}</p>
                                </div>
                            ) : discoveredReaders.length === 0 ? (
                                <p className="text-sm text-[var(--color-muted)]">No readers discovered yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {discoveredReaders.map((reader) => (
                                        <button
                                            key={reader.id}
                                            type="button"
                                            onClick={() => handleConnect(reader)}
                                            className="w-full text-left rounded-lg border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors"
                                        >
                                            <p className="font-medium">{reader.label}</p>
                                            <p className="text-xs text-[var(--color-muted)]">{reader.device_type} - {reader.status}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 'done' && (
                    <div className="rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 p-4">
                        <p className="font-medium text-[var(--color-success)]">Reader setup saved</p>
                        <p className="text-sm text-[var(--color-muted)] mt-1">
                            Current mode: {draftMode === 'simulated' ? 'Test Mode' : 'Live Mode'}
                            {draftMode === 'live' && draftLocationId ? ` (${draftLocationId})` : ''}
                        </p>
                        <p className="text-xs text-[var(--color-muted)] mt-2">
                            Auto reconnect: {draftAutoReconnect ? 'On' : 'Off'}
                        </p>
                    </div>
                )}

                <div className="flex justify-between gap-3 pt-2">
                    {step === 'mode' ? (
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                    ) : step === 'done' ? (
                        <Button variant="ghost" onClick={onClose}>Close</Button>
                    ) : (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                if (step === 'connect') {
                                    setStep(draftMode === 'live' ? 'location' : 'mode');
                                } else {
                                    setStep('mode');
                                }
                            }}
                        >
                            Back
                        </Button>
                    )}

                    {step !== 'done' && (
                        <Button onClick={handleNext} disabled={step === 'connect' && !connectedReader}>
                            {step === 'connect' ? 'Save Setup' : 'Continue'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
