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

interface UpdateInvoiceRecipientInput {
    recipientType: InvoiceRecipientType;
    recipientId: string;
    recipientName: string;
    recipientEmail?: string | null;
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

    const updateInvoiceRecipient = useCallback(async (invoiceId: string, input: UpdateInvoiceRecipientInput) => {
        try {
            const recipientId = input.recipientId.trim();
            const recipientName = input.recipientName.trim();
            if (!recipientId || !recipientName) {
                return { data: null, error: 'Select an invoice recipient' };
            }

            const isCustomer = input.recipientType === 'customer';
            const { data, error: updateError } = await supabase
                .from('invoices')
                .update({
                    recipient_type: input.recipientType,
                    customer_id: isCustomer ? recipientId : null,
                    consignor_id: isCustomer ? null : recipientId,
                    recipient_name: recipientName,
                    recipient_email: input.recipientEmail?.trim() || null,
                })
                .eq('id', invoiceId)
                .select('*, customer:customers(*), consignor:consignors(*)')
                .single();

            if (updateError) throw updateError;

            return { data: data as Invoice, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to update invoice recipient');
            return { data: null, error: message };
        }
    }, []);

    const updateInvoiceStatus = useCallback(async (invoiceId: string, status: Exclude<InvoiceStatus, 'partially_paid'>) => {
        try {
            if (status === 'unpaid') {
                return { data: null, error: 'Paid invoices cannot be reset. Record a reasoned reversal instead.' };
            }
            const { data: existingInvoice, error: fetchError } = await supabase
                .from('invoices')
                .select('total, amount_paid')
                .eq('id', invoiceId)
                .single();

            if (fetchError) throw fetchError;

            const remaining = Number(existingInvoice.total || 0) - Number(existingInvoice.amount_paid || 0);
            if (remaining > 0) {
                const { error: paymentError } = await supabase.rpc('record_invoice_payment', {
                    p_invoice_id: invoiceId,
                    p_amount: remaining,
                    p_paid_date: new Date().toISOString().slice(0, 10),
                    p_reference: null,
                    p_notes: 'Recorded through legacy mark-paid action',
                });
                if (paymentError) throw paymentError;
            }
            const { data, error: updateError } = await supabase
                .from('invoices')
                .select('*')
                .eq('id', invoiceId)
                .single();

            if (updateError) throw updateError;

            return { data: data as Invoice, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to update invoice status');
            return { data: null, error: message };
        }
    }, []);

    const applyInvoicePayment = useCallback(async (invoiceId: string, amount: number) => {
        try {
            const numericAmount = Number(amount);
            if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
                return { data: null, error: 'Payment amount must be greater than 0' };
            }

            const { error: paymentError } = await supabase.rpc('record_invoice_payment', {
                p_invoice_id: invoiceId,
                p_amount: numericAmount,
                p_paid_date: new Date().toISOString().slice(0, 10),
                p_reference: null,
                p_notes: null,
            });
            if (paymentError) throw paymentError;
            const { data, error: updateError } = await supabase
                .from('invoices')
                .select('*')
                .eq('id', invoiceId)
                .single();

            if (updateError) throw updateError;

            return { data: data as Invoice, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to apply invoice payment');
            return { data: null, error: message };
        }
    }, []);

    return {
        isLoading,
        error,
        createInvoice,
        fetchInvoices,
        fetchInvoiceItems,
        updateInvoiceRecipient,
        updateInvoiceStatus,
        applyInvoicePayment,
    };
}
