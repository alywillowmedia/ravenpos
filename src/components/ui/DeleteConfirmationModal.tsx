import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isLoading?: boolean;
    targetName: string;
    itemCount?: number;
    description?: string;
    title?: string;
    warningIntro?: string;
    consequences?: string[];
    confirmActionLabel?: string;
    confirmButtonLabel?: string;
    warningLabel?: string;
}

export function DeleteConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    isLoading = false,
    targetName,
    itemCount = 0,
    description,
    title = '⚠️ Delete Vendor',
    warningIntro,
    consequences,
    confirmActionLabel = 'Delete',
    confirmButtonLabel = 'Permanently Delete',
    warningLabel = 'WARNING: This action cannot be undone',
}: DeleteConfirmationModalProps) {
    const [confirmText, setConfirmText] = useState('');
    const requiredText = `${confirmActionLabel} ${targetName}`;
    const isConfirmed = confirmText.trim() === requiredText;
    const warningLines = consequences || [
        'Their vendor profile and account',
        `All ${itemCount} item${itemCount !== 1 ? 's' : ''} in their inventory`,
        'All associated transaction history',
    ];
    const warningHeading = warningIntro || `Deleting ${targetName}'s information will permanently remove:`;

    const handleConfirm = () => {
        if (isConfirmed) {
            onConfirm();
            setConfirmText('');
        }
    };

    const handleClose = () => {
        setConfirmText('');
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={title}
            size="md"
        >
            <div className="space-y-4">
                {/* Warning Message */}
                <div className="p-4 rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger)]">
                    <p className="text-sm font-semibold text-[var(--color-danger)] mb-2">
                        {warningLabel}
                    </p>
                    <p className="text-sm text-[var(--color-danger)]">
                        {warningHeading}
                    </p>
                    <ul className="list-disc list-inside text-sm text-[var(--color-danger)] mt-2 space-y-1">
                        {warningLines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>

                {description && (
                    <p className="text-sm text-[var(--color-muted)]">
                        {description}
                    </p>
                )}

                {/* Confirmation Input */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-foreground)]">
                        To confirm, type <code className="bg-[var(--color-surface)] px-2 py-1 rounded text-xs font-mono">{confirmActionLabel} {targetName}</code> below
                    </label>
                    <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={`Type "${confirmActionLabel} ${targetName}" to confirm`}
                        type="text"
                        autoFocus
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end pt-4 border-t border-[var(--color-border)]">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        onClick={handleConfirm}
                        disabled={!isConfirmed || isLoading}
                        isLoading={isLoading}
                    >
                        {confirmButtonLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
