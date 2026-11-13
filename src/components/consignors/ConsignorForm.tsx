import { useEffect, useState } from 'react';
import { FormEvent } from 'react';
import type { ReactNode } from 'react';
import { Input, Textarea } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/consignorRateSchedules';
import { changedFields } from '../../lib/changedFields';
import { calculateBoothRent, getConsignorDisplayName, getConsignorPayToName } from '../../lib/consignors';
import { formatCurrency } from '../../lib/utils';
import type { Consignor, ConsignorInput } from '../../types';

/** Which part of the consignor record the form edits. 'all' shows every section (used when adding). */
export type ConsignorFormSection = 'all' | 'identity' | 'terms' | 'notes';

interface ConsignorFormProps {
    consignor?: Consignor;
    section?: ConsignorFormSection;
    onSubmit: (data: Partial<ConsignorInput>) => Promise<{ error: string | null }>;
    onCancel: () => void;
}

export function ConsignorForm({ consignor, section = 'all', onSubmit, onCancel }: ConsignorFormProps) {
    const shows = (name: ConsignorFormSection) => section === 'all' || section === name;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingScheduledChange, setIsLoadingScheduledChange] = useState(false);
    const [hasScheduledChange, setHasScheduledChange] = useState(false);
    const [scheduledChange, setScheduledChange] = useState({
        effective_date: '',
        commission_split: consignor?.commission_split ?? 0.6,
        booth_square_feet: Number(consignor?.booth_square_feet) || 0,
        booth_cost_per_square_foot: Number(consignor?.booth_cost_per_square_foot) || 0,
        monthly_booth_rent: calculateBoothRent(
            Number(consignor?.booth_square_feet) || 0,
            Number(consignor?.booth_cost_per_square_foot) || 0
        ),
    });

    const [formData, setFormData] = useState({
        first_name: consignor?.first_name || '',
        last_name: consignor?.last_name || '',
        business_name: consignor?.business_name || '',
        pay_to_type: consignor?.pay_to_type || 'business',
        has_w9_filled_out: consignor?.has_w9_filled_out ?? false,
        consignor_number: consignor?.consignor_number || '',
        booth_location: consignor?.booth_location || '',
        booth_square_feet: Number(consignor?.booth_square_feet) || 0,
        booth_cost_per_square_foot: Number(consignor?.booth_cost_per_square_foot) || 0,
        email: consignor?.email || '',
        phone: consignor?.phone || '',
        address: consignor?.address || '',
        address_line_2: consignor?.address_line_2 || '',
        city: consignor?.city || '',
        state: consignor?.state || '',
        postal_code: consignor?.postal_code || '',
        country: consignor?.country || '',
        storefront_description: consignor?.storefront_description || '',
        notes: consignor?.notes || '',
        commission_split: consignor?.commission_split ?? 0.6,
        consignor_pays_card_fee: consignor?.consignor_pays_card_fee ?? false,
        dealer_discount_percent: Number(consignor?.dealer_discount_percent) || 0,
        monthly_booth_rent: calculateBoothRent(
            Number(consignor?.booth_square_feet) || 0,
            Number(consignor?.booth_cost_per_square_foot) || 0
        ),
        scheduled_active_date: consignor?.scheduled_active_date || '',
        is_active: consignor?.is_active ?? true,
    });

    // What the form opened with. An edit saves only the fields changed since then.
    const [initialFormData] = useState(formData);

    useEffect(() => {
        const fetchUpcomingScheduledChange = async () => {
            if (!consignor?.id) return;

            setIsLoadingScheduledChange(true);
            const today = getLocalDateString();

            const { data, error: fetchError } = await supabase
                .from('consignor_rate_schedules')
                .select('effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent')
                .eq('consignor_id', consignor.id)
                .gte('effective_date', today)
                .order('effective_date', { ascending: true })
                .limit(1)
                .maybeSingle();

            let scheduleData: {
                effective_date: string;
                commission_split: number;
                booth_square_feet?: number | null;
                booth_cost_per_square_foot?: number | null;
                monthly_booth_rent: number;
            } | null = data as {
                effective_date: string;
                commission_split: number;
                booth_square_feet?: number | null;
                booth_cost_per_square_foot?: number | null;
                monthly_booth_rent: number;
            } | null;
            let scheduleError = fetchError;
            if (
                scheduleError &&
                `${scheduleError.message || ''} ${scheduleError.details || ''}`.toLowerCase().includes('booth_')
            ) {
                const legacyResult = await supabase
                    .from('consignor_rate_schedules')
                    .select('effective_date, commission_split, monthly_booth_rent')
                    .eq('consignor_id', consignor.id)
                    .gte('effective_date', today)
                    .order('effective_date', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                scheduleData = legacyResult.data as {
                    effective_date: string;
                    commission_split: number;
                    monthly_booth_rent: number;
                } | null;
                scheduleError = legacyResult.error;
            }

            setIsLoadingScheduledChange(false);

            if (scheduleError || !scheduleData) return;

            setHasScheduledChange(true);
            const savedMonthlyBoothRent = Number(scheduleData.monthly_booth_rent ?? 0);
            const hasScheduleBoothFormula =
                scheduleData.booth_square_feet !== undefined &&
                scheduleData.booth_cost_per_square_foot !== undefined;
            const boothSquareFeet = Number(
                hasScheduleBoothFormula
                    ? scheduleData.booth_square_feet
                    : (consignor.booth_square_feet ?? 0)
            ) || 0;
            const boothCostPerSquareFoot = Number(
                hasScheduleBoothFormula
                    ? scheduleData.booth_cost_per_square_foot
                    : (boothSquareFeet > 0
                        ? savedMonthlyBoothRent / boothSquareFeet
                        : (consignor.booth_cost_per_square_foot ?? 0))
            ) || 0;
            setScheduledChange({
                effective_date: scheduleData.effective_date,
                commission_split: Number(scheduleData.commission_split),
                booth_square_feet: boothSquareFeet,
                booth_cost_per_square_foot: boothCostPerSquareFoot,
                monthly_booth_rent: savedMonthlyBoothRent,
            });
        };

        void fetchUpcomingScheduledChange();
    }, [consignor?.id]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        const hasBusinessName = formData.business_name.trim().length > 0;
        const hasIndividualName = formData.first_name.trim().length > 0 || formData.last_name.trim().length > 0;

        if (!hasBusinessName && !hasIndividualName) {
            setError('Enter a business name or individual name');
            return;
        }
        if (formData.pay_to_type === 'business' && !hasBusinessName) {
            setError('Business name is required when Pay To is Business');
            return;
        }
        if (formData.pay_to_type === 'individual' && !hasIndividualName) {
            setError('First or last name is required when Pay To is Individual');
            return;
        }

        if (shows('terms') && hasScheduledChange && !scheduledChange.effective_date) {
            setError('Scheduled change date is required');
            return;
        }

        setIsSubmitting(true);
        // Only the terms section edits the scheduled change; other sections leave it untouched.
        const scheduledRateChange =
            !shows('terms') || (consignor?.id && isLoadingScheduledChange)
                ? undefined
                : (hasScheduledChange
                    ? {
                        effective_date: scheduledChange.effective_date,
                        commission_split: scheduledChange.commission_split,
                        booth_square_feet: scheduledChange.booth_square_feet,
                        booth_cost_per_square_foot: scheduledChange.booth_cost_per_square_foot,
                        monthly_booth_rent: calculateBoothRent(
                            scheduledChange.booth_square_feet,
                            scheduledChange.booth_cost_per_square_foot
                        ),
                    }
                    : (consignor?.id ? null : undefined));

        const full: Partial<ConsignorInput> = {
            ...formData,
            name: getConsignorDisplayName(formData),
            monthly_booth_rent: calculateBoothRent(formData.booth_square_feet, formData.booth_cost_per_square_foot),
            scheduled_active_date: formData.scheduled_active_date || null,
        };
        let payload = full;
        if (consignor?.id) {
            // Editing: send only what changed, so a save from a screen opened earlier cannot put
            // back an email, split or active flag that was changed elsewhere since. The name and
            // rent are derived from the fields that are sent.
            const changed = changedFields(initialFormData, formData);
            delete changed.monthly_booth_rent;
            payload = {};
            for (const key of Object.keys(changed) as Array<keyof typeof changed>) {
                Object.assign(payload, { [key]: full[key as keyof ConsignorInput] });
            }
        }
        const result = await onSubmit({ ...payload, scheduled_rate_change: scheduledRateChange });
        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
    };

    const updateField = (field: string, value: string | number | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const checkboxClass = 'w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]';
    const showHeadings = section === 'all';

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            {shows('identity') && (
                <>
                    <FormSection title="Identity" showHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Business Name"
                                value={formData.business_name}
                                onChange={(e) => updateField('business_name', e.target.value)}
                                placeholder="Raven Vintage"
                            />
                            <Input
                                label="Consignor ID"
                                value={formData.consignor_number}
                                onChange={(e) => updateField('consignor_number', e.target.value)}
                                placeholder="Auto-generated if empty"
                            />
                            <Input
                                label="First Name"
                                value={formData.first_name}
                                onChange={(e) => updateField('first_name', e.target.value)}
                                placeholder="John"
                            />
                            <Input
                                label="Last Name"
                                value={formData.last_name}
                                onChange={(e) => updateField('last_name', e.target.value)}
                                placeholder="Smith"
                            />
                            <Select
                                label="Pay To"
                                value={formData.pay_to_type}
                                onChange={(e) => updateField('pay_to_type', e.target.value)}
                                options={[
                                    { value: 'business', label: 'Business' },
                                    { value: 'individual', label: 'Individual' },
                                ]}
                            />
                            <Input
                                label="Booth/Location"
                                value={formData.booth_location}
                                onChange={(e) => updateField('booth_location', e.target.value)}
                                placeholder="Booth A-12"
                            />
                        </div>
                        <p className="text-xs text-[var(--color-muted)]">
                            Shown in RavenPOS as{' '}
                            <strong className="text-[var(--color-foreground)]">{getConsignorDisplayName(formData) || '—'}</strong>
                            {' · '}Payouts made out to{' '}
                            <strong className="text-[var(--color-foreground)]">{getConsignorPayToName(formData) || '—'}</strong>
                        </p>
                    </FormSection>

                    <FormSection title="Contact" showHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="col-span-2 sm:col-span-1">
                                <Input
                                    label="City"
                                    value={formData.city}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    placeholder="Nashville"
                                />
                            </div>
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
                            <div className="col-span-2 sm:col-span-1">
                                <Input
                                    label="Country"
                                    value={formData.country}
                                    onChange={(e) => updateField('country', e.target.value)}
                                    placeholder="USA"
                                />
                            </div>
                        </div>
                    </FormSection>
                </>
            )}

            {shows('terms') && (
                <>
                    <FormSection title="Commission" showHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                label="Dealer Discount (%)"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={formData.dealer_discount_percent}
                                onChange={(e) => updateField('dealer_discount_percent', Number(e.target.value) || 0)}
                                hint="Applied at checkout only when Dealer Discount is on."
                            />
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.consignor_pays_card_fee}
                                    onChange={(e) => updateField('consignor_pays_card_fee', e.target.checked)}
                                    className={checkboxClass}
                                />
                                <span className="text-sm font-medium">Consignor Pays Card Fee</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!formData.has_w9_filled_out}
                                    onChange={(e) => updateField('has_w9_filled_out', e.target.checked)}
                                    className={checkboxClass}
                                />
                                <span className="text-sm font-medium">W-9 On File</span>
                            </label>
                        </div>
                    </FormSection>

                    <FormSection title="Booth rent" showHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Booth Square Feet"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.booth_square_feet}
                                onChange={(e) => {
                                    const boothSquareFeet = Number(e.target.value) || 0;
                                    updateField('booth_square_feet', boothSquareFeet);
                                    updateField(
                                        'monthly_booth_rent',
                                        calculateBoothRent(boothSquareFeet, formData.booth_cost_per_square_foot)
                                    );
                                }}
                            />
                            <Input
                                label="Cost Per Sq Ft"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.booth_cost_per_square_foot}
                                onChange={(e) => {
                                    const boothCostPerSquareFoot = Number(e.target.value) || 0;
                                    updateField('booth_cost_per_square_foot', boothCostPerSquareFoot);
                                    updateField(
                                        'monthly_booth_rent',
                                        calculateBoothRent(formData.booth_square_feet, boothCostPerSquareFoot)
                                    );
                                }}
                            />
                        </div>
                        <p className="text-xs text-[var(--color-muted)]">
                            Monthly rent:{' '}
                            <strong className="text-[var(--color-foreground)]">{formatCurrency(formData.monthly_booth_rent)}</strong>
                            {' '}(square feet × cost per square foot)
                        </p>
                    </FormSection>

                    <FormSection title="Status" showHeading>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:items-start">
                            <label className="flex items-center gap-2 cursor-pointer sm:pt-8">
                                <input
                                    type="checkbox"
                                    checked={formData.is_active}
                                    onChange={(e) => updateField('is_active', e.target.checked)}
                                    className={checkboxClass}
                                />
                                <span className="text-sm font-medium">Active</span>
                            </label>
                            <Input
                                label="Schedule Active Date (optional)"
                                type="date"
                                value={formData.scheduled_active_date}
                                onChange={(e) => updateField('scheduled_active_date', e.target.value)}
                                hint="If in the future, status shows as Scheduled until then."
                            />
                        </div>
                    </FormSection>

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
                                    className={checkboxClass}
                                />
                                <span className="text-sm font-medium">Enable</span>
                            </label>
                        </div>

                        {hasScheduledChange && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                        label="Future Booth Sq Ft"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={scheduledChange.booth_square_feet}
                                        onChange={(e) => {
                                            const boothSquareFeet = Number(e.target.value) || 0;
                                            setScheduledChange((prev) => ({
                                                ...prev,
                                                booth_square_feet: boothSquareFeet,
                                                monthly_booth_rent: calculateBoothRent(
                                                    boothSquareFeet,
                                                    prev.booth_cost_per_square_foot
                                                ),
                                            }));
                                        }}
                                    />
                                    <Input
                                        label="Future Cost Per Sq Ft"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={scheduledChange.booth_cost_per_square_foot}
                                        onChange={(e) => {
                                            const boothCostPerSquareFoot = Number(e.target.value) || 0;
                                            setScheduledChange((prev) => ({
                                                ...prev,
                                                booth_cost_per_square_foot: boothCostPerSquareFoot,
                                                monthly_booth_rent: calculateBoothRent(
                                                    prev.booth_square_feet,
                                                    boothCostPerSquareFoot
                                                ),
                                            }));
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-[var(--color-muted)]">
                                    Future monthly rent:{' '}
                                    <strong className="text-[var(--color-foreground)]">{formatCurrency(scheduledChange.monthly_booth_rent)}</strong>
                                </p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {shows('notes') && (
                <FormSection title="Bio & notes" showHeading={showHeadings}>
                    <Textarea
                        label="Vendor Bio"
                        value={formData.storefront_description}
                        onChange={(e) => updateField('storefront_description', e.target.value.slice(0, 5000))}
                        placeholder="Tell shoppers what makes this vendor's booth unique."
                        hint="Shown on the public vendor storefront."
                        maxLength={5000}
                        rows={4}
                    />
                    <Textarea
                        label="Notes"
                        value={formData.notes}
                        onChange={(e) => updateField('notes', e.target.value)}
                        placeholder="Any additional notes..."
                        rows={3}
                    />
                </FormSection>
            )}

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

function FormSection({ title, showHeading, children }: { title: string; showHeading: boolean; children: ReactNode }) {
    return (
        <section className="space-y-4">
            {showHeading && (
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
            )}
            {children}
        </section>
    );
}
