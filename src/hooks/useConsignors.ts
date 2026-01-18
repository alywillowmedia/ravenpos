import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Consignor, ConsignorInput } from '../types';
import { generateConsignorNumber } from '../lib/utils';

export function useConsignors() {
    const [consignors, setConsignors] = useState<Consignor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchConsignors = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('consignors')
                .select('*')
                .order('consignor_number', { ascending: true });

            if (fetchError) throw fetchError;
            setConsignors(data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch consignors');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConsignors();
    }, [fetchConsignors]);

    const createConsignor = async (input: Partial<ConsignorInput>) => {
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
                    notes: input.notes || null,
                    commission_split: input.commission_split ?? 0.6,
                    monthly_booth_rent: input.monthly_booth_rent ?? 0,
                    is_active: input.is_active ?? true,
                })
                .select()
                .single();

            if (createError) throw createError;

            setConsignors((prev) => [...prev, data]);
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create consignor';
            return { data: null, error: message };
        }
    };

    const updateConsignor = async (id: string, updates: Partial<ConsignorInput>) => {
        try {
            const { data, error: updateError } = await supabase
                .from('consignors')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            setConsignors((prev) =>
                prev.map((c) => (c.id === id ? data : c))
            );
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update consignor';
            return { data: null, error: message };
        }
    };

    const deleteConsignor = async (id: string) => {
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
    };

    const getConsignorById = async (id: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('consignors')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError) throw fetchError;
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch consignor';
            return { data: null, error: message };
        }
    };

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
