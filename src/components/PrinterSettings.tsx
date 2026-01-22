import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface PrinterInfo {
    name: string;
    displayName: string;
    isDefault: boolean;
}

interface PrinterSettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Printer settings component for configuring the thermal receipt printer.
 * Only functional when running inside the Electron desktop app.
 */
export function PrinterSettings({ isOpen, onClose }: PrinterSettingsProps) {
    const [printers, setPrinters] = useState<PrinterInfo[]>([]);
    const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

    useEffect(() => {
        if (isOpen && isElectron) {
            loadPrinters();
        }
    }, [isOpen, isElectron]);

    async function loadPrinters() {
        setLoading(true);
        try {
            const [printerList, current] = await Promise.all([
                window.electronAPI!.getPrinters(),
                window.electronAPI!.getSelectedPrinter(),
            ]);
            setPrinters(printerList);
            setSelectedPrinter(current);
        } catch (error) {
            console.error('Failed to load printers:', error);
            setMessage({ type: 'error', text: 'Failed to load printers' });
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            await window.electronAPI!.setSelectedPrinter(selectedPrinter);
            setMessage({ type: 'success', text: 'Printer settings saved!' });
            setTimeout(() => {
                onClose();
                setMessage(null);
            }, 1500);
        } catch (error) {
            console.error('Failed to save printer:', error);
            setMessage({ type: 'error', text: 'Failed to save printer settings' });
        } finally {
            setSaving(false);
        }
    }

    function handleAutoDetect() {
        setSelectedPrinter(null);
    }

    if (!isElectron) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Printer Settings" size="md">
                <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-muted)]">
                            <polyline points="6 9 6 2 18 2 18 9" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Desktop App Required</h3>
                    <p className="text-[var(--color-muted)] text-sm max-w-xs mx-auto">
                        Thermal printer configuration is only available in the RavenPOS desktop application.
                    </p>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Printer Settings" size="md">
            <div className="space-y-6">
                {/* Message */}
                {message && (
                    <div className={`p-3 rounded-lg text-sm ${message.type === 'success'
                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                            : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        }`}>
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Auto-detect option */}
                        <div
                            onClick={handleAutoDetect}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedPrinter === null
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPrinter === null
                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                                        : 'border-[var(--color-muted)]'
                                    }`}>
                                    {selectedPrinter === null && (
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                </div>
                                <div>
                                    <p className="font-medium">Auto-detect Printer</p>
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Automatically find receipt/thermal printers
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Printer list */}
                        {printers.length > 0 && (
                            <div>
                                <p className="text-sm font-medium mb-3 text-[var(--color-muted)]">
                                    Or select a specific printer:
                                </p>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {printers.map((printer) => (
                                        <div
                                            key={printer.name}
                                            onClick={() => setSelectedPrinter(printer.name)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedPrinter === printer.name
                                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedPrinter === printer.name
                                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                                                        : 'border-[var(--color-muted)]'
                                                    }`}>
                                                    {selectedPrinter === printer.name && (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">
                                                        {printer.displayName}
                                                    </p>
                                                    {printer.isDefault && (
                                                        <p className="text-xs text-[var(--color-muted)]">
                                                            System default
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {printers.length === 0 && (
                            <div className="text-center py-4">
                                <p className="text-[var(--color-muted)]">
                                    No printers found. Please connect a receipt printer.
                                </p>
                            </div>
                        )}
                    </>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1"
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="flex-1"
                        isLoading={saving}
                        disabled={loading}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
