import { useEffect, useState } from 'react';
import { FormEvent } from 'react';
import { Input, Textarea } from '../ui/Input';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/consignorRateSchedules';
import type { Consignor, ConsignorInput } from '../../types';

interface ConsignorFormProps {
    consignor?: Consignor;
    onSubmit: (data: Partial<ConsignorInput>) => Promise<{ error: string | null }>;
    onCancel: () => void;
}

export function ConsignorForm({ consignor, onSubmit, onCancel }: ConsignorFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingScheduledChange, setIsLoadingScheduledChange] = useState(false);
    const [hasScheduledChange, setHasScheduledChange] = useState(false);
    const [scheduledChange, setScheduledChange] = useState({
        effective_date: '',
        commission_split: consignor?.commission_split ?? 0.6,
        monthly_booth_rent: consignor?.monthly_booth_rent ?? 0,
    });

    const [formData, setFormData] = useState({
        name: consignor?.name || '',
        consignor_number: consignor?.consignor_number || '',
        booth_location: consignor?.booth_location || '',
        email: consignor?.email || '',
        phone: consignor?.phone || '',
        address: consignor?.address || '',
        address_line_2: consignor?.address_line_2 || '',
        city: consignor?.city || '',
        state: consignor?.state || '',
        postal_code: consignor?.postal_code || '',
        country: consignor?.country || '',
        notes: consignor?.notes || '',
        commission_split: consignor?.commission_split ?? 0.6,
        consignor_pays_card_fee: consignor?.consignor_pays_card_fee ?? false,
        monthly_booth_rent: consignor?.monthly_booth_rent ?? 0,
        scheduled_active_date: consignor?.scheduled_active_date || '',
        is_active: consignor?.is_active ?? true,
    });

    useEffect(() => {
        const fetchUpcomingScheduledChange = async () => {
            if (!consignor?.id) return;

            setIsLoadingScheduledChange(true);
            const today = getLocalDateString();

            const { data, error: fetchError } = await supabase
                .from('consignor_rate_schedules')
                .select('effective_date, commission_split, monthly_booth_rent')
                .eq('consignor_id', consignor.id)
                .gt('effective_date', today)
                .order('effective_date', { ascending: true })
                .limit(1)
                .maybeSingle();

            setIsLoadingScheduledChange(false);

            if (fetchError || !data) return;

            setHasScheduledChange(true);
            setScheduledChange({
                effective_date: data.effective_date,
                commission_split: Number(data.commission_split),
                monthly_booth_rent: Number(data.monthly_booth_rent),
            });
        };

        void fetchUpcomingScheduledChange();
    }, [consignor?.id]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }

        if (hasScheduledChange && !scheduledChange.effective_date) {
            setError('Scheduled change date is required');
            return;
        }

        setIsSubmitting(true);
        const scheduledRateChange =
            consignor?.id && isLoadingScheduledChange
                ? undefined
                : (hasScheduledChange
                    ? {
                        effective_date: scheduledChange.effective_date,
                        commission_split: scheduledChange.commission_split,
                        monthly_booth_rent: scheduledChange.monthly_booth_rent,
                    }
                    : (consignor?.id ? null : undefined));

        const result = await onSubmit({
            ...formData,
            scheduled_active_date: formData.scheduled_active_date || null,
            scheduled_rate_change: scheduledRateChange,
        });
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
                label="Street Address"
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="123 Main St"
            />

            <Input
                label="Address Line 2"
                value={formData.address_line_2}
                onChange={(e) => updateField('address_line_2', e.target.value)}
                placeholder="Suite, Apt, Unit (optional)"
            />

            <div className="grid grid-cols-3 gap-4">
                <Input
                    label="City"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    placeholder="Nashville"
                />
                <Input
                    label="State"
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    placeholder="TN"
                />
                <Input
                    label="ZIP"
                    value={formData.postal_code}
                    onChange={(e) => updateField('postal_code', e.target.value)}
                    placeholder="37201"
                />
            </div>

            <Input
                label="Country"
                value={formData.country}
                onChange={(e) => updateField('country', e.target.value)}
                placeholder="USA"
            />

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <Input
                label="Schedule Active Date (optional)"
                type="date"
                value={formData.scheduled_active_date}
                onChange={(e) => updateField('scheduled_active_date', e.target.value)}
                hint="If set in the future, status shows as Scheduled until that date."
            />

            <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium">Schedule Future Terms Change</p>
                        <p className="text-xs text-[var(--color-muted)]">
                            Keep current rates now and apply new ones on a future date.
                        </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hasScheduledChange}
                            disabled={isLoadingScheduledChange}
                            onChange={(e) => setHasScheduledChange(e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-sm font-medium">Enable</span>
                    </label>
                </div>

                {hasScheduledChange && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                            label="Effective Date"
                            type="date"
                            min={getLocalDateString()}
                            value={scheduledChange.effective_date}
                            onChange={(e) => setScheduledChange((prev) => ({ ...prev, effective_date: e.target.value }))}
                        />
                        <Input
                            label="Future Commission (%)"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={Number((scheduledChange.commission_split * 100).toFixed(2))}
                            onChange={(e) => setScheduledChange((prev) => ({
                                ...prev,
                                commission_split: Number(e.target.value) / 100
                            }))}
                        />
                        <Input
                            label="Future Monthly Booth Rent"
                            type="number"
                            min="0"
                            step="0.01"
                            value={scheduledChange.monthly_booth_rent}
                            onChange={(e) => setScheduledChange((prev) => ({
                                ...prev,
                                monthly_booth_rent: Number(e.target.value)
                            }))}
                        />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.consignor_pays_card_fee}
                            onChange={(e) => updateField('consignor_pays_card_fee', e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-sm font-medium">Consignor Pays Card Fee</span>
                    </label>
                </div>
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
