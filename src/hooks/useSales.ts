import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatSupabaseError } from '../lib/supabaseError';
import { enqueueOfflineCashSale } from '../lib/offlineCashSales';
import type { CartItem, Sale, SaleItem, PaymentMethod, Discount, PaymentBreakdownEntry } from '../types';
import type { OfflineCashSalePayload } from '../types/offline';

function isElectronRuntime(): boolean {
    return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

interface CompleteSaleResult {
    data: Sale | null;
    error: string | null;
    queuedOffline?: boolean;
}

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
        checkNumber?: string,
        processedByUserId?: string | null,
        processedByEmployeeId?: string | null,
        paymentBreakdown?: PaymentBreakdownEntry[]
    ): Promise<CompleteSaleResult> => {
        let creditDeducted = false;
        let giftCardDeducted = false;

        try {
            setIsProcessing(true);
            setError(null);

            // Calculate total discounts
            const itemDiscountTotal = cartItems.reduce(
                (sum, item) => sum + (item.discount?.calculatedAmount ?? 0) + (item.dealerDiscountAmount ?? 0), 0
            );
            const orderDiscountTotal = orderDiscounts.reduce(
                (sum, d) => sum + d.calculatedAmount, 0
            );
            const discountTotal = itemDiscountTotal + orderDiscountTotal;
            const roundedStoreCreditUsed = Math.max(0, Math.round(storeCreditUsed * 100) / 100);
            const roundedCardFeeAmount = Math.max(0, Math.round(cardFeeAmount * 100) / 100);
            const roundedGiftCardUsed = Math.max(0, Math.round(giftCardUsed * 100) / 100);
            const normalizedGiftCardCode = giftCardCode?.trim().toUpperCase();
            const isOfflineCashMode = isElectronRuntime() && typeof navigator !== 'undefined' && !navigator.onLine && paymentMethod === 'cash';
            const normalizedPaymentBreakdown = paymentBreakdown?.map((entry) => ({
                ...entry,
                amount: Math.max(0, Math.round(Number(entry.amount || 0) * 100) / 100),
                tendered: entry.tendered == null ? null : Math.max(0, Math.round(Number(entry.tendered || 0) * 100) / 100),
                change: entry.change == null ? null : Math.max(0, Math.round(Number(entry.change || 0) * 100) / 100),
                check_number: entry.check_number?.trim() || null,
                stripe_payment_intent_id: entry.stripe_payment_intent_id || null,
                card_last4: entry.card_last4 || null,
            })).filter((entry) => entry.amount > 0);

            if (isOfflineCashMode) {
                if (roundedStoreCreditUsed > 0 || roundedGiftCardUsed > 0 || normalizedGiftCardCode) {
                    return {
                        data: null,
                        error: 'Offline cash mode does not support store credit or gift cards.',
                    };
                }

                const saleId = crypto.randomUUID();
                const completedAt = new Date().toISOString();
                const offlineSale: Sale = {
                    id: saleId,
                    customer_id: customerId || null,
                    completed_at: completedAt,
                    subtotal,
                    tax_amount: taxTotal,
                    total,
                    payment_method: 'cash',
                    cash_tendered: cashTendered,
                    change_given: changeGiven,
                    stripe_payment_intent_id: null,
                    refund_status: null,
                    discounts: orderDiscounts.map((discount) => ({
                        type: discount.type,
                        value: discount.value,
                        reason: discount.reason,
                        calculatedAmount: discount.calculatedAmount,
                    })),
                    discount_total: discountTotal,
                    store_credit_used: 0,
                    gift_card_used: 0,
                    card_fee_amount: 0,
                    processed_by_user: processedByUserId || null,
                    processed_by_employee: processedByEmployeeId || null,
                };

                const offlineSaleItems = cartItems.map((cartItem) => ({
                    id: crypto.randomUUID(),
                    sale_id: saleId,
                    item_id: cartItem.item.is_custom_sale_item ? null : cartItem.item.id,
                    consignor_id: cartItem.item.consignor_id,
                    sku: cartItem.item.sku,
                    name: cartItem.item.name + (cartItem.item.variant_summary ? ` - ${cartItem.item.variant_summary}` : ''),
                    price: cartItem.item.price,
                    quantity: cartItem.quantity,
                    commission_split: (cartItem.item.consignor as { commission_split: number })?.commission_split ?? 0.6,
                    consignor_pays_card_fee: (cartItem.item.consignor as { consignor_pays_card_fee?: boolean })?.consignor_pays_card_fee ?? false,
                    discount_type:
                        cartItem.discount?.type ||
                        ((cartItem.dealerDiscountAmount || 0) > 0 ? 'percentage' : undefined),
                    discount_value:
                        cartItem.discount?.value ??
                        (((cartItem.dealerDiscountAmount || 0) > 0) ? Number(cartItem.dealerDiscountPercent || 0) : undefined),
                    discount_amount: (cartItem.discount?.calculatedAmount ?? 0) + (cartItem.dealerDiscountAmount ?? 0),
                    discount_reason: cartItem.discount?.reason ||
                        (((cartItem.dealerDiscountAmount || 0) > 0) ? 'Dealer discount' : undefined),
                }));

                const inventoryAdjustments = cartItems
                    .filter((cartItem) => !cartItem.item.is_custom_sale_item)
                    .map((cartItem) => ({
                        item_id: cartItem.item.id,
                        quantity_sold: cartItem.quantity,
                    }));

                const payload: OfflineCashSalePayload = {
                    sale: {
                        id: offlineSale.id,
                        customer_id: offlineSale.customer_id,
                        subtotal: offlineSale.subtotal,
                        tax_amount: offlineSale.tax_amount,
                        total: offlineSale.total,
                        payment_method: 'cash',
                        cash_tendered: offlineSale.cash_tendered,
                        change_given: offlineSale.change_given,
                        stripe_payment_intent_id: null,
                        discounts: offlineSale.discounts || [],
                        discount_total: Number(offlineSale.discount_total || 0),
                        store_credit_used: 0,
                        gift_card_used: 0,
                        card_fee_amount: 0,
                        processed_by_user: offlineSale.processed_by_user || null,
                        processed_by_employee: offlineSale.processed_by_employee || null,
                        completed_at: offlineSale.completed_at,
                    },
                    sale_items: offlineSaleItems,
                    inventory_adjustments: inventoryAdjustments,
                };

                const { error: queueError } = await enqueueOfflineCashSale(payload);
                if (queueError) {
                    return { data: null, error: queueError };
                }

                return { data: offlineSale, error: null, queuedOffline: true };
            }

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

            const saleId = crypto.randomUUID();
            const salePayload = {
                id: saleId,
                subtotal,
                tax_amount: taxTotal,
                total,
                payment_method: paymentMethod,
                cash_tendered: paymentMethod === 'cash' || paymentMethod === 'split' ? cashTendered : null,
                change_given: paymentMethod === 'cash' || paymentMethod === 'split' ? changeGiven : null,
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
                payment_breakdown: normalizedPaymentBreakdown && normalizedPaymentBreakdown.length > 0
                    ? normalizedPaymentBreakdown
                    : null,
                processed_by_user: processedByUserId || null,
                processed_by_employee: processedByEmployeeId || null,
                ...(paymentMethod === 'check' || paymentMethod === 'split' ? { check_number: checkNumber?.trim() || null } : {}),
            };

            // Create sale items with discount data
            const saleItems: Omit<SaleItem, 'id'>[] = cartItems.map((cartItem) => ({
                sale_id: saleId,
                item_id: cartItem.item.is_custom_sale_item ? null : cartItem.item.id,
                consignor_id: cartItem.item.consignor_id,
                sku: cartItem.item.sku,
                name: cartItem.item.name + (cartItem.item.variant_summary ? ` - ${cartItem.item.variant_summary}` : ''),
                price: cartItem.item.price,
                quantity: cartItem.quantity,
                commission_split: (cartItem.item.consignor as { commission_split: number })?.commission_split ?? 0.6,
                consignor_pays_card_fee: (cartItem.item.consignor as { consignor_pays_card_fee?: boolean })?.consignor_pays_card_fee ?? false,
                // Discount data
                discount_type:
                    cartItem.discount?.type ||
                    ((cartItem.dealerDiscountAmount || 0) > 0 ? 'percentage' : undefined),
                discount_value:
                    cartItem.discount?.value ??
                    (((cartItem.dealerDiscountAmount || 0) > 0) ? Number(cartItem.dealerDiscountPercent || 0) : undefined),
                discount_amount: (cartItem.discount?.calculatedAmount ?? 0) + (cartItem.dealerDiscountAmount ?? 0),
                discount_reason: cartItem.discount?.reason ||
                    (((cartItem.dealerDiscountAmount || 0) > 0) ? 'Dealer discount' : undefined),
            }));

            const { data: sale, error: saleError } = await supabase.rpc('create_pos_sale_with_items', {
                p_sale: salePayload,
                p_sale_items: saleItems,
            });

            if (saleError) throw saleError;

            // Inventory is decremented atomically inside create_pos_sale_with_items.
            // Keep Shopify sync as a best-effort follow-up for synced items.
            for (const cartItem of cartItems) {
                if (cartItem.item.is_custom_sale_item) {
                    continue;
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

            const message = formatSupabaseError(err, 'Failed to complete sale');
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
