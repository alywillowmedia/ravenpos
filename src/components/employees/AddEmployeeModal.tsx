// Add Employee Modal - Admin interface for creating/editing employees

import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import type { Employee, EmployeeInput } from '../../types/employee';

interface AddEmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: EmployeeInput, newPin?: string) => Promise<{ error: string | null }>;
    employee?: Employee | null; // If provided, we're editing
}

export function AddEmployeeModal({ isOpen, onClose, onSubmit, employee }: AddEmployeeModalProps) {
    const [name, setName] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isEditing = !!employee;

    // Reset form when opening/closing or when employee changes
    useEffect(() => {
        if (isOpen && employee) {
            setName(employee.name);
            setHourlyRate(employee.hourly_rate.toString());
            setIsActive(employee.is_active);
            setPin('');
            setConfirmPin('');
        } else if (isOpen) {
            setName('');
            setHourlyRate('');
            setPin('');
            setConfirmPin('');
            setIsActive(true);
        }
        setError(null);
    }, [isOpen, employee]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        // PIN validation (required for new employees, optional for editing)
        if (!isEditing && !pin) {
            setError('PIN is required');
            return;
        }

        if (pin && !/^\d{4,6}$/.test(pin)) {
            setError('PIN must be 4-6 digits');
            return;
        }

        if (pin && pin !== confirmPin) {
            setError('PINs do not match');
            return;
        }

        const rate = parseFloat(hourlyRate) || 0;

        setIsSubmitting(true);

        const result = await onSubmit(
            {
                name: name.trim(),
                pin: pin || '',
                hourly_rate: rate,
                is_active: isActive,
            },
            isEditing && pin ? pin : undefined
        );

        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        } else {
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Employee' : 'Add Employee'}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Name *"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Employee name"
                    autoFocus
                />

                <Input
                    label="Hourly Rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="0.00"
                    leftIcon={<span className="text-[var(--color-muted)]">$</span>}
                />

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label={isEditing ? 'New PIN (leave blank to keep current)' : 'PIN *'}
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                    />
                    <Input
                        label="Confirm PIN"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        disabled={!pin}
                    />
                </div>
                <p className="text-xs text-[var(--color-muted)] -mt-2">
                    PIN must be 4-6 digits
                </p>

                {isEditing && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface)]">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="w-4 h-4 rounded"
                        />
                        <label htmlFor="isActive" className="text-sm">
                            Employee is active (can log in with PIN)
                        </label>
                    </div>
                )}

                {error && (
                    <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                        {error}
                    </div>
                )}

                <div className="flex gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
                        Cancel
                    </Button>
                    <Button type="submit" className="flex-1" isLoading={isSubmitting}>
                        {isEditing ? 'Save Changes' : 'Add Employee'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
