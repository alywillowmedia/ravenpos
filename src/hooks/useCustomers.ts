import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { syncCustomerKitSubscriber } from '../lib/kit';
import type { Customer, CustomerInput, CustomerVendorStoreCredit, StoreCreditTransaction } from '../types';

type CustomerOrderSaleItem = {
    id: string;
    sale_id: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    discount_amount?: number | null;
};

const VENDOR_STORE_CREDIT_SELECT = `
    id,
    customer_id,
    consignor_id,
    balance,
    created_at,
    updated_at,
    consignor:consignors(id, consignor_number, name)
`;

function normalizeVendorStoreCredit(row: Record<string, unknown>): CustomerVendorStoreCredit {
    return {
        id: String(row.id),
        customer_id: String(row.customer_id),
        consignor_id: String(row.consignor_id),
        balance: Number(row.balance || 0),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        consignor: row.consignor as CustomerVendorStoreCredit['consignor'],
    };
}

export function useCustomers() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const attachVendorStoreCredits = useCallback(async (customerRows: Customer[]): Promise<Customer[]> => {
        if (customerRows.length === 0) return customerRows;

        // Batch the ids: one request with every customer id overflows the URL
        // length the API gateway accepts once there are a few hundred customers.
        const customerIds = customerRows.map((customer) => customer.id);
        const rows: Record<string, unknown>[] = [];
        for (let start = 0; start < customerIds.length; start += 100) {
            const { data, error: creditsError } = await supabase
                .from('customer_vendor_store_credits')
                .select(VENDOR_STORE_CREDIT_SELECT)
                .in('customer_id', customerIds.slice(start, start + 100))
                .order('created_at', { ascending: true });

            if (creditsError) throw creditsError;
            rows.push(...((data || []) as Record<string, unknown>[]));
        }

        const creditsByCustomer = new Map<string, CustomerVendorStoreCredit[]>();
        for (const row of rows) {
            const credit = normalizeVendorStoreCredit(row as Record<string, unknown>);
            const existing = creditsByCustomer.get(credit.customer_id) || [];
            existing.push(credit);
            creditsByCustomer.set(credit.customer_id, existing);
        }

        return customerRows.map((customer) => ({
            ...customer,
            vendor_store_credits: creditsByCustomer.get(customer.id) || [],
        }));
    }, []);

    const fetchCustomers = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('customers')
                .select('*')
                .order('name', { ascending: true });

            if (fetchError) throw fetchError;
            setCustomers(await attachVendorStoreCredits((data || []) as Customer[]));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch customers');
        } finally {
            setIsLoading(false);
        }
    }, [attachVendorStoreCredits]);

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
                    accepts_marketing: input.accepts_marketing,
                    store_credit: input.store_credit ?? 0,
                })
                .select()
                .single();

            if (createError) throw createError;

            setCustomers((prev) => [...prev, { ...data, vendor_store_credits: [] }]);
            const kitWarning = await syncCustomerKitSubscriber({
                customerId: data.id,
                email: data.email,
                name: data.name,
                acceptsMarketing: Boolean(data.accepts_marketing),
            });
            if (kitWarning) {
                console.warn('[Kit] create sync failed:', kitWarning);
            }
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

            // Return the customer with vendor credits attached so POS keeps showing them.
            const [customerWithCredits] = await attachVendorStoreCredits([data as Customer]);
            setCustomers((prev) =>
                prev.map((c) => (c.id === id ? customerWithCredits : c))
            );
            const kitWarning = await syncCustomerKitSubscriber({
                customerId: data.id,
                email: data.email,
                name: data.name,
                acceptsMarketing: Boolean(data.accepts_marketing),
            });
            if (kitWarning) {
                console.warn('[Kit] update sync failed:', kitWarning);
            }
            return { data: customerWithCredits, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update customer';
            return { data: null, error: message };
        }
    }, [attachVendorStoreCredits]);

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
            const [customerWithCredits] = await attachVendorStoreCredits([data as Customer]);
            return { data: customerWithCredits, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch customer';
            return { data: null, error: message };
        }
    }, [attachVendorStoreCredits]);

    const searchCustomers = useCallback(async (query: string) => {
        try {
            const { data, error: searchError } = await supabase
                .from('customers')
                .select('*')
                .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
                .order('name', { ascending: true })
                .limit(10);

            if (searchError) throw searchError;
            return { data: await attachVendorStoreCredits((data || []) as Customer[]), error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to search customers';
            return { data: [], error: message };
        }
    }, [attachVendorStoreCredits]);

    const findCustomerByContact = useCallback(async ({
        email,
        phone,
    }: {
        email?: string | null;
        phone?: string | null;
    }) => {
        try {
            const normalizedEmail = email?.trim().toLowerCase() || '';
            const phoneDigits = phone?.replace(/\D/g, '') || '';

            if (normalizedEmail) {
                const { data, error: emailError } = await supabase
                    .from('customers')
                    .select('*')
                    .ilike('email', normalizedEmail)
                    .order('created_at', { ascending: true })
                    .limit(1);

                if (emailError) throw emailError;
                if (data?.[0]) {
                    const [customerWithCredits] = await attachVendorStoreCredits([data[0] as Customer]);
                    return { data: customerWithCredits, error: null };
                }
            }

            if (phoneDigits) {
                // Match the digits in any formatting ("(540) 553-1431", "+15405531431")
                // on the server instead of scanning only the first page of customers.
                const lastTenDigits = phoneDigits.slice(-10);
                const { data, error: phoneError } = await supabase
                    .from('customers')
                    .select('*')
                    .ilike('phone', `%${lastTenDigits.split('').join('%')}%`)
                    .order('created_at', { ascending: true })
                    .limit(50);

                if (phoneError) throw phoneError;
                const match = (data || []).find((customer) =>
                    String(customer.phone || '').replace(/\D/g, '').slice(-10) === lastTenDigits
                );

                if (match) {
                    const [customerWithCredits] = await attachVendorStoreCredits([match as Customer]);
                    return { data: customerWithCredits, error: null };
                }
            }

            return { data: null, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to find customer';
            return { data: null, error: message };
        }
    }, [attachVendorStoreCredits]);

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
                    payment_breakdown,
                    store_credit_used,
                    gift_card_used,
                    card_fee_amount,
                    discount_total,
                    check_number,
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
                sale_items: itemsBySale[sale.id] || [],
            }));

            return { data: normalized, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch order history';
            return { data: [], error: message };
        }
    }, []);

    // Moves a duplicate customer's orders, refunds, gift cards, invoices, and store
    // credit onto the kept customer, then deletes the duplicate.
    const mergeCustomers = useCallback(async (keepCustomerId: string, duplicateCustomerId: string) => {
        try {
            const { data, error: mergeError } = await supabase.rpc('merge_customers', {
                p_keep_customer_id: keepCustomerId,
                p_duplicate_customer_id: duplicateCustomerId,
            });

            if (mergeError) throw mergeError;

            const [mergedCustomer] = await attachVendorStoreCredits([data as Customer]);
            setCustomers((prev) => prev
                .filter((customer) => customer.id !== duplicateCustomerId)
                .map((customer) => (customer.id === keepCustomerId ? mergedCustomer : customer)));
            return { data: mergedCustomer, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to merge customers';
            return { data: null, error: message };
        }
    }, [attachVendorStoreCredits]);

    // Every store credit change for a customer, oldest first, with the running balance.
    const getStoreCreditHistory = useCallback(async (customerId: string) => {
        try {
            const { data, error: historyError } = await supabase
                .from('store_credit_transactions')
                .select(`
                    id,
                    customer_id,
                    consignor_id,
                    amount,
                    balance_after,
                    entry_type,
                    sale_id,
                    refund_id,
                    note,
                    actor_name,
                    created_at,
                    consignor:consignors(id, consignor_number, name)
                `)
                .eq('customer_id', customerId)
                .order('created_at', { ascending: true })
                .order('id', { ascending: true });

            if (historyError) throw historyError;

            const entries = (data || []).map((row) => ({
                ...(row as unknown as StoreCreditTransaction),
                amount: Number(row.amount || 0),
                balance_after: Number(row.balance_after || 0),
                consignor: row.consignor as unknown as CustomerVendorStoreCredit['consignor'],
            }));
            return { data: entries, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load store credit history';
            return { data: [], error: message };
        }
    }, []);

    const addStoreCredit = useCallback(async (customerId: string, amount: number, note?: string) => {
        try {
            const roundedAmount = Math.round(amount * 100) / 100;
            if (roundedAmount === 0) {
                return { balance: null, error: 'Amount cannot be 0' };
            }

            const { data, error: rpcError } = await supabase.rpc('adjust_customer_store_credit', {
                p_customer_id: customerId,
                p_amount_change: roundedAmount,
                p_note: note?.trim() || null,
            });

            if (rpcError) throw rpcError;

            const balance = Number(data || 0);
            setCustomers((prev) =>
                prev.map((c) => (c.id === customerId ? { ...c, store_credit: balance } : c))
            );
            return { balance, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to adjust store credit';
            return { balance: null, error: message };
        }
    }, []);

    const addVendorStoreCredit = useCallback(async (customerId: string, consignorId: string, amount: number, note?: string) => {
        try {
            const roundedAmount = Math.round(amount * 100) / 100;
            if (roundedAmount === 0) {
                return { balance: null, error: 'Amount cannot be 0' };
            }
            if (!consignorId) {
                return { balance: null, error: 'Choose a vendor' };
            }

            const { data, error: rpcError } = await supabase.rpc('adjust_customer_vendor_store_credit', {
                p_customer_id: customerId,
                p_consignor_id: consignorId,
                p_amount_change: roundedAmount,
                p_note: note?.trim() || null,
            });

            if (rpcError) throw rpcError;

            const balance = Number(data || 0);
            const { data: creditRow, error: fetchError } = await supabase
                .from('customer_vendor_store_credits')
                .select(VENDOR_STORE_CREDIT_SELECT)
                .eq('customer_id', customerId)
                .eq('consignor_id', consignorId)
                .maybeSingle();

            if (fetchError) throw fetchError;

            const updatedCredit = creditRow
                ? normalizeVendorStoreCredit(creditRow as Record<string, unknown>)
                : null;

            setCustomers((prev) =>
                prev.map((customer) => {
                    if (customer.id !== customerId) return customer;
                    const existingCredits = customer.vendor_store_credits || [];
                    const nextCredits = updatedCredit
                        ? [
                            ...existingCredits.filter((credit) => credit.consignor_id !== consignorId),
                            updatedCredit,
                        ]
                        : existingCredits.map((credit) => (
                            credit.consignor_id === consignorId ? { ...credit, balance } : credit
                        ));

                    return { ...customer, vendor_store_credits: nextCredits };
                })
            );
            return { balance, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to adjust vendor store credit';
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
        findCustomerByContact,
        getCustomerOrderHistory,
        addStoreCredit,
        addVendorStoreCredit,
        getStoreCreditHistory,
        mergeCustomers,
    };
}
