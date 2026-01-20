import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Refund, PaymentMethod } from '../types';

export interface RefundWithDetails extends Refund {
    sale?: {
        id: string;
        completed_at: string;
        total: number;
        customer_id: string | null;
    };
    customer?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
    } | null;
}

export function useRefundHistory() {
    const [refunds, setRefunds] = useState<RefundWithDetails[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRefunds = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch all refunds ordered by date descending
            const { data: refundsData, error: refundsError } = await supabase
                .from('refunds')
                .select('*')
                .order('created_at', { ascending: false });

            if (refundsError) throw refundsError;

            // Fetch sale details for each refund
            const refundsWithDetails: RefundWithDetails[] = [];

            for (const refund of refundsData || []) {
                // Fetch sale
                const { data: sale } = await supabase
                    .from('sales')
                    .select('id, completed_at, total, customer_id')
                    .eq('id', refund.sale_id)
                    .single();

                // Fetch customer if exists
                let customer = null;
                if (refund.customer_id) {
                    const { data: customerData } = await supabase
                        .from('customers')
                        .select('id, name, email, phone')
                        .eq('id', refund.customer_id)
                        .single();
                    customer = customerData;
                }

                refundsWithDetails.push({
                    ...refund,
                    items: refund.items as RefundWithDetails['items'],
                    payment_method: refund.payment_method as PaymentMethod,
                    sale: sale || undefined,
                    customer,
                });
            }

            setRefunds(refundsWithDetails);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch refunds';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRefunds();
    }, [fetchRefunds]);

    return {
        refunds,
        isLoading,
        error,
        refetch: fetchRefunds,
    };
}
