import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Consignor, ConsignorInput } from '../types';
import { generateConsignorNumber } from '../lib/utils';
import { calculateBoothRent, getConsignorDisplayName } from '../lib/consignors';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';

function hasMissingScheduleBoothColumnsError(err: unknown): boolean {
    const text = `${(err as { message?: string })?.message || ''} ${(err as { details?: string })?.details || ''}`.toLowerCase();
    return text.includes('booth_square_feet') || text.includes('booth_cost_per_square_foot');
}

export function useConsignors() {
    const [consignors, setConsignors] = useState<Consignor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const syncScheduledRateChange = useCallback(async (
        consignorId: string,
        scheduledRateChange: ConsignorInput['scheduled_rate_change'] | undefined
    ) => {
        if (scheduledRateChange === undefined) return;

        const today = getLocalDateString();

        const { error: clearError } = await supabase
            .from('consignor_rate_schedules')
            .delete()
            .eq('consignor_id', consignorId)
            .gte('effective_date', today);

        if (clearError) {
            throw clearError;
        }

        if (!scheduledRateChange) return;

        const schedulePayload = {
            consignor_id: consignorId,
            effective_date: scheduledRateChange.effective_date,
            commission_split: scheduledRateChange.commission_split,
            monthly_booth_rent: scheduledRateChange.monthly_booth_rent,
        };
        const { error: insertError } = await supabase
            .from('consignor_rate_schedules')
            .insert({
                ...schedulePayload,
                booth_square_feet: scheduledRateChange.booth_square_feet ?? 0,
                booth_cost_per_square_foot: scheduledRateChange.booth_cost_per_square_foot ?? 0,
            });

        if (insertError && hasMissingScheduleBoothColumnsError(insertError)) {
            const { error: legacyInsertError } = await supabase
                .from('consignor_rate_schedules')
                .insert(schedulePayload);
            if (legacyInsertError) {
                throw legacyInsertError;
            }
            return;
        }

        if (insertError) {
            throw insertError;
        }
    }, []);

    const fetchConsignors = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('consignors')
                .select('*')
                .order('consignor_number', { ascending: true });

            if (fetchError) throw fetchError;

            const consignorRows = (data || []) as Consignor[];
            if (consignorRows.length === 0) {
                setConsignors([]);
                return;
            }

            const today = getLocalDateString();
            const consignorIds = consignorRows.map((consignor) => consignor.id);

            const { data: scheduleData, error: scheduleError } = await supabase
                .from('consignor_rate_schedules')
                .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                .in('consignor_id', consignorIds)
                .lte('effective_date', today);

            if (scheduleError) {
                setConsignors(consignorRows);
                return;
            }

            const schedulesByConsignor = new Map<string, ConsignorRateSchedule[]>();
            for (const schedule of ((scheduleData || []) as ConsignorRateSchedule[])) {
                const existing = schedulesByConsignor.get(schedule.consignor_id) || [];
                existing.push(schedule);
                schedulesByConsignor.set(schedule.consignor_id, existing);
            }

            setConsignors(
                consignorRows.map((consignor) =>
                    applyEffectiveConsignorTerms(
                        consignor,
                        schedulesByConsignor.get(consignor.id) || [],
                        today
                    )
                )
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch consignors');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConsignors();
    }, [fetchConsignors]);

    const createConsignor = useCallback(async (input: Partial<ConsignorInput>) => {
        try {
            // Generate consignor number if not provided
            const consignorNumber =
                input.consignor_number ||
                generateConsignorNumber(consignors.map((c) => c.consignor_number));
            const boothSquareFeet = Number(input.booth_square_feet) || 0;
            const boothCostPerSquareFoot = Number(input.booth_cost_per_square_foot) || 0;
            const monthlyBoothRent = calculateBoothRent(boothSquareFeet, boothCostPerSquareFoot);
            const displayName = getConsignorDisplayName(input);

            const { data, error: createError } = await supabase
                .from('consignors')
                .insert({
                    consignor_number: consignorNumber,
                    name: displayName,
                    first_name: input.first_name || null,
                    last_name: input.last_name || null,
                    business_name: input.business_name || null,
                    pay_to_type: input.pay_to_type || 'business',
                    booth_location: input.booth_location || null,
                    booth_square_feet: boothSquareFeet,
                    booth_cost_per_square_foot: boothCostPerSquareFoot,
                    email: input.email || null,
                    phone: input.phone || null,
                    address: input.address || null,
                    address_line_2: input.address_line_2 || null,
                    city: input.city || null,
                    state: input.state || null,
                    postal_code: input.postal_code || null,
                    country: input.country || null,
                    notes: input.notes || null,
                    commission_split: input.commission_split ?? 0.6,
                    consignor_pays_card_fee: input.consignor_pays_card_fee ?? false,
                    dealer_discount_percent: Math.max(0, Math.min(100, Number(input.dealer_discount_percent) || 0)),
                    monthly_booth_rent: monthlyBoothRent,
                    scheduled_active_date: input.scheduled_active_date || null,
                    is_active: input.is_active ?? true,
                })
                .select()
                .single();

            if (createError) throw createError;

            await syncScheduledRateChange(data.id, input.scheduled_rate_change);

            const today = getLocalDateString();
            let nextConsignor = data as Consignor;
            if (input.scheduled_rate_change && input.scheduled_rate_change.effective_date <= today) {
                nextConsignor = {
                    ...nextConsignor,
                    commission_split: Number(input.scheduled_rate_change.commission_split),
                    booth_square_feet: Number(input.scheduled_rate_change.booth_square_feet ?? nextConsignor.booth_square_feet ?? 0),
                    booth_cost_per_square_foot: Number(
                        input.scheduled_rate_change.booth_cost_per_square_foot ?? nextConsignor.booth_cost_per_square_foot ?? 0
                    ),
                    monthly_booth_rent: Number(input.scheduled_rate_change.monthly_booth_rent),
                };
            }

            setConsignors((prev) => [...prev, nextConsignor]);
            return { data: nextConsignor, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create consignor';
            return { data: null, error: message };
        }
    }, [consignors, syncScheduledRateChange]);

    const updateConsignor = useCallback(async (id: string, updates: Partial<ConsignorInput>) => {
        try {
            const { scheduled_rate_change, ...baseUpdates } = updates;
            const existingConsignor = consignors.find((c) => c.id === id);
            const updatePayload: Partial<ConsignorInput> = { ...baseUpdates };

            const hasNameFieldUpdate =
                baseUpdates.first_name !== undefined ||
                baseUpdates.last_name !== undefined ||
                baseUpdates.business_name !== undefined ||
                baseUpdates.name !== undefined;
            if (hasNameFieldUpdate) {
                updatePayload.name = getConsignorDisplayName({
                    ...existingConsignor,
                    ...baseUpdates,
                });
            }

            if (baseUpdates.first_name !== undefined) {
                updatePayload.first_name = baseUpdates.first_name || null;
            }
            if (baseUpdates.last_name !== undefined) {
                updatePayload.last_name = baseUpdates.last_name || null;
            }
            if (baseUpdates.business_name !== undefined) {
                updatePayload.business_name = baseUpdates.business_name || null;
            }
            if (baseUpdates.pay_to_type !== undefined) {
                updatePayload.pay_to_type = baseUpdates.pay_to_type || 'business';
            }

            if (
                baseUpdates.booth_square_feet !== undefined ||
                baseUpdates.booth_cost_per_square_foot !== undefined
            ) {
                const boothSquareFeet = Number(
                    baseUpdates.booth_square_feet ?? existingConsignor?.booth_square_feet
                ) || 0;
                const boothCostPerSquareFoot = Number(
                    baseUpdates.booth_cost_per_square_foot ?? existingConsignor?.booth_cost_per_square_foot
                ) || 0;
                updatePayload.booth_square_feet = boothSquareFeet;
                updatePayload.booth_cost_per_square_foot = boothCostPerSquareFoot;
                updatePayload.monthly_booth_rent = calculateBoothRent(boothSquareFeet, boothCostPerSquareFoot);
            }

            if (baseUpdates.dealer_discount_percent !== undefined) {
                updatePayload.dealer_discount_percent = Math.max(
                    0,
                    Math.min(100, Number(baseUpdates.dealer_discount_percent) || 0)
                );
            }

            const { data, error: updateError } = await supabase
                .from('consignors')
                .update(updatePayload)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            await syncScheduledRateChange(id, scheduled_rate_change);

            const today = getLocalDateString();
            let nextConsignor = data as Consignor;
            if (scheduled_rate_change && scheduled_rate_change.effective_date <= today) {
                nextConsignor = {
                    ...nextConsignor,
                    commission_split: Number(scheduled_rate_change.commission_split),
                    booth_square_feet: Number(scheduled_rate_change.booth_square_feet ?? nextConsignor.booth_square_feet ?? 0),
                    booth_cost_per_square_foot: Number(
                        scheduled_rate_change.booth_cost_per_square_foot ?? nextConsignor.booth_cost_per_square_foot ?? 0
                    ),
                    monthly_booth_rent: Number(scheduled_rate_change.monthly_booth_rent),
                };
            }

            setConsignors((prev) =>
                prev.map((c) => (c.id === id ? nextConsignor : c))
            );
            return { data: nextConsignor, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update consignor';
            return { data: null, error: message };
        }
    }, [consignors, syncScheduledRateChange]);

    const deleteConsignor = useCallback(async (id: string) => {
        try {
            const { error: deleteError } = await supabase
                .from('consignors')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            setConsignors((prev) => prev.filter((c) => c.id !== id));
            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete consignor';
            return { error: message };
        }
    }, []);

    const getConsignorById = useCallback(async (id: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('consignors')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError) throw fetchError;

            const today = getLocalDateString();
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('consignor_rate_schedules')
                .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                .eq('consignor_id', id)
                .lte('effective_date', today);

            if (scheduleError) {
                return { data: data as Consignor, error: null };
            }

            const effectiveConsignor = applyEffectiveConsignorTerms(
                data as Consignor,
                (scheduleData || []) as ConsignorRateSchedule[],
                today
            );

            return { data: effectiveConsignor, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch consignor';
            return { data: null, error: message };
        }
    }, []);

    return {
        consignors,
        isLoading,
        error,
        fetchConsignors,
        createConsignor,
        updateConsignor,
        deleteConsignor,
        getConsignorById,
    };
}
