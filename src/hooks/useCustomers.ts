import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Customer, CustomerInput } from '../types';

type CustomerOrderSaleItem = {
    id: string;
    sale_id: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    discount_amount?: number | null;
};

export function useCustomers() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCustomers = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('customers')
                .select('*')
                .order('name', { ascending: true });

            if (fetchError) throw fetchError;
            setCustomers(data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch customers');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    const createCustomer = useCallback(async (input: CustomerInput) => {
        try {
            const { data, error: createError } = await supabase
                .from('customers')
                .insert({
                    name: input.name,
                    email: input.email || null,
                    phone: input.phone || null,
                    notes: input.notes || null,
                    store_credit: input.store_credit ?? 0,
                })
                .select()
                .single();

            if (createError) throw createError;

            setCustomers((prev) => [...prev, data]);
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create customer';
            return { data: null, error: message };
        }
    }, []);

    const updateCustomer = useCallback(async (id: string, updates: Partial<CustomerInput>) => {
        try {
            const { data, error: updateError } = await supabase
                .from('customers')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            setCustomers((prev) =>
                prev.map((c) => (c.id === id ? data : c))
            );
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update customer';
            return { data: null, error: message };
        }
    }, []);

    const deleteCustomer = useCallback(async (id: string) => {
        try {
            const { error: deleteError } = await supabase
                .from('customers')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            setCustomers((prev) => prev.filter((c) => c.id !== id));
            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete customer';
            return { error: message };
        }
    }, []);

    const getCustomerById = useCallback(async (id: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('customers')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError) throw fetchError;
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch customer';
            return { data: null, error: message };
        }
    }, []);

    const searchCustomers = useCallback(async (query: string) => {
        try {
            const { data, error: searchError } = await supabase
                .from('customers')
                .select('*')
                .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
                .order('name', { ascending: true })
                .limit(10);

            if (searchError) throw searchError;
            return { data: data || [], error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to search customers';
            return { data: [], error: message };
        }
    }, []);

    const getCustomerOrderHistory = useCallback(async (customerId: string) => {
        try {
            // Keep this query strict to universally-present columns to avoid PostgREST
            // schema drift/cache issues on optional discount columns.
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select(`
                    id,
                    completed_at,
                    subtotal,
                    tax_amount,
                    total,
                    payment_method,
                    cash_tendered,
                    change_given,
                    refund_status
                `)
                .eq('customer_id', customerId)
                .order('completed_at', { ascending: false });

            if (salesError) throw salesError;

            if (salesData.length === 0) {
                return { data: [], error: null };
            }

            const saleIds = salesData.map((sale) => sale.id);
            const baseItemColumns = `
                id,
                sale_id,
                name,
                sku,
                price,
                quantity
            `;
            const itemColumnsWithDiscount = `
                ${baseItemColumns},
                discount_amount
            `;

            let itemsData: CustomerOrderSaleItem[] = [];
            const { data: primaryItemsData, error: primaryItemsError } = await supabase
                .from('sale_items')
                .select(itemColumnsWithDiscount)
                .in('sale_id', saleIds);

            if (primaryItemsError) {
                // Fallback query without optional discount_amount column.
                const { data: fallbackItemsData, error: fallbackItemsError } = await supabase
                    .from('sale_items')
                    .select(baseItemColumns)
                    .in('sale_id', saleIds);

                if (fallbackItemsError) throw fallbackItemsError;

                itemsData = (fallbackItemsData || []).map((item) => ({
                    ...item,
                    discount_amount: null,
                }));
            } else {
                itemsData = primaryItemsData || [];
            }

            const itemsBySale: Record<string, CustomerOrderSaleItem[]> = {};
            for (const item of itemsData) {
                if (!itemsBySale[item.sale_id]) {
                    itemsBySale[item.sale_id] = [];
                }
                itemsBySale[item.sale_id].push(item);
            }

            const normalized = salesData.map((sale) => ({
                ...sale,
                check_number: null,
                discount_total: null,
                sale_items: itemsBySale[sale.id] || [],
            }));

            return { data: normalized, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch order history';
            return { data: [], error: message };
        }
    }, []);

    const addStoreCredit = useCallback(async (customerId: string, amount: number) => {
        try {
            const roundedAmount = Math.round(amount * 100) / 100;
            if (roundedAmount <= 0) {
                return { balance: null, error: 'Amount must be greater than 0' };
            }

            const { data, error: rpcError } = await supabase.rpc('adjust_customer_store_credit', {
                p_customer_id: customerId,
                p_amount_change: roundedAmount,
            });

            if (rpcError) throw rpcError;

            const balance = Number(data || 0);
            setCustomers((prev) =>
                prev.map((c) => (c.id === customerId ? { ...c, store_credit: balance } : c))
            );
            return { balance, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to add store credit';
            return { balance: null, error: message };
        }
    }, []);

    return {
        customers,
        isLoading,
        error,
        fetchCustomers,
        createCustomer,
        updateCustomer,
        deleteCustomer,
        getCustomerById,
        searchCustomers,
        getCustomerOrderHistory,
        addStoreCredit,
    };
}
