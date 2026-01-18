import { useState } from 'react';
import { FormEvent } from 'react';
import { Input, Textarea } from '../ui/Input';
import { Button } from '../ui/Button';
import type { Consignor } from '../../types';

interface ConsignorFormProps {
    consignor?: Consignor;
    onSubmit: (data: Partial<Consignor>) => Promise<{ error: string | null }>;
    onCancel: () => void;
}

export function ConsignorForm({ consignor, onSubmit, onCancel }: ConsignorFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: consignor?.name || '',
        consignor_number: consignor?.consignor_number || '',
        booth_location: consignor?.booth_location || '',
        email: consignor?.email || '',
        phone: consignor?.phone || '',
        address: consignor?.address || '',
        notes: consignor?.notes || '',
        commission_split: consignor?.commission_split ?? 0.6,
        monthly_booth_rent: consignor?.monthly_booth_rent ?? 0,
        is_active: consignor?.is_active ?? true,
    });

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }

        setIsSubmitting(true);
        const result = await onSubmit(formData);
        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
    };

    const updateField = (field: string, value: string | number | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <Input
                    label="Name"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="John Smith"
                    required
                />
                <Input
                    label="Consignor ID"
                    value={formData.consignor_number}
                    onChange={(e) => updateField('consignor_number', e.target.value)}
                    placeholder="Auto-generated if empty"
                    hint="Leave blank to auto-generate"
                />
            </div>

            <Input
                label="Booth/Location"
                value={formData.booth_location}
                onChange={(e) => updateField('booth_location', e.target.value)}
                placeholder="Booth A-12"
            />

            <div className="grid grid-cols-2 gap-4">
                <Input
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="john@example.com"
                />
                <Input
                    label="Phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                />
            </div>

            <Input
                label="Address"
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="123 Main St, City, State 12345"
            />

            <div className="grid grid-cols-3 gap-4">
                <Input
                    label="Commission Split (%)"
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(formData.commission_split * 100)}
                    onChange={(e) => updateField('commission_split', Number(e.target.value) / 100)}
                    hint="Consignor's percentage"
                />
                <Input
                    label="Monthly Booth Rent"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.monthly_booth_rent}
                    onChange={(e) => updateField('monthly_booth_rent', Number(e.target.value))}
                    hint="$0 if none"
                />
                <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={(e) => updateField('is_active', e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-sm font-medium">Active</span>
                    </label>
                </div>
            </div>

            <Textarea
                label="Notes"
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
            />

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                    {consignor ? 'Save Changes' : 'Add Consignor'}
                </Button>
            </div>
        </form>
    );
}
