import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Consignor, ConsignorInput } from '../types';
import { generateConsignorNumber } from '../lib/utils';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';

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

        if (clearError) return;

        if (!scheduledRateChange) return;

        const { error: insertError } = await supabase
            .from('consignor_rate_schedules')
            .insert({
                consignor_id: consignorId,
                effective_date: scheduledRateChange.effective_date,
                commission_split: scheduledRateChange.commission_split,
                monthly_booth_rent: scheduledRateChange.monthly_booth_rent,
            });

        if (insertError) return;
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
                .select('id, consignor_id, effective_date, commission_split, monthly_booth_rent, created_at, updated_at')
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

            const { data, error: createError } = await supabase
                .from('consignors')
                .insert({
                    consignor_number: consignorNumber,
                    name: input.name,
                    booth_location: input.booth_location || null,
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
                    monthly_booth_rent: input.monthly_booth_rent ?? 0,
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

            const { data, error: updateError } = await supabase
                .from('consignors')
                .update(baseUpdates)
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
    }, [syncScheduledRateChange]);

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
                .select('id, consignor_id, effective_date, commission_split, monthly_booth_rent, created_at, updated_at')
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
