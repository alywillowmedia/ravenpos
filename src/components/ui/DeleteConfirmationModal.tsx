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
}

export function DeleteConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    isLoading = false,
    targetName,
    itemCount = 0,
    description,
}: DeleteConfirmationModalProps) {
    const [confirmText, setConfirmText] = useState('');
    const requiredText = `Delete ${targetName}`;
    const isConfirmed = confirmText.trim() === requiredText;

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
            title="⚠️ Delete Vendor"
            size="md"
        >
            <div className="space-y-4">
                {/* Warning Message */}
                <div className="p-4 rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger)]">
                    <p className="text-sm font-semibold text-[var(--color-danger)] mb-2">
                        WARNING: This action cannot be undone
                    </p>
                    <p className="text-sm text-[var(--color-danger)]">
                        Deleting <strong>{targetName}</strong>'s information will permanently remove:
                    </p>
                    <ul className="list-disc list-inside text-sm text-[var(--color-danger)] mt-2 space-y-1">
                        <li>Their vendor profile and account</li>
                        <li>All {itemCount} item{itemCount !== 1 ? 's' : ''} in their inventory</li>
                        <li>All associated transaction history</li>
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
                        To confirm, type <code className="bg-[var(--color-surface)] px-2 py-1 rounded text-xs font-mono">Delete {targetName}</code> below
                    </label>
                    <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={`Type "Delete ${targetName}" to confirm`}
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
                        Permanently Delete
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
