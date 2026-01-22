// Edit Time Entry Modal - Admin interface for editing time entries
// Includes start/end time pickers, lunch break, and audit trail

import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import type { TimeEntry } from '../../types/employee';

interface EditTimeEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (updates: TimeEntryUpdate) => Promise<{ error: string | null }>;
    entry: TimeEntry | null;
}

export interface TimeEntryUpdate {
    id: string;
    clock_in: string;
    clock_out: string | null;
    lunch_break_minutes: number;
    notes: string | null;
}

export function EditTimeEntryModal({ isOpen, onClose, onSubmit, entry }: EditTimeEntryModalProps) {
    const [clockInDate, setClockInDate] = useState('');
    const [clockInTime, setClockInTime] = useState('');
    const [clockOutDate, setClockOutDate] = useState('');
    const [clockOutTime, setClockOutTime] = useState('');
    const [lunchBreak, setLunchBreak] = useState('0');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset form when opening/closing or when entry changes
    useEffect(() => {
        if (isOpen && entry) {
            const clockIn = new Date(entry.clock_in);
            setClockInDate(clockIn.toISOString().split('T')[0]);
            setClockInTime(clockIn.toTimeString().slice(0, 5));

            if (entry.clock_out) {
                const clockOut = new Date(entry.clock_out);
                setClockOutDate(clockOut.toISOString().split('T')[0]);
                setClockOutTime(clockOut.toTimeString().slice(0, 5));
            } else {
                setClockOutDate('');
                setClockOutTime('');
            }

            setLunchBreak((entry.lunch_break_minutes || 0).toString());
            setNotes(entry.notes || '');
        }
        setError(null);
    }, [isOpen, entry]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!entry) return;

        setError(null);

        // Validate
        if (!clockInDate || !clockInTime) {
            setError('Clock in date and time are required');
            return;
        }

        // Build ISO strings
        const clockInISO = new Date(`${clockInDate}T${clockInTime}`).toISOString();
        let clockOutISO: string | null = null;

        if (clockOutDate && clockOutTime) {
            clockOutISO = new Date(`${clockOutDate}T${clockOutTime}`).toISOString();

            // Validate clock out is after clock in
            if (new Date(clockOutISO) <= new Date(clockInISO)) {
                setError('Clock out must be after clock in');
                return;
            }
        }

        const lunchMins = parseInt(lunchBreak) || 0;
        if (lunchMins < 0) {
            setError('Lunch break cannot be negative');
            return;
        }

        setIsSubmitting(true);

        const result = await onSubmit({
            id: entry.id,
            clock_in: clockInISO,
            clock_out: clockOutISO,
            lunch_break_minutes: lunchMins,
            notes: notes.trim() || null,
        });

        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        } else {
            onClose();
        }
    };

    const formatEditInfo = () => {
        if (!entry?.edited_at) return null;
        const date = new Date(entry.edited_at);
        return `Last edited: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Time Entry"
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Clock In */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">Clock In *</label>
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            type="date"
                            value={clockInDate}
                            onChange={(e) => setClockInDate(e.target.value)}
                        />
                        <Input
                            type="time"
                            value={clockInTime}
                            onChange={(e) => setClockInTime(e.target.value)}
                        />
                    </div>
                </div>

                {/* Clock Out */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">Clock Out</label>
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            type="date"
                            value={clockOutDate}
                            onChange={(e) => setClockOutDate(e.target.value)}
                        />
                        <Input
                            type="time"
                            value={clockOutTime}
                            onChange={(e) => setClockOutTime(e.target.value)}
                        />
                    </div>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                        Leave blank if still clocked in
                    </p>
                </div>

                {/* Lunch Break */}
                <Input
                    label="Lunch Break (minutes)"
                    type="number"
                    min="0"
                    step="5"
                    value={lunchBreak}
                    onChange={(e) => setLunchBreak(e.target.value)}
                    placeholder="0"
                />

                {/* Notes */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional notes about this shift..."
                        className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] min-h-[80px]"
                    />
                </div>

                {/* Audit info */}
                {entry?.edited_at && (
                    <div className="p-2 rounded bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                        ✏️ {formatEditInfo()}
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
                        Save Changes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
