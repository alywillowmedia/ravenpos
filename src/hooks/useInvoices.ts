import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatSupabaseError } from '../lib/supabaseError';
import type { CartItem, Invoice, InvoiceItem, InvoiceRecipientType, InvoiceStatus } from '../types';

interface CreateInvoiceInput {
    recipientType: InvoiceRecipientType;
    customerId?: string | null;
    consignorId?: string | null;
    recipientName: string;
    recipientEmail?: string | null;
    cartItems: CartItem[];
    subtotal: number;
    taxAmount: number;
    total: number;
    notes?: string | null;
}

export function useInvoices() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createInvoice = useCallback(async (input: CreateInvoiceInput) => {
        try {
            setIsLoading(true);
            setError(null);

            const { data: invoice, error: invoiceError } = await supabase
                .from('invoices')
                .insert({
                    recipient_type: input.recipientType,
                    customer_id: input.customerId || null,
                    consignor_id: input.consignorId || null,
                    recipient_name: input.recipientName,
                    recipient_email: input.recipientEmail || null,
                    subtotal: input.subtotal,
                    tax_amount: input.taxAmount,
                    total: input.total,
                    notes: input.notes || null,
                })
                .select('*')
                .single();

            if (invoiceError) throw invoiceError;

            const invoiceItems: Omit<InvoiceItem, 'id' | 'created_at'>[] = input.cartItems.map((cartItem) => ({
                invoice_id: invoice.id,
                item_id: cartItem.item.is_custom_sale_item ? null : cartItem.item.id,
                consignor_id: cartItem.item.consignor_id || null,
                sku: cartItem.item.is_custom_sale_item ? null : cartItem.item.sku,
                name: cartItem.item.name + (cartItem.item.variant_summary ? ` - ${cartItem.item.variant_summary}` : ''),
                price: Number(cartItem.item.price),
                quantity: cartItem.quantity,
                line_total: cartItem.discount ? cartItem.discountedLineTotal : cartItem.lineTotal,
                is_custom: !!cartItem.item.is_custom_sale_item,
            }));

            const { error: itemsError } = await supabase
                .from('invoice_items')
                .insert(invoiceItems);

            if (itemsError) throw itemsError;

            return { data: invoice as Invoice, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to create invoice');
            setError(message);
            return { data: null, error: message };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchInvoices = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('invoices')
                .select('*, customer:customers(*), consignor:consignors(*)')
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            return { data: (data || []) as Invoice[], error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to fetch invoices');
            setError(message);
            return { data: [], error: message };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchInvoiceItems = useCallback(async (invoiceId: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('invoice_items')
                .select('*, consignor:consignors(*), item:items(*)')
                .eq('invoice_id', invoiceId)
                .order('created_at', { ascending: true });

            if (fetchError) throw fetchError;

            return { data: (data || []) as InvoiceItem[], error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to fetch invoice items');
            return { data: [], error: message };
        }
    }, []);

    const updateInvoiceStatus = useCallback(async (invoiceId: string, status: InvoiceStatus) => {
        try {
            const isPaid = status === 'paid';
            const { data, error: updateError } = await supabase
                .from('invoices')
                .update({
                    status,
                    paid_at: isPaid ? new Date().toISOString() : null,
                })
                .eq('id', invoiceId)
                .select('*')
                .single();

            if (updateError) throw updateError;

            return { data: data as Invoice, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to update invoice status');
            return { data: null, error: message };
        }
    }, []);

    return {
        isLoading,
        error,
        createInvoice,
        fetchInvoices,
        fetchInvoiceItems,
        updateInvoiceStatus,
    };
}
