import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Dealer, DealerInput } from '../types';

export function useDealers() {
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDealers = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('dealers')
                .select('*')
                .order('name', { ascending: true });

            if (fetchError) throw fetchError;
            setDealers((data || []) as Dealer[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch dealers');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchDealers();
    }, [fetchDealers]);

    const createDealer = useCallback(async (input: DealerInput) => {
        try {
            const { data, error: createError } = await supabase
                .from('dealers')
                .insert({
                    name: input.name.trim(),
                    business_name: input.business_name?.trim() || null,
                    email: input.email?.trim() || null,
                    phone: input.phone?.trim() || null,
                    notes: input.notes?.trim() || null,
                    is_active: input.is_active ?? true,
                })
                .select()
                .single();

            if (createError) throw createError;

            setDealers((prev) => [...prev, data as Dealer].sort((a, b) => a.name.localeCompare(b.name)));
            return { data: data as Dealer, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create dealer';
            return { data: null, error: message };
        }
    }, []);

    const updateDealer = useCallback(async (id: string, updates: Partial<DealerInput>) => {
        try {
            const payload: Partial<DealerInput> = {
                ...updates,
                name: updates.name?.trim(),
                business_name: updates.business_name === undefined ? undefined : (updates.business_name?.trim() || null),
                email: updates.email === undefined ? undefined : (updates.email?.trim() || null),
                phone: updates.phone === undefined ? undefined : (updates.phone?.trim() || null),
                notes: updates.notes === undefined ? undefined : (updates.notes?.trim() || null),
            };

            const { data, error: updateError } = await supabase
                .from('dealers')
                .update(payload)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            setDealers((prev) =>
                prev
                    .map((dealer) => (dealer.id === id ? data as Dealer : dealer))
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
            return { data: data as Dealer, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update dealer';
            return { data: null, error: message };
        }
    }, []);

    const deleteDealer = useCallback(async (id: string) => {
        try {
            const { error: deleteError } = await supabase
                .from('dealers')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            setDealers((prev) => prev.filter((dealer) => dealer.id !== id));
            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete dealer';
            return { error: message };
        }
    }, []);

    const searchDealers = useCallback(async (query: string) => {
        try {
            const trimmed = query.trim();
            if (!trimmed) return { data: [] as Dealer[], error: null };

            const { data, error: searchError } = await supabase
                .from('dealers')
                .select('*')
                .or(`name.ilike.%${trimmed}%,business_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
                .eq('is_active', true)
                .order('name', { ascending: true })
                .limit(10);

            if (searchError) throw searchError;
            return { data: (data || []) as Dealer[], error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to search dealers';
            return { data: [] as Dealer[], error: message };
        }
    }, []);

    return {
        dealers,
        isLoading,
        error,
        fetchDealers,
        createDealer,
        updateDealer,
        deleteDealer,
        searchDealers,
    };
}
