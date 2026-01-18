import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { BoothRentPayment, BoothRentPaymentInput } from '../types';

export function useBoothRentPayments(consignorId: string | undefined) {
    const [payments, setPayments] = useState<BoothRentPayment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPayments = useCallback(async () => {
        if (!consignorId) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('booth_rent_payments')
                .select('*')
                .eq('consignor_id', consignorId)
                .order('period_year', { ascending: false })
                .order('period_month', { ascending: false });

            if (fetchError) throw fetchError;
            setPayments(data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch payments');
        } finally {
            setIsLoading(false);
        }
    }, [consignorId]);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const createPayment = async (input: BoothRentPaymentInput) => {
        try {
            const { data, error: createError } = await supabase
                .from('booth_rent_payments')
                .insert({
                    consignor_id: input.consignor_id,
                    amount: input.amount,
                    period_month: input.period_month,
                    period_year: input.period_year,
                    notes: input.notes || null,
                    paid_at: input.paid_at || new Date().toISOString(),
                })
                .select()
                .single();

            if (createError) throw createError;

            setPayments((prev) => [data, ...prev]);
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to record payment';
            // Handle duplicate payment error
            if (message.includes('duplicate') || message.includes('unique')) {
                return { data: null, error: 'A payment for this period already exists' };
            }
            return { data: null, error: message };
        }
    };

    const deletePayment = async (id: string) => {
        try {
            const { error: deleteError } = await supabase
                .from('booth_rent_payments')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            setPayments((prev) => prev.filter((p) => p.id !== id));
            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete payment';
            return { error: message };
        }
    };

    // Calculate total paid for the current year
    const currentYear = new Date().getFullYear();
    const yearlyTotal = payments
        .filter((p) => p.period_year === currentYear)
        .reduce((sum, p) => sum + Number(p.amount), 0);

    // Get months with payments for the current year
    const paidMonths = payments
        .filter((p) => p.period_year === currentYear)
        .map((p) => p.period_month);

    return {
        payments,
        isLoading,
        error,
        fetchPayments,
        createPayment,
        deletePayment,
        yearlyTotal,
        paidMonths,
    };
}
