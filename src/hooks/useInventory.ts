import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Item, ItemInput } from '../types';
import { generateSKU } from '../lib/utils';
import { formatSupabaseError } from '../lib/supabaseError';
import { limitProductTitle } from '../lib/inventoryLimits';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';

const INVENTORY_FETCH_BATCH_SIZE = 1000;
const INVENTORY_FETCH_PARALLELISM = 4;

interface UseInventoryOptions {
    consignorId?: string;
    paginated?: boolean;
    page?: number;
    pageSize?: number;
    searchQuery?: string;
    category?: string;
    autoFetch?: boolean;
    queryProfile?: 'full' | 'labels';
    includeInactiveConsignors?: boolean;
}

interface InventoryFilterOptions {
    consignorId?: string;
    searchQuery?: string;
    category?: string;
}

interface InventorySummary {
    totalItems: number;
    totalQuantity: number;
    totalValue: number;
}

interface InventorySummaryRow {
    quantity: number | null;
    price: number | null;
}

function isLabelsPerfDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('debugLabelsPerf') === '1') return true;
        return window.localStorage.getItem('ravenpos.debug.labelsPerf') === '1';
    } catch {
        return false;
    }
}

function isMissingRateScheduleTable(error: unknown): boolean {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return err?.code === '42P01' || text.includes('consignor_rate_schedules');
}

interface FilterableInventoryQuery<T> {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
}

interface ActiveConsignorInventoryQuery<T> {
    eq: (column: string, value: boolean) => T;
}

function applyActiveConsignorFilter<T extends ActiveConsignorInventoryQuery<T>>(
    query: T,
    includeInactiveConsignors: boolean
) {
    return includeInactiveConsignors
        ? query
        : query.eq('consignor.is_active', true) as T;
}

function applyInventoryFilters<T extends FilterableInventoryQuery<T>>(
    query: T,
    filters: InventoryFilterOptions
) {
    let nextQuery = query;

    if (filters.consignorId) {
        nextQuery = nextQuery.eq('consignor_id', filters.consignorId) as T;
    }

    if (filters.category) {
        nextQuery = nextQuery.eq('category', filters.category) as T;
    }

    const trimmedSearch = filters.searchQuery?.trim() || '';
    if (trimmedSearch) {
        const safeSearch = trimmedSearch.replace(/[,%]/g, ' ').replace(/\s+/g, ' ').trim();
        if (safeSearch) {
            nextQuery = nextQuery.or(
                `name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%,variant_summary.ilike.%${safeSearch}%`
            ) as T;
        }
    }

    return nextQuery;
}

export function useInventory(consignorIdOrOptions?: string | UseInventoryOptions) {
    const options = typeof consignorIdOrOptions === 'string'
        ? { consignorId: consignorIdOrOptions }
        : (consignorIdOrOptions || {});
    const {
        consignorId,
        paginated = false,
        page = 1,
        pageSize = 50,
        searchQuery = '',
        category = '',
        autoFetch = true,
        queryProfile = 'full',
        includeInactiveConsignors = false,
    } = options;

    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    const fetchItems = useCallback(async () => {
        const labelsPerfDebug = queryProfile === 'labels' && isLabelsPerfDebugEnabled();
        const fetchStart = labelsPerfDebug ? performance.now() : 0;
        let batchCount = 0;
        let totalRowsFetched = 0;

        if (labelsPerfDebug) {
            console.groupCollapsed('[LabelsPerf] useInventory.fetchItems start');
            console.debug('[LabelsPerf] params', {
                queryProfile,
                paginated,
                page,
                pageSize,
                hasConsignorFilter: Boolean(consignorId),
                hasCategoryFilter: Boolean(category),
                hasSearchFilter: Boolean(searchQuery.trim()),
            });
        }

        try {
            setIsLoading(true);
            setError(null);

            if (paginated) {
                let query = queryProfile === 'labels'
                    ? supabase
                        .from('items')
                        .select(`
	          id,
	          consignor_id,
	          sku,
          name,
          variant_summary,
          other_details_1,
          other_details_2,
          category,
          quantity,
          qty_unlabeled,
          price,
	          compare_at_price,
	          created_at,
	          updated_at,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `, { count: 'exact' })
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                    : supabase
                        .from('items')
                        .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `, { count: 'exact' })
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false });

	                query = applyActiveConsignorFilter(query, includeInactiveConsignors);
	                query = applyInventoryFilters(query, { consignorId, category, searchQuery });

                const from = (page - 1) * pageSize;
                const to = from + pageSize - 1;
                const pageQueryStart = labelsPerfDebug ? performance.now() : 0;
                const { data, error: fetchError, count } = await query.range(from, to);

                if (fetchError) throw fetchError;
                batchCount = 1;
                totalRowsFetched = (data || []).length;
                setItems((data || []) as Item[]);
                setTotalCount(count || 0);

                if (labelsPerfDebug) {
                    console.debug('[LabelsPerf] paginated query complete', {
                        from,
                        to,
                        rows: (data || []).length,
                        count: count || 0,
                        queryMs: Number((performance.now() - pageQueryStart).toFixed(2)),
                    });
                }
                return;
            }

	            let countQuery = includeInactiveConsignors
	                ? supabase
	                    .from('items')
	                    .select('id', { count: 'exact', head: true })
	                : supabase
	                    .from('items')
	                    .select('id, consignor:consignors!inner(id, is_active)', { count: 'exact', head: true })
	                    .eq('consignor.is_active', true);

            countQuery = applyInventoryFilters(countQuery, { consignorId, category, searchQuery });

            const countQueryStart = labelsPerfDebug ? performance.now() : 0;
            const { count, error: countError } = await countQuery;
            if (countError) throw countError;

            const totalRows = count || 0;
            if (labelsPerfDebug) {
                console.debug('[LabelsPerf] count query complete', {
                    totalRows,
                    queryMs: Number((performance.now() - countQueryStart).toFixed(2)),
                });
            }

            if (totalRows === 0) {
                setItems([]);
                setTotalCount(0);
                return;
            }

            const ranges: Array<{ from: number; to: number }> = [];
            for (let from = 0; from < totalRows; from += INVENTORY_FETCH_BATCH_SIZE) {
                ranges.push({
                    from,
                    to: Math.min(from + INVENTORY_FETCH_BATCH_SIZE - 1, totalRows - 1),
                });
            }

            const batches: Item[][] = new Array(ranges.length);
            let nextRangeIndex = 0;

            const fetchRange = async (rangeIndex: number) => {
                const { from, to } = ranges[rangeIndex];
                const batchQueryStart = labelsPerfDebug ? performance.now() : 0;

                let query = queryProfile === 'labels'
                    ? supabase
                        .from('items')
	                        .select(`
	          id,
	          consignor_id,
	          sku,
          name,
          variant_summary,
          other_details_1,
          other_details_2,
          category,
          quantity,
          qty_unlabeled,
          price,
	          compare_at_price,
	          created_at,
	          updated_at,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `)
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(from, to)
                    : supabase
                        .from('items')
	                        .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `)
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(from, to);

	                query = applyActiveConsignorFilter(query, includeInactiveConsignors);
	                query = applyInventoryFilters(query, { consignorId, category, searchQuery });

                const { data, error: fetchError } = await query;
                if (fetchError) throw fetchError;

                const batch = (data || []) as Item[];
                batches[rangeIndex] = batch;
                batchCount += 1;
                totalRowsFetched += batch.length;

                if (labelsPerfDebug) {
                    console.debug('[LabelsPerf] batch fetched', {
                        batch: rangeIndex + 1,
                        from,
                        to,
                        batchSize: batch.length,
                        runningTotal: totalRowsFetched,
                        queryMs: Number((performance.now() - batchQueryStart).toFixed(2)),
                    });
                }
            };

            const workerCount = Math.min(INVENTORY_FETCH_PARALLELISM, ranges.length);
            await Promise.all(
                Array.from({ length: workerCount }, async () => {
                    while (true) {
                        const current = nextRangeIndex;
                        nextRangeIndex += 1;
                        if (current >= ranges.length) {
                            return;
                        }
                        await fetchRange(current);
                    }
                })
            );

            const allItems = batches.flat();
            setItems(allItems);
            setTotalCount(totalRows);
        } catch (err) {
            setError(formatSupabaseError(err, 'Failed to fetch items'));
            if (labelsPerfDebug) {
                console.debug('[LabelsPerf] fetch error', err);
            }
        } finally {
            setIsLoading(false);
            if (labelsPerfDebug) {
                console.debug('[LabelsPerf] useInventory.fetchItems end', {
                    totalMs: Number((performance.now() - fetchStart).toFixed(2)),
                    batchCount,
                    totalRowsFetched,
                });
                console.groupEnd();
            }
        }
	    }, [category, consignorId, includeInactiveConsignors, page, pageSize, paginated, queryProfile, searchQuery]);

	    useEffect(() => {
	        if (!autoFetch) return;
	        fetchItems();
	    }, [autoFetch, fetchItems]);

	    const fetchMatchingItems = useCallback(async (filters: InventoryFilterOptions = {}) => {
	        let countQuery = includeInactiveConsignors
	            ? supabase
	                .from('items')
	                .select('id', { count: 'exact', head: true })
	            : supabase
	                .from('items')
	                .select('id, consignor:consignors!inner(id, is_active)', { count: 'exact', head: true })
	                .eq('consignor.is_active', true);

        countQuery = applyInventoryFilters(countQuery, filters);

        const { count, error: countError } = await countQuery;
        if (countError) throw countError;

        const totalRows = count || 0;
        if (totalRows === 0) return [] as Item[];

        const ranges: Array<{ from: number; to: number }> = [];
        for (let from = 0; from < totalRows; from += INVENTORY_FETCH_BATCH_SIZE) {
            ranges.push({
                from,
                to: Math.min(from + INVENTORY_FETCH_BATCH_SIZE - 1, totalRows - 1),
            });
        }

        const batches: Item[][] = new Array(ranges.length);
        let nextRangeIndex = 0;

        const fetchRange = async (rangeIndex: number) => {
            const { from, to } = ranges[rangeIndex];
            let query = supabase
                .from('items')
	                .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `)
                .order('updated_at', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to);

	            query = applyActiveConsignorFilter(query, includeInactiveConsignors);
	            query = applyInventoryFilters(query, filters);

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            batches[rangeIndex] = (data || []) as Item[];
        };

        const workerCount = Math.min(INVENTORY_FETCH_PARALLELISM, ranges.length);
        await Promise.all(
            Array.from({ length: workerCount }, async () => {
                while (true) {
                    const current = nextRangeIndex;
                    nextRangeIndex += 1;
                    if (current >= ranges.length) return;
                    await fetchRange(current);
                }
            })
        );

        return batches.flat();
	    }, [includeInactiveConsignors]);

    const fetchMatchingSummary = useCallback(async (filters: InventoryFilterOptions = {}): Promise<InventorySummary> => {
        let countQuery = includeInactiveConsignors
            ? supabase
                .from('items')
                .select('id', { count: 'exact', head: true })
            : supabase
                .from('items')
                .select('id, consignor:consignors!inner(id, is_active)', { count: 'exact', head: true })
                .eq('consignor.is_active', true);

        countQuery = applyInventoryFilters(countQuery, filters);

        const { count, error: countError } = await countQuery;
        if (countError) throw countError;

        const totalRows = count || 0;
        if (totalRows === 0) {
            return { totalItems: 0, totalQuantity: 0, totalValue: 0 };
        }

        const ranges: Array<{ from: number; to: number }> = [];
        for (let from = 0; from < totalRows; from += INVENTORY_FETCH_BATCH_SIZE) {
            ranges.push({
                from,
                to: Math.min(from + INVENTORY_FETCH_BATCH_SIZE - 1, totalRows - 1),
            });
        }

        const batches: InventorySummaryRow[][] = new Array(ranges.length);
        let nextRangeIndex = 0;

        const fetchRange = async (rangeIndex: number) => {
            const { from, to } = ranges[rangeIndex];
            let query = includeInactiveConsignors
                ? supabase
                    .from('items')
                    .select('quantity, price')
                    .order('updated_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to)
                : supabase
                    .from('items')
                    .select('quantity, price, consignor:consignors!inner(id, is_active)')
                    .eq('consignor.is_active', true)
                    .order('updated_at', { ascending: false })
                    .order('id', { ascending: false })
                    .range(from, to);

            query = applyInventoryFilters(query, filters);

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            batches[rangeIndex] = (data || []) as InventorySummaryRow[];
        };

        const workerCount = Math.min(INVENTORY_FETCH_PARALLELISM, ranges.length);
        await Promise.all(
            Array.from({ length: workerCount }, async () => {
                while (true) {
                    const current = nextRangeIndex;
                    nextRangeIndex += 1;
                    if (current >= ranges.length) return;
                    await fetchRange(current);
                }
            })
        );

        const rows = batches.flat();
        return rows.reduce(
            (summary, item) => {
                const quantity = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                return {
                    totalItems: summary.totalItems + 1,
                    totalQuantity: summary.totalQuantity + quantity,
                    totalValue: summary.totalValue + price * quantity,
                };
            },
            { totalItems: 0, totalQuantity: 0, totalValue: 0 }
        );
    }, [includeInactiveConsignors]);

	    const verifyActiveConsignorIds = useCallback(async (consignorIds: string[]) => {
	        const uniqueIds = Array.from(new Set(consignorIds.filter(Boolean)));
	        if (uniqueIds.length === 0) {
	            throw new Error('No consignor selected');
	        }

	        const { data, error: consignorError } = await supabase
	            .from('consignors')
	            .select('id, is_active')
	            .in('id', uniqueIds);

	        if (consignorError) throw consignorError;

	        const activeIds = new Set((data || []).filter((row) => row.is_active).map((row) => row.id));
	        const inactiveOrMissing = uniqueIds.filter((id) => !activeIds.has(id));
	        if (inactiveOrMissing.length > 0) {
	            throw new Error('This vendor is inactive. Reactivate the vendor before adding inventory.');
	        }
	    }, []);

	    const createItem = async (input: Partial<ItemInput> & { consignor_id: string; name: string; price: number }, consignorNumber: string) => {
	        try {
	            await verifyActiveConsignorIds([input.consignor_id]);

	            // Use provided SKU or auto-generate
            const sku = input.sku?.trim() || generateSKU(consignorNumber);

            const itemQuantity = input.quantity ?? 1;
            const { data, error: createError } = await supabase
                .from('items')
                .insert({
                    consignor_id: input.consignor_id,
                    sku,
                    name: limitProductTitle(input.name),
                    variant_summary: input.variant_summary || null,
                    other_details_1: input.other_details_1 || null,
                    other_details_2: input.other_details_2 || null,
                    category: input.category || 'Other',
                    quantity: itemQuantity,
                    qty_unlabeled: itemQuantity, // New items need labels for full quantity
                    price: input.price,
                    compare_at_price: input.compare_at_price ?? null,
                    image_url: input.image_url || null,
                    show_in_public_browse: input.show_in_public_browse ?? true,
                    storefront_featured: input.storefront_featured ?? false,
                })
	                .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `)
                .single();

            if (createError) throw createError;

            setItems((prev) => [data, ...prev]);
            return { data, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to create item');
            return { data: null, error: message };
        }
    };

	    const createItems = async (
	        inputs: (Partial<ItemInput> & { consignor_id: string; name: string; price: number; consignorNumber: string })[]
	    ) => {
	        try {
	            await verifyActiveConsignorIds(inputs.map((input) => input.consignor_id));

	            const itemsToInsert = inputs.map((input) => {
                const itemQuantity = input.quantity ?? 1;
                return {
                    consignor_id: input.consignor_id,
                    // Use provided SKU or auto-generate
                    sku: input.sku?.trim() || generateSKU(input.consignorNumber),
                    name: limitProductTitle(input.name),
                    variant_summary: input.variant_summary || null,
                    other_details_1: input.other_details_1 || null,
                    other_details_2: input.other_details_2 || null,
                    category: input.category || 'Other',
                    quantity: itemQuantity,
                    qty_unlabeled: itemQuantity, // New items need labels for full quantity
                    price: input.price,
                    compare_at_price: input.compare_at_price ?? null,
                    image_url: input.image_url || null,
                    show_in_public_browse: input.show_in_public_browse ?? true,
                    storefront_featured: input.storefront_featured ?? false,
                };
            });

            const { data, error: createError } = await supabase
                .from('items')
                .insert(itemsToInsert)
	                .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `);

            if (createError) throw createError;

            setItems((prev) => [...(data || []), ...prev]);
            return { data, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to create items');
            return { data: null, error: message };
        }
    };

    const updateItem = async (id: string, updates: Partial<ItemInput>) => {
        try {
            // Get current item to check for quantity changes
            const currentItem = items.find((i) => i.id === id);
            const quantityChanged = updates.quantity !== undefined &&
                currentItem &&
                updates.quantity !== currentItem.quantity;

            // If quantity is increasing, add the difference to qty_unlabeled (new stock needs labels)
            const finalUpdates = { ...updates };
            if (typeof finalUpdates.name === 'string') {
                finalUpdates.name = limitProductTitle(finalUpdates.name);
            }
            if (quantityChanged && currentItem && updates.quantity !== undefined) {
                const quantityDiff = updates.quantity - currentItem.quantity;
                if (quantityDiff > 0) {
                    // Quantity increased - add the difference to unlabeled count
                    finalUpdates.qty_unlabeled = (currentItem.qty_unlabeled || 0) + quantityDiff;
                }
                // Note: If quantity decreases, we don't change qty_unlabeled
                // (we assume labeled items were sold/removed, not unlabeled ones)
            }

            const { data, error: updateError } = await supabase
                .from('items')
                .update(finalUpdates)
                .eq('id', id)
	                .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `)
                .single();

            if (updateError) throw updateError;

            setItems((prev) => prev.map((item) => (item.id === id ? data : item)));

            // Sync to Shopify if quantity changed and sync is enabled
            if (quantityChanged && data.sync_enabled && data.shopify_inventory_item_id) {
                try {
                    // Set last_sync_source before pushing to prevent webhook loop
                    await supabase
                        .from('items')
                        .update({
                            last_sync_source: 'ravenpos',
                            last_synced_at: new Date().toISOString()
                        })
                        .eq('id', id);

                    await supabase.functions.invoke('push-to-shopify', {
                        body: {
                            item_id: id,
                            quantity: updates.quantity
                        }
                    });
                } catch (syncError) {
                    console.error('Failed to sync to Shopify:', id, syncError);
                    // Don't fail the update if Shopify sync fails
                }
            }

            return { data, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to update item');
            return { data: null, error: message };
        }
    };

    const deleteItem = async (id: string) => {
        try {
            const { error: deleteError } = await supabase
                .from('items')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            setItems((prev) => prev.filter((item) => item.id !== id));
            return { error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to delete item');
            return { error: message };
        }
    };

    const getItemBySku = async (sku: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('items')
	                .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, commission_split, consignor_pays_card_fee, dealer_discount_percent, is_active)
	        `)
	                .eq('sku', sku)
	                .eq('consignor.is_active', true)
	                .single();

            if (fetchError) throw fetchError;

            const consignor = data?.consignor as Item['consignor'];
            if (!consignor?.id) {
                return { data, error: null };
            }

            const today = getLocalDateString();
            const { data: scheduleRow, error: scheduleError } = await supabase
                .from('consignor_rate_schedules')
                .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                .eq('consignor_id', consignor.id)
                .lte('effective_date', today)
                .order('effective_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (scheduleError && !isMissingRateScheduleTable(scheduleError)) throw scheduleError;

            const nextData: Item = {
                ...(data as Item),
                consignor: applyEffectiveConsignorTerms(
                    consignor,
                    (scheduleRow ? [scheduleRow] : []) as ConsignorRateSchedule[],
                    today
                ),
            };

            return { data: nextData, error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Item not found');
            return { data: null, error: message };
        }
    };

    const decrementQuantity = async (id: string, amount: number = 1) => {
        try {
            const item = items.find((i) => i.id === id);
            if (!item) throw new Error('Item not found');

            const newQuantity = Math.max(0, item.quantity - amount);

            const { error: updateError } = await supabase
                .from('items')
                .update({ quantity: newQuantity })
                .eq('id', id);

            if (updateError) throw updateError;

            setItems((prev) =>
                prev.map((i) => (i.id === id ? { ...i, quantity: newQuantity } : i))
            );
            return { error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to update quantity');
            return { error: message };
        }
    };

    const markAsPrinted = async (printedItems: { id: string; printedCount: number }[]) => {
        try {
            // Update each item's qty_unlabeled (decrement by the number printed)
            for (const { id, printedCount } of printedItems) {
                const item = items.find((i) => i.id === id);
                if (!item) continue;

                // Decrement qty_unlabeled, but don't go below 0
                const newUnlabeled = Math.max(0, (item.qty_unlabeled || 0) - printedCount);

                const { error: updateError } = await supabase
                    .from('items')
                    .update({ qty_unlabeled: newUnlabeled })
                    .eq('id', id);

                if (updateError) throw updateError;
            }

            // Refresh items to get updated qty_unlabeled values
            await fetchItems();
            return { error: null };
        } catch (err) {
            const message = formatSupabaseError(err, 'Failed to mark items as printed');
            return { error: message };
        }
    };

    // Batch update multiple items at once (for bulk edit)
    const updateItems = async (
        updates: Array<{ id: string; changes: Partial<ItemInput> }>
    ): Promise<{ success: boolean; errors: string[] }> => {
        const errors: string[] = [];
        let originalItems = [...items];

        try {
            const knownIds = new Set(originalItems.map((item) => item.id));
            const missingIds = updates
                .map((update) => update.id)
                .filter((id) => !knownIds.has(id));

            if (missingIds.length > 0) {
                const missingBatches: Item[][] = [];
                for (let i = 0; i < missingIds.length; i += INVENTORY_FETCH_BATCH_SIZE) {
                    const ids = missingIds.slice(i, i + INVENTORY_FETCH_BATCH_SIZE);
                    const { data, error: fetchMissingError } = await supabase
                        .from('items')
	                        .select(`
	          *,
	          consignor:consignors!inner(id, consignor_number, name, is_active)
	        `)
                        .in('id', ids);

                    if (fetchMissingError) throw fetchMissingError;
                    missingBatches.push((data || []) as Item[]);
                }

                originalItems = [...originalItems, ...missingBatches.flat()];
            }

            // Optimistic update - apply all changes locally first
            setItems((prev) =>
                prev.map((item) => {
                    const update = updates.find((u) => u.id === item.id);
                    if (update) {
                        return { ...item, ...update.changes };
                    }
                    return item;
                })
            );

            // Process updates in parallel batches
            const updatePromises = updates.map(async ({ id, changes }) => {
                try {
                    const currentItem = originalItems.find((i) => i.id === id);
                    const finalChanges = { ...changes };
                    if (typeof finalChanges.name === 'string') {
                        finalChanges.name = limitProductTitle(finalChanges.name);
                    }

                    // Handle qty_unlabeled for quantity increases
                    if (
                        changes.quantity !== undefined &&
                        currentItem &&
                        changes.quantity > currentItem.quantity
                    ) {
                        const quantityDiff = changes.quantity - currentItem.quantity;
                        finalChanges.qty_unlabeled = (currentItem.qty_unlabeled || 0) + quantityDiff;
                    }

                    const { error: updateError } = await supabase
                        .from('items')
                        .update(finalChanges)
                        .eq('id', id);

                    if (updateError) {
                        throw updateError;
                    }

                    // Sync to Shopify if quantity changed and sync is enabled
                    if (
                        changes.quantity !== undefined &&
                        currentItem?.sync_enabled &&
                        currentItem?.shopify_inventory_item_id
                    ) {
                        try {
                            await supabase
                                .from('items')
                                .update({
                                    last_sync_source: 'ravenpos',
                                    last_synced_at: new Date().toISOString(),
                                })
                                .eq('id', id);

                            await supabase.functions.invoke('push-to-shopify', {
                                body: { item_id: id, quantity: changes.quantity },
                            });
                        } catch (syncError) {
                            console.error('Failed to sync to Shopify:', id, syncError);
                        }
                    }
                } catch (err) {
                    const itemName = originalItems.find((i) => i.id === id)?.name || id;
                    errors.push(`${itemName}: ${formatSupabaseError(err, 'Update failed')}`);
                }
            });

            await Promise.all(updatePromises);

            // Refresh to get latest data with joined consignor info
            await fetchItems();

            return { success: errors.length === 0, errors };
        } catch (err) {
            // Rollback on catastrophic failure
            setItems(originalItems);
            return {
                success: false,
                errors: [formatSupabaseError(err, 'Bulk update failed')],
            };
        }
    };

    return {
        items,
        totalCount,
        isLoading,
        error,
        fetchItems,
        fetchMatchingItems,
        fetchMatchingSummary,
        createItem,
        createItems,
        updateItem,
        updateItems,
        deleteItem,
        getItemBySku,
        decrementQuantity,
        markAsPrinted,
    };
}
