import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CartItem, Sale, SaleItem, PaymentMethod, Discount } from '../types';

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
        stripePaymentIntentId?: string,
        orderDiscounts: Discount[] = [],
        storeCreditUsed = 0,
        cardFeeAmount = 0,
        giftCardCode?: string,
        giftCardUsed = 0,
        checkNumber?: string
    ) => {
        let creditDeducted = false;
        let giftCardDeducted = false;

        try {
            setIsProcessing(true);
            setError(null);

            // Calculate total discounts
            const itemDiscountTotal = cartItems.reduce(
                (sum, item) => sum + (item.discount?.calculatedAmount ?? 0), 0
            );
            const orderDiscountTotal = orderDiscounts.reduce(
                (sum, d) => sum + d.calculatedAmount, 0
            );
            const discountTotal = itemDiscountTotal + orderDiscountTotal;
            const roundedStoreCreditUsed = Math.max(0, Math.round(storeCreditUsed * 100) / 100);
            const roundedCardFeeAmount = Math.max(0, Math.round(cardFeeAmount * 100) / 100);
            const roundedGiftCardUsed = Math.max(0, Math.round(giftCardUsed * 100) / 100);
            const normalizedGiftCardCode = giftCardCode?.trim().toUpperCase();

            // Deduct gift card first; if later steps fail, we'll attempt to restore it.
            if (normalizedGiftCardCode && roundedGiftCardUsed > 0) {
                const { error: giftCardError } = await supabase.rpc('redeem_gift_card', {
                    p_code: normalizedGiftCardCode,
                    p_amount: roundedGiftCardUsed,
                });

                if (giftCardError) throw giftCardError;
                giftCardDeducted = true;
            }

            // Deduct store credit first; if later steps fail, we'll attempt to restore it.
            if (customerId && roundedStoreCreditUsed > 0) {
                const { error: creditError } = await supabase.rpc('adjust_customer_store_credit', {
                    p_customer_id: customerId,
                    p_amount_change: -roundedStoreCreditUsed,
                });

                if (creditError) throw creditError;
                creditDeducted = true;
            }

            // Create sale record with discounts
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .insert({
                    subtotal,
                    tax_amount: taxTotal,
                    total,
                    payment_method: paymentMethod,
                    check_number: paymentMethod === 'check' ? (checkNumber?.trim() || null) : null,
                    cash_tendered: paymentMethod === 'cash' ? cashTendered : null,
                    change_given: paymentMethod === 'cash' ? changeGiven : null,
                    stripe_payment_intent_id: stripePaymentIntentId || null,
                    customer_id: customerId || null,
                    discounts: orderDiscounts.map(d => ({
                        type: d.type,
                        value: d.value,
                        reason: d.reason,
                        calculatedAmount: d.calculatedAmount
                    })),
                    discount_total: discountTotal,
                    store_credit_used: roundedStoreCreditUsed,
                    gift_card_used: roundedGiftCardUsed,
                    card_fee_amount: roundedCardFeeAmount,
                })
                .select()
                .single();

            if (saleError) throw saleError;

            // Create sale items with discount data
            const saleItems: Omit<SaleItem, 'id'>[] = cartItems.map((cartItem) => ({
                sale_id: sale.id,
                item_id: cartItem.item.id,
                consignor_id: cartItem.item.consignor_id,
                sku: cartItem.item.sku,
                name: cartItem.item.name + (cartItem.item.variant_summary ? ` - ${cartItem.item.variant_summary}` : ''),
                price: cartItem.item.price,
                quantity: cartItem.quantity,
                commission_split: (cartItem.item.consignor as { commission_split: number })?.commission_split ?? 0.6,
                consignor_pays_card_fee: (cartItem.item.consignor as { consignor_pays_card_fee?: boolean })?.consignor_pays_card_fee ?? false,
                // Discount data
                discount_type: cartItem.discount?.type,
                discount_value: cartItem.discount?.value,
                discount_amount: cartItem.discount?.calculatedAmount ?? 0,
                discount_reason: cartItem.discount?.reason,
            }));

            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItems);

            if (itemsError) throw itemsError;

            // Decrement inventory quantities and sync to Shopify
            for (const cartItem of cartItems) {
                const newQuantity = cartItem.item.quantity - cartItem.quantity;

                const { error: updateError } = await supabase
                    .from('items')
                    .update({
                        quantity: newQuantity,
                    })
                    .eq('id', cartItem.item.id);

                if (updateError) {
                    console.error('Failed to update quantity for item:', cartItem.item.id);
                }

                // Push to Shopify if sync is enabled
                if (cartItem.item.sync_enabled && cartItem.item.shopify_inventory_item_id) {
                    try {
                        // Set last_sync_source before pushing to prevent webhook loop
                        await supabase
                            .from('items')
                            .update({
                                last_sync_source: 'ravenpos',
                                last_synced_at: new Date().toISOString()
                            })
                            .eq('id', cartItem.item.id);

                        await supabase.functions.invoke('push-to-shopify', {
                            body: {
                                item_id: cartItem.item.id,
                                adjustment: -cartItem.quantity
                            }
                        });
                    } catch (syncError) {
                        console.error('Failed to sync to Shopify:', cartItem.item.id, syncError);
                        // Don't fail the sale if Shopify sync fails
                    }
                }
            }

            return { data: sale as Sale, error: null };
        } catch (err) {
            // Best-effort rollback if we deducted store credit but sale failed
            if (creditDeducted && customerId && storeCreditUsed > 0) {
                await supabase.rpc('adjust_customer_store_credit', {
                    p_customer_id: customerId,
                    p_amount_change: Math.round(storeCreditUsed * 100) / 100,
                });
            }
            // Best-effort rollback if we deducted gift card but sale failed
            if (giftCardDeducted && giftCardCode && giftCardUsed > 0) {
                await supabase.rpc('restore_gift_card_balance', {
                    p_code: giftCardCode.trim().toUpperCase(),
                    p_amount: Math.round(giftCardUsed * 100) / 100,
                });
            }

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
