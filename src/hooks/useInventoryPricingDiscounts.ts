import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatSupabaseError } from '../lib/supabaseError';
import type { InventoryPricingDiscount, InventoryPricingDiscountScope, Item } from '../types';

interface UseInventoryPricingDiscountsOptions {
    consignorId?: string;
    activeOnly?: boolean;
    autoFetch?: boolean;
}

interface CreateInventoryPricingDiscountInput {
    consignor_id: string;
    scope: InventoryPricingDiscountScope;
    category?: string | null;
    item_id?: string | null;
    percent_off: number;
    title?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_active?: boolean;
    created_by_user_id?: string | null;
}

interface UpdateInventoryPricingDiscountInput {
    scope?: InventoryPricingDiscountScope;
    category?: string | null;
    item_id?: string | null;
    percent_off?: number;
    title?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_active?: boolean;
}

interface ApplicableDiscountResult {
    percentOff: number;
    source: InventoryPricingDiscount;
}

function toSafeNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
}

function isDiscountActive(discount: InventoryPricingDiscount, now: Date): boolean {
    if (!discount.is_active) return false;

    const start = discount.starts_at ? new Date(discount.starts_at) : null;
    const end = discount.ends_at ? new Date(discount.ends_at) : null;

    if (start && !Number.isNaN(start.getTime()) && start > now) {
        return false;
    }

    if (end && !Number.isNaN(end.getTime()) && end < now) {
        return false;
    }

    return true;
}

function compareDiscountPriority(a: InventoryPricingDiscount, b: InventoryPricingDiscount): number {
    const percentDelta = toSafeNumber(b.percent_off) - toSafeNumber(a.percent_off);
    if (percentDelta !== 0) return percentDelta;

    const aUpdated = new Date(a.updated_at).getTime();
    const bUpdated = new Date(b.updated_at).getTime();
    if (!Number.isNaN(aUpdated) && !Number.isNaN(bUpdated) && bUpdated !== aUpdated) {
        return bUpdated - aUpdated;
    }

    const aCreated = new Date(a.created_at).getTime();
    const bCreated = new Date(b.created_at).getTime();
    if (!Number.isNaN(aCreated) && !Number.isNaN(bCreated) && bCreated !== aCreated) {
        return bCreated - aCreated;
    }

    return 0;
}

export function useInventoryPricingDiscounts(options: UseInventoryPricingDiscountsOptions = {}) {
    const {
        consignorId,
        activeOnly = false,
        autoFetch = true,
    } = options;

    const [discounts, setDiscounts] = useState<InventoryPricingDiscount[]>([]);
    const [isLoading, setIsLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const fetchDiscounts = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            let query = supabase
                .from('inventory_pricing_discounts')
                .select(`
          *,
          item:items(id, name, sku, category),
          consignor:consignors(id, consignor_number, name)
        `)
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false });

            if (consignorId) {
                query = query.eq('consignor_id', consignorId);
            }

            if (activeOnly) {
                query = query.eq('is_active', true);
            }

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;

            setDiscounts((data || []) as InventoryPricingDiscount[]);
        } catch (err) {
            setError(formatSupabaseError(err, 'Failed to fetch inventory discounts'));
        } finally {
            setIsLoading(false);
        }
    }, [activeOnly, consignorId]);

    useEffect(() => {
        if (!autoFetch) return;
        void fetchDiscounts();
    }, [autoFetch, fetchDiscounts]);

    const createDiscount = useCallback(async (input: CreateInventoryPricingDiscountInput) => {
        try {
            const payload = {
                consignor_id: input.consignor_id,
                scope: input.scope,
                category: input.scope === 'category' ? (input.category || null) : null,
                item_id: input.scope === 'item' ? (input.item_id || null) : null,
                percent_off: Math.max(0.01, Math.min(100, toSafeNumber(input.percent_off))),
                title: input.title?.trim() || null,
                starts_at: input.starts_at || null,
                ends_at: input.ends_at || null,
                is_active: input.is_active ?? true,
                created_by_user_id: input.created_by_user_id || null,
            };

            const { data, error: createError } = await supabase
                .from('inventory_pricing_discounts')
                .insert(payload)
                .select(`
          *,
          item:items(id, name, sku, category),
          consignor:consignors(id, consignor_number, name)
        `)
                .single();

            if (createError) throw createError;

            setDiscounts((prev) => [data as InventoryPricingDiscount, ...prev]);
            return { data: data as InventoryPricingDiscount, error: null as string | null };
        } catch (err) {
            return {
                data: null,
                error: formatSupabaseError(err, 'Failed to create inventory discount'),
            };
        }
    }, []);

    const updateDiscount = useCallback(async (id: string, input: UpdateInventoryPricingDiscountInput) => {
        try {
            const payload: UpdateInventoryPricingDiscountInput = {
                ...input,
            };

            if (payload.scope === 'category') {
                payload.item_id = null;
            }

            if (payload.scope === 'item') {
                payload.category = null;
            }

            if (payload.percent_off !== undefined) {
                payload.percent_off = Math.max(0.01, Math.min(100, toSafeNumber(payload.percent_off)));
            }

            if (payload.title !== undefined) {
                payload.title = payload.title?.trim() || null;
            }

            const { data, error: updateError } = await supabase
                .from('inventory_pricing_discounts')
                .update(payload)
                .eq('id', id)
                .select(`
          *,
          item:items(id, name, sku, category),
          consignor:consignors(id, consignor_number, name)
        `)
                .single();

            if (updateError) throw updateError;

            setDiscounts((prev) => prev.map((discount) => (
                discount.id === id ? (data as InventoryPricingDiscount) : discount
            )));

            return { data: data as InventoryPricingDiscount, error: null as string | null };
        } catch (err) {
            return {
                data: null,
                error: formatSupabaseError(err, 'Failed to update inventory discount'),
            };
        }
    }, []);

    const deleteDiscount = useCallback(async (id: string) => {
        try {
            const { error: deleteError } = await supabase
                .from('inventory_pricing_discounts')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            setDiscounts((prev) => prev.filter((discount) => discount.id !== id));
            return { error: null as string | null };
        } catch (err) {
            return {
                error: formatSupabaseError(err, 'Failed to delete inventory discount'),
            };
        }
    }, []);

    const activeDiscounts = useMemo(() => {
        const now = new Date();
        return discounts.filter((discount) => isDiscountActive(discount, now));
    }, [discounts]);

    const getApplicableDiscountForItem = useCallback((item: Pick<Item, 'id' | 'consignor_id' | 'category'>): ApplicableDiscountResult | null => {
        const now = new Date();

        const candidates = discounts.filter((discount) => {
            if (discount.consignor_id !== item.consignor_id) return false;
            if (!isDiscountActive(discount, now)) return false;

            if (discount.scope === 'item') {
                return discount.item_id === item.id;
            }

            return discount.scope === 'category' && discount.category === item.category;
        });

        if (candidates.length === 0) return null;

        const itemSpecific = candidates
            .filter((discount) => discount.scope === 'item')
            .sort(compareDiscountPriority);

        if (itemSpecific.length > 0) {
            const source = itemSpecific[0];
            return {
                percentOff: toSafeNumber(source.percent_off),
                source,
            };
        }

        const categorySpecific = candidates
            .filter((discount) => discount.scope === 'category')
            .sort(compareDiscountPriority);

        if (categorySpecific.length === 0) return null;
        const source = categorySpecific[0];
        return {
            percentOff: toSafeNumber(source.percent_off),
            source,
        };
    }, [discounts]);

    return {
        discounts,
        activeDiscounts,
        isLoading,
        error,
        fetchDiscounts,
        createDiscount,
        updateDiscount,
        deleteDiscount,
        getApplicableDiscountForItem,
    };
}
