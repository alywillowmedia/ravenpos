import { supabase } from './supabase';
import { formatSupabaseError } from './supabaseError';
import { createCartItem } from './tax';
import type { CartItem, Customer, Discount, Item } from '../types';

export interface PosSavedCart {
    id: string;
    name: string;
    customer_id: string | null;
    customer_name: string | null;
    cart_items: CartItem[];
    order_discounts: Discount[];
    dealer_discount_enabled: boolean;
    item_count: number;
    subtotal: number;
    total: number;
    created_by_user: string | null;
    created_by_employee: string | null;
    created_at: string;
    updated_at: string;
}

interface SavePosCartInput {
    name: string;
    cart: CartItem[];
    orderDiscounts: Discount[];
    dealerDiscountEnabled: boolean;
    selectedCustomer: Customer | null;
    subtotal: number;
    total: number;
    createdByUserId?: string | null;
    createdByEmployeeId?: string | null;
}

export interface RestorePosSavedCartResult {
    cart: CartItem[];
    orderDiscounts: Discount[];
    dealerDiscountEnabled: boolean;
    unavailableCount: number;
    adjustedCount: number;
}

function normalizeSavedCart(row: Record<string, unknown>): PosSavedCart {
    return {
        id: String(row.id),
        name: String(row.name || 'Saved cart'),
        customer_id: row.customer_id ? String(row.customer_id) : null,
        customer_name: row.customer_name ? String(row.customer_name) : null,
        cart_items: Array.isArray(row.cart_items) ? row.cart_items as CartItem[] : [],
        order_discounts: Array.isArray(row.order_discounts) ? row.order_discounts as Discount[] : [],
        dealer_discount_enabled: row.dealer_discount_enabled === true,
        item_count: Number(row.item_count || 0),
        subtotal: Number(row.subtotal || 0),
        total: Number(row.total || 0),
        created_by_user: row.created_by_user ? String(row.created_by_user) : null,
        created_by_employee: row.created_by_employee ? String(row.created_by_employee) : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
}

export async function listPosSavedCarts(): Promise<{ data: PosSavedCart[]; error: string | null }> {
    try {
        const { data, error } = await supabase
            .from('pos_saved_carts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return {
            data: (data || []).map((row) => normalizeSavedCart(row as Record<string, unknown>)),
            error: null,
        };
    } catch (err) {
        return { data: [], error: formatSupabaseError(err, 'Failed to load saved carts') };
    }
}

export async function savePosCart(input: SavePosCartInput): Promise<{ data: PosSavedCart | null; error: string | null }> {
    try {
        const name = input.name.trim() || 'Saved cart';
        const { data, error } = await supabase
            .from('pos_saved_carts')
            .insert({
                name,
                customer_id: input.selectedCustomer?.id || null,
                customer_name: input.selectedCustomer?.name || null,
                cart_items: input.cart,
                order_discounts: input.orderDiscounts,
                dealer_discount_enabled: input.dealerDiscountEnabled,
                item_count: input.cart.reduce((sum, item) => sum + item.quantity, 0),
                subtotal: input.subtotal,
                total: input.total,
                created_by_user: input.createdByUserId || null,
                created_by_employee: input.createdByEmployeeId || null,
            })
            .select()
            .single();

        if (error) throw error;

        return {
            data: data ? normalizeSavedCart(data as Record<string, unknown>) : null,
            error: null,
        };
    } catch (err) {
        return { data: null, error: formatSupabaseError(err, 'Failed to save cart') };
    }
}

export async function deletePosSavedCart(savedCartId: string): Promise<{ error: string | null }> {
    try {
        const { error } = await supabase
            .from('pos_saved_carts')
            .delete()
            .eq('id', savedCartId);

        if (error) throw error;

        return { error: null };
    } catch (err) {
        return { error: formatSupabaseError(err, 'Failed to delete saved cart') };
    }
}

export async function restorePosSavedCart(savedCart: PosSavedCart): Promise<{ data: RestorePosSavedCartResult | null; error: string | null }> {
    try {
        const savedItems = savedCart.cart_items;
        const inventoryItemIds = Array.from(new Set(
            savedItems
                .filter((cartItem) => !cartItem.item?.is_custom_sale_item && cartItem.item?.id)
                .map((cartItem) => cartItem.item.id)
        ));
        const latestItemsById = new Map<string, Item>();

        if (inventoryItemIds.length > 0) {
            const { data, error } = await supabase
                .from('items')
                .select(`
                    *,
                    consignor:consignors(
                        id,
                        consignor_number,
                        name,
                        commission_split,
                        consignor_pays_card_fee,
                        dealer_discount_percent
                    )
                `)
                .in('id', inventoryItemIds);

            if (error) throw error;

            for (const item of (data || []) as Item[]) {
                latestItemsById.set(item.id, item);
            }
        }

        let unavailableCount = 0;
        let adjustedCount = 0;
        const restoredCart: CartItem[] = [];

        for (const savedItem of savedItems) {
            const savedProduct = savedItem.item;
            if (!savedProduct) {
                unavailableCount += 1;
                continue;
            }

            if (savedProduct.is_custom_sale_item) {
                restoredCart.push(createCartItem(
                    savedProduct,
                    savedItem.quantity,
                    savedItem.discount,
                    savedItem.dealerDiscountPercent || 0
                ));
                continue;
            }

            const latestItem = latestItemsById.get(savedProduct.id);
            if (!latestItem || latestItem.quantity <= 0) {
                unavailableCount += 1;
                continue;
            }

            const restoredQuantity = Math.min(savedItem.quantity, latestItem.quantity);
            if (restoredQuantity < savedItem.quantity) {
                adjustedCount += 1;
            }

            restoredCart.push(createCartItem(
                latestItem,
                restoredQuantity,
                savedItem.discount,
                savedItem.dealerDiscountPercent || 0
            ));
        }

        return {
            data: {
                cart: restoredCart,
                orderDiscounts: savedCart.order_discounts,
                dealerDiscountEnabled: savedCart.dealer_discount_enabled,
                unavailableCount,
                adjustedCount,
            },
            error: null,
        };
    } catch (err) {
        return { data: null, error: formatSupabaseError(err, 'Failed to open saved cart') };
    }
}
