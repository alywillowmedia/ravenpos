import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { calculateProRatedRefundAmount } from '../lib/refundCalculations';
import { allocateRefundToTenders, getSaleTenders } from '../lib/tenders';
import type { Sale, SaleItem, RefundItem, Refund, PaymentBreakdownEntry } from '../types';

interface SaleWithItems {
    sale: Sale;
    items: SaleItem[];
    existingRefunds: Refund[];
}

interface ProcessRefundParams {
    sale_id: string;
    items: RefundItem[];
}

interface ProcessRefundResult {
    refund: Refund;
    stripe_refund_id?: string;
    // How the refund was split back across the sale's tenders
    allocation: PaymentBreakdownEntry[];
}

export function useRefunds() {
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch a sale with its items for refund processing
    const getSaleForRefund = useCallback(async (saleIdOrReceipt: string): Promise<{ data: SaleWithItems | null; error: string | null }> => {
        try {
            setIsLoading(true);
            setError(null);

            // Clean up the search input
            const searchId = saleIdOrReceipt.trim().toLowerCase();

            // First, try to find by exact ID if it looks like a full UUID
            let sale: Sale | null = null;

            if (searchId.length >= 32) {
                // Full UUID - search by exact match
                const { data, error: saleError } = await supabase
                    .from('sales')
                    .select(`
                        *,
                        customer:customers(*)
                    `)
                    .eq('id', searchId)
                    .single();

                if (saleError && saleError.code !== 'PGRST116') throw saleError;
                if (data) {
                    sale = {
                        ...data,
                        customer: data.customer || undefined,
                    } as Sale;
                }
            } else {
                // Short receipt number - fetch recent sales and filter client-side
                const { data: recentSales, error: saleError } = await supabase
                    .from('sales')
                    .select(`
                        *,
                        customer:customers(*)
                    `)
                    .order('completed_at', { ascending: false })
                    .limit(500);

                if (saleError) throw saleError;

                // Find sale where ID starts with the search string
                const searchUpper = searchId.toUpperCase();
                const foundSale = recentSales?.find(s =>
                    s.id.toUpperCase().startsWith(searchUpper)
                );
                if (foundSale) {
                    sale = {
                        ...foundSale,
                        customer: foundSale.customer || undefined,
                    } as Sale;
                }
            }

            if (!sale) {
                return { data: null, error: 'No sale found with that receipt number' };
            }

            // Check if fully refunded
            if (sale.refund_status === 'full') {
                return { data: null, error: 'This sale has already been fully refunded' };
            }

            // Fetch sale items
            const { data: items, error: itemsError } = await supabase
                .from('sale_items')
                .select('*')
                .eq('sale_id', sale.id);

            if (itemsError) throw itemsError;

            // Fetch existing refunds for this sale
            const { data: refunds, error: refundsError } = await supabase
                .from('refunds')
                .select('*')
                .eq('sale_id', sale.id);

            if (refundsError) throw refundsError;

            return {
                data: {
                    sale,
                    items: items || [],
                    existingRefunds: refunds || [],
                },
                error: null,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch sale';
            setError(message);
            return { data: null, error: message };
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Process a refund (card or cash)
    const processRefund = useCallback(async (params: ProcessRefundParams): Promise<{ data: ProcessRefundResult | null; error: string | null }> => {
        try {
            setIsProcessing(true);
            setError(null);

            const { sale_id, items } = params;

            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .select('payment_method, payment_breakdown, stripe_payment_intent_id, total, discount_total, store_credit_used, gift_card_used, cash_tendered, change_given, check_number')
                .eq('id', sale_id)
                .single();
            if (saleError) throw saleError;

            const { data: saleItems, error: saleItemsError } = await supabase
                .from('sale_items')
                .select('id, price, quantity, discount_amount')
                .eq('sale_id', sale_id);
            if (saleItemsError) throw saleItemsError;

            const { data: existingRefunds, error: existingRefundsError } = await supabase
                .from('refunds')
                .select('refund_amount, items, payment_method, payment_breakdown')
                .eq('sale_id', sale_id);
            if (existingRefundsError) throw existingRefundsError;

            const alreadyRefundedQuantityBySaleItemId: Record<string, number> = {};
            for (const existingRefund of existingRefunds || []) {
                const refundedItems = existingRefund.items as Array<{ sale_item_id: string; quantity: number }>;
                for (const refundedItem of refundedItems || []) {
                    alreadyRefundedQuantityBySaleItemId[refundedItem.sale_item_id] =
                        (alreadyRefundedQuantityBySaleItemId[refundedItem.sale_item_id] || 0) + refundedItem.quantity;
                }
            }

            const selectedRefundQuantityBySaleItemId: Record<string, number> = {};
            for (const selectedItem of items) {
                selectedRefundQuantityBySaleItemId[selectedItem.sale_item_id] =
                    (selectedRefundQuantityBySaleItemId[selectedItem.sale_item_id] || 0) + selectedItem.quantity;
            }

            const existingRefundAmount = (existingRefunds || []).reduce(
                (sum, existingRefund) => sum + Number(existingRefund.refund_amount || 0),
                0
            );
            const effectiveRefundAmount = calculateProRatedRefundAmount({
                saleItems: (saleItems || []).map((saleItem) => ({
                    id: saleItem.id,
                    price: Number(saleItem.price),
                    quantity: saleItem.quantity,
                    discount_amount: Number(saleItem.discount_amount || 0),
                })),
                saleTotal: Number(sale?.total || 0),
                saleDiscountTotal: Number(sale?.discount_total || 0),
                existingRefundAmount,
                alreadyRefundedQuantityBySaleItemId,
                selectedRefundQuantityBySaleItemId,
            });

            if (effectiveRefundAmount <= 0) {
                throw new Error('Refund amount is zero after accounting for prior refunds');
            }

            // Send the refund back to the tenders the sale was paid with.
            const allocation = allocateRefundToTenders({
                tenders: getSaleTenders(sale),
                priorRefunds: existingRefunds || [],
                refundAmount: effectiveRefundAmount,
            });
            if (allocation.length === 0) {
                throw new Error('Nothing left to refund on this sale');
            }

            // Card portions go back through Stripe before the refund is recorded.
            let stripe_refund_id: string | undefined;
            for (const entry of allocation) {
                if (entry.method !== 'card') continue;
                const paymentIntentId = entry.stripe_payment_intent_id || sale?.stripe_payment_intent_id;
                if (!paymentIntentId) {
                    throw new Error('No Stripe payment found for the card portion of this sale');
                }

                const { data: refundResult, error: stripeError } = await supabase.functions.invoke('process-stripe-refund', {
                    body: {
                        payment_intent_id: paymentIntentId,
                        amount: Math.round(entry.amount * 100), // Convert to cents
                    },
                });

                if (stripeError) throw stripeError;
                if (refundResult?.error) throw new Error(refundResult.error);

                entry.stripe_refund_id = refundResult.stripe_refund_id;
                stripe_refund_id = stripe_refund_id || refundResult.stripe_refund_id;
            }

            // Records the refund and returns store credit / gift card portions to
            // their balances in one transaction.
            const { data: refund, error: refundError } = await supabase.rpc('record_pos_refund', {
                p_refund: {
                    sale_id,
                    refund_amount: effectiveRefundAmount,
                    stripe_refund_id: stripe_refund_id || null,
                    payment_breakdown: allocation,
                    items: items.map(item => ({
                        item_id: item.item_id,
                        sale_item_id: item.sale_item_id,
                        name: item.name,
                        quantity: item.quantity,
                        restocked: item.restocked,
                    })),
                },
            });

            if (refundError) throw refundError;

            // Restock items if requested
            for (const item of items) {
                if (item.restocked && item.quantity > 0 && item.item_id) {
                    // Get current item data including Shopify sync settings
                    const { data: currentItem } = await supabase
                        .from('items')
                        .select('quantity, qty_unlabeled, sync_enabled, shopify_inventory_item_id')
                        .eq('id', item.item_id)
                        .single();

                    if (currentItem) {
                        // Update local quantity and add to unlabeled count (restocked items need new labels)
                        const { error: updateError } = await supabase
                            .from('items')
                            .update({
                                quantity: currentItem.quantity + item.quantity,
                                qty_unlabeled: (currentItem.qty_unlabeled || 0) + item.quantity
                            })
                            .eq('id', item.item_id);

                        if (updateError) {
                            console.error('Failed to update quantity for item:', item.item_id);
                        }

                        // Push to Shopify if sync is enabled
                        if (currentItem.sync_enabled && currentItem.shopify_inventory_item_id) {
                            try {
                                // Set last_sync_source before pushing to prevent webhook loop
                                await supabase
                                    .from('items')
                                    .update({
                                        last_sync_source: 'ravenpos',
                                        last_synced_at: new Date().toISOString()
                                    })
                                    .eq('id', item.item_id);

                                await supabase.functions.invoke('push-to-shopify', {
                                    body: {
                                        item_id: item.item_id,
                                        adjustment: item.quantity // Positive adjustment to add back inventory
                                    }
                                });
                            } catch (syncError) {
                                console.error('Failed to sync restock to Shopify:', item.item_id, syncError);
                                // Don't fail the refund if Shopify sync fails
                            }
                        }
                    }
                }
            }

            // Calculate if this is a partial or full refund
            const { data: saleItemQuantities } = await supabase
                .from('sale_items')
                .select('quantity')
                .eq('sale_id', sale_id);

            const { data: allRefunds } = await supabase
                .from('refunds')
                .select('items')
                .eq('sale_id', sale_id);

            // Calculate total refunded quantities
            let totalOriginalQty = 0;
            let totalRefundedQty = 0;

            if (saleItemQuantities) {
                totalOriginalQty = saleItemQuantities.reduce((sum, item) => sum + item.quantity, 0);
            }

            if (allRefunds) {
                for (const r of allRefunds) {
                    const refundItems = r.items as Array<{ quantity: number }>;
                    totalRefundedQty += refundItems.reduce((sum, item) => sum + item.quantity, 0);
                }
            }

            const refundStatus = totalRefundedQty >= totalOriginalQty ? 'full' : 'partial';

            // Update sale refund status
            await supabase
                .from('sales')
                .update({ refund_status: refundStatus })
                .eq('id', sale_id);

            return {
                data: {
                    refund: { ...refund, items } as Refund,
                    stripe_refund_id,
                    allocation,
                },
                error: null,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to process refund';
            setError(message);
            return { data: null, error: message };
        } finally {
            setIsProcessing(false);
        }
    }, []);

    return {
        isLoading,
        isProcessing,
        error,
        getSaleForRefund,
        processRefund,
    };
}
