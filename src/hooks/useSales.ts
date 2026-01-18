import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CartItem, Sale, SaleItem, PaymentMethod } from '../types';

export function useSales() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const completeSale = useCallback(async (
        cartItems: CartItem[],
        subtotal: number,
        taxTotal: number,
        total: number,
        cashTendered: number,
        changeGiven: number,
        customerId?: string | null,
        paymentMethod: PaymentMethod = 'cash',
        stripePaymentIntentId?: string
    ) => {
        try {
            setIsProcessing(true);
            setError(null);

            // Create sale record
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .insert({
                    subtotal,
                    tax_amount: taxTotal,
                    total,
                    payment_method: paymentMethod,
                    cash_tendered: paymentMethod === 'cash' ? cashTendered : null,
                    change_given: paymentMethod === 'cash' ? changeGiven : null,
                    stripe_payment_intent_id: stripePaymentIntentId || null,
                    customer_id: customerId || null,
                })
                .select()
                .single();

            if (saleError) throw saleError;

            // Create sale items
            const saleItems: Omit<SaleItem, 'id'>[] = cartItems.map((cartItem) => ({
                sale_id: sale.id,
                item_id: cartItem.item.id,
                consignor_id: cartItem.item.consignor_id,
                sku: cartItem.item.sku,
                name: cartItem.item.name + (cartItem.item.variant ? ` - ${cartItem.item.variant}` : ''),
                price: cartItem.item.price,
                quantity: cartItem.quantity,
                commission_split: (cartItem.item.consignor as { commission_split: number })?.commission_split ?? 0.6,
            }));

            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItems);

            if (itemsError) throw itemsError;

            // Decrement inventory quantities
            for (const cartItem of cartItems) {
                const { error: updateError } = await supabase
                    .from('items')
                    .update({
                        quantity: cartItem.item.quantity - cartItem.quantity,
                    })
                    .eq('id', cartItem.item.id);

                if (updateError) {
                    console.error('Failed to update quantity for item:', cartItem.item.id);
                }
            }

            return { data: sale as Sale, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to complete sale';
            setError(message);
            return { data: null, error: message };
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const getTodaysSales = useCallback(async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data, error: fetchError } = await supabase
                .from('sales')
                .select('*')
                .gte('completed_at', today.toISOString());

            if (fetchError) throw fetchError;
            return { data: data || [], error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch sales';
            return { data: [], error: message };
        }
    }, []);

    const getSaleWithItems = useCallback(async (saleId: string) => {
        try {
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .select('*')
                .eq('id', saleId)
                .single();

            if (saleError) throw saleError;

            const { data: items, error: itemsError } = await supabase
                .from('sale_items')
                .select('*')
                .eq('sale_id', saleId);

            if (itemsError) throw itemsError;

            return { data: { sale, items: items || [] }, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch sale';
            return { data: null, error: message };
        }
    }, []);

    return {
        isProcessing,
        error,
        completeSale,
        getTodaysSales,
        getSaleWithItems,
    };
}
