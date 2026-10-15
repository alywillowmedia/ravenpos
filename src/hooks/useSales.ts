import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatSupabaseError } from '../lib/supabaseError';
import { enqueueOfflineCashSale } from '../lib/offlineCashSales';
import type { CartItem, Sale, SaleItem, PaymentMethod, Discount } from '../types';
import { buildSaleTenders, derivePaymentMethod, type SaleRemainderPayment } from '../lib/tenders';

export type { SaleRemainderPayment };
import type { OfflineCashSalePayload } from '../types/offline';

function isElectronRuntime(): boolean {
    return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

interface CompleteSaleResult {
    data: Sale | null;
    error: string | null;
    queuedOffline?: boolean;
    // The id this sale was sent with, so a failure can be checked against the database.
    attemptedSaleId?: string | null;
}

export type SavedSaleLookup =
    | { status: 'saved'; sale: Sale }
    | { status: 'missing' }
    | { status: 'unknown'; error: string };

/**
 * After completeSale reports an error, tells whether the sale row exists anyway
 * (e.g. the response was lost) so a card hold is only released when nothing saved.
 */
export async function findSavedSale(saleId: string | null | undefined): Promise<SavedSaleLookup> {
    if (!saleId) return { status: 'missing' };
    const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();
    if (error) return { status: 'unknown', error: formatSupabaseError(error, 'Could not check the sale') };
    return data ? { status: 'saved', sale: data as Sale } : { status: 'missing' };
}

export interface CompleteSaleParams {
    cartItems: CartItem[];
    subtotal: number;
    taxTotal: number;
    customerId?: string | null;
    orderDiscounts?: Discount[];
    cardFeeAmount?: number;
    storeCredit?: { amount: number; consignorId: string | null } | null;
    giftCard?: { code: string; amount: number } | null;
    remainder: SaleRemainderPayment;
    processedByUserId?: string | null;
    processedByEmployeeId?: string | null;
}

function roundMoney(value: number): number {
    return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

/**
 * Re-reads the customer's credit and the gift card right before payment, so a
 * balance that changed since the customer was selected is caught before a card
 * is charged.
 */
export async function verifyTenderBalances(params: {
    customerId?: string | null;
    storeCredit?: { amount: number; consignorId: string | null } | null;
    giftCard?: { code: string; amount: number } | null;
}): Promise<string | null> {
    const creditAmount = roundMoney(params.storeCredit?.amount || 0);
    if (creditAmount > 0) {
        if (!params.customerId) return 'Store credit needs a customer on the sale.';
        let available = 0;
        if (params.storeCredit?.consignorId) {
            const { data, error } = await supabase
                .from('customer_vendor_store_credits')
                .select('balance')
                .eq('customer_id', params.customerId)
                .eq('consignor_id', params.storeCredit.consignorId)
                .maybeSingle();
            if (error) return formatSupabaseError(error, 'Could not check store credit balance');
            available = Number(data?.balance || 0);
        } else {
            const { data, error } = await supabase
                .from('customers')
                .select('store_credit')
                .eq('id', params.customerId)
                .single();
            if (error) return formatSupabaseError(error, 'Could not check store credit balance');
            available = Number(data?.store_credit || 0);
        }
        if (available + 0.005 < creditAmount) {
            return `Store credit balance is now ${available.toFixed(2)}. Re-select the customer to refresh it.`;
        }
    }

    const giftCardAmount = roundMoney(params.giftCard?.amount || 0);
    if (giftCardAmount > 0 && params.giftCard?.code) {
        const { data, error } = await supabase.rpc('get_gift_card_by_code', {
            p_code: params.giftCard.code.trim().toUpperCase(),
        });
        if (error) return formatSupabaseError(error, 'Could not check gift card balance');
        const card = Array.isArray(data) ? data[0] : data;
        if (!card) return 'Gift card not found.';
        if (!card.is_active) return 'Gift card is inactive.';
        if (card.expires_at && new Date(card.expires_at).getTime() <= Date.now()) return 'Gift card has expired.';
        if (Number(card.current_balance || 0) + 0.005 < giftCardAmount) {
            return `Gift card balance is now ${Number(card.current_balance || 0).toFixed(2)}. Remove and re-apply it.`;
        }
    }

    return null;
}

export function useSales() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const completeSale = useCallback(async (params: CompleteSaleParams): Promise<CompleteSaleResult> => {
        const {
            cartItems,
            subtotal,
            taxTotal,
            customerId,
            orderDiscounts = [],
            cardFeeAmount = 0,
            storeCredit,
            giftCard,
            remainder,
            processedByUserId,
            processedByEmployeeId,
        } = params;
        let attemptedSaleId: string | null = null;

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
            const tenders = buildSaleTenders({ storeCredit, giftCard, remainder });
            const total = Math.round(tenders.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)) / 100;
            const storeCreditUsed = roundMoney(storeCredit?.amount || 0);
            const giftCardUsed = roundMoney(giftCard?.amount || 0);
            const fallbackMethod: PaymentMethod = remainder.method === 'none' ? 'cash' : remainder.method;
            const paymentMethod = derivePaymentMethod(tenders, fallbackMethod);
            const cashEntry = tenders.find((entry) => entry.method === 'cash');
            const checkEntry = tenders.find((entry) => entry.method === 'check');
            const cardEntry = tenders.find((entry) => entry.method === 'card');
            const isOfflineCashMode = isElectronRuntime()
                && typeof navigator !== 'undefined'
                && !navigator.onLine
                && remainder.method === 'cash';

            if (isOfflineCashMode) {
                if (storeCreditUsed > 0 || giftCardUsed > 0) {
                    return {
                        data: null,
                        error: 'Offline cash mode does not support store credit or gift cards.',
                    };
                }
                const cashTendered = remainder.method === 'cash' ? remainder.tendered : 0;
                const changeGiven = remainder.method === 'cash' ? remainder.change : 0;

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

            const saleId = crypto.randomUUID();
            attemptedSaleId = saleId;
            const salePayload = {
                id: saleId,
                // Tells create_pos_sale_with_items to deduct credit and gift card
                // balances itself, in the same transaction as the sale.
                tenders_version: 2,
                subtotal,
                tax_amount: taxTotal,
                total,
                payment_method: paymentMethod,
                cash_tendered: cashEntry ? cashEntry.tendered ?? cashEntry.amount : null,
                change_given: cashEntry ? cashEntry.change ?? 0 : null,
                stripe_payment_intent_id: cardEntry?.stripe_payment_intent_id || null,
                customer_id: customerId || null,
                discounts: orderDiscounts.map(d => ({
                    type: d.type,
                    value: d.value,
                    reason: d.reason,
                    calculatedAmount: d.calculatedAmount
                })),
                discount_total: discountTotal,
                store_credit_used: storeCreditUsed,
                gift_card_used: giftCardUsed,
                card_fee_amount: roundMoney(cardFeeAmount),
                payment_breakdown: tenders,
                processed_by_user: processedByUserId || null,
                processed_by_employee: processedByEmployeeId || null,
                check_number: checkEntry?.check_number || null,
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

            return { data: { ...(sale as Sale), card_last4: cardEntry?.card_last4 || null }, error: null, attemptedSaleId };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to complete sale');
            setError(message);
            return { data: null, error: message, attemptedSaleId };
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
