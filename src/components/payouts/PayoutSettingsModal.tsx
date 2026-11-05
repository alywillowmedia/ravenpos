import { useEffect, useState } from 'react';
import { updateDefaultThreshold } from '../../hooks/usePayouts';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, ModalFooter } from '../ui/Modal';

function validateMinimum(value: string): string | null {
    const trimmed = value.trim();
    if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(trimmed)) return 'Enter an amount of $0.00 or more.';
    return null;
}

export function PayoutSettingsModal({
    isOpen,
    current,
    onClose,
    onSaved,
}: {
    isOpen: boolean;
    current: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const toast = useToast();
    const [value, setValue] = useState(current.toFixed(2));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(current.toFixed(2));
            setError(null);
        }
    }, [isOpen, current]);

    const save = async () => {
        const problem = validateMinimum(value);
        if (problem) {
            setError(problem);
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await updateDefaultThreshold(Number(value));
            toast.success('Minimum payout saved');
            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the minimum payout.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Payout settings" size="sm">
            <Input
                label="Minimum payout"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                error={error ?? undefined}
                hint="Existing drafts keep the minimum they were saved with."
            />
            <ModalFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={() => void save()} isLoading={isSaving}>Save</Button>
            </ModalFooter>
        </Modal>
    );
}
