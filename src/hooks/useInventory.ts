import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Item, ItemInput } from '../types';
import { generateSKU } from '../lib/utils';
import { formatSupabaseError } from '../lib/supabaseError';
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
          category,
          quantity,
          qty_unlabeled,
          price,
          created_at,
          updated_at
        `, { count: 'exact' })
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                    : supabase
                        .from('items')
                        .select(`
          *,
          consignor:consignors(id, consignor_number, name)
        `, { count: 'exact' })
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false });

                if (consignorId) {
                    query = query.eq('consignor_id', consignorId);
                }

                if (category) {
                    query = query.eq('category', category);
                }

                const trimmedSearch = searchQuery.trim();
                if (trimmedSearch) {
                    const safeSearch = trimmedSearch.replace(/[,%]/g, ' ').replace(/\s+/g, ' ').trim();
                    if (safeSearch) {
                        query = query.or(
                            `name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%,variant_summary.ilike.%${safeSearch}%`
                        );
                    }
                }

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

            let countQuery = supabase
                .from('items')
                .select('id', { count: 'exact', head: true });

            if (consignorId) {
                countQuery = countQuery.eq('consignor_id', consignorId);
            }

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
          category,
          quantity,
          qty_unlabeled,
          price,
          created_at,
          updated_at
        `)
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(from, to)
                    : supabase
                        .from('items')
                        .select(`
          *,
          consignor:consignors(id, consignor_number, name)
        `)
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(from, to);

                if (consignorId) {
                    query = query.eq('consignor_id', consignorId);
                }

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
    }, [category, consignorId, page, pageSize, paginated, queryProfile, searchQuery]);

    useEffect(() => {
        if (!autoFetch) return;
        fetchItems();
    }, [autoFetch, fetchItems]);

    const createItem = async (input: Partial<ItemInput> & { consignor_id: string; name: string; price: number }, consignorNumber: string) => {
        try {
            // Use provided SKU or auto-generate
            const sku = input.sku?.trim() || generateSKU(consignorNumber);

            const itemQuantity = input.quantity ?? 1;
            const { data, error: createError } = await supabase
                .from('items')
                .insert({
                    consignor_id: input.consignor_id,
                    sku,
                    name: input.name,
                    variant_summary: input.variant_summary || null,
                    other_details_1: input.other_details_1 || null,
                    other_details_2: input.other_details_2 || null,
                    category: input.category || 'Other',
                    quantity: itemQuantity,
                    qty_unlabeled: itemQuantity, // New items need labels for full quantity
                    price: input.price,
                    image_url: input.image_url || null,
                    show_in_public_browse: input.show_in_public_browse ?? true,
                    storefront_featured: input.storefront_featured ?? false,
                })
                .select(`
          *,
          consignor:consignors(id, consignor_number, name)
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
            const itemsToInsert = inputs.map((input) => {
                const itemQuantity = input.quantity ?? 1;
                return {
                    consignor_id: input.consignor_id,
                    // Use provided SKU or auto-generate
                    sku: input.sku?.trim() || generateSKU(input.consignorNumber),
                    name: input.name,
                    variant_summary: input.variant_summary || null,
                    other_details_1: input.other_details_1 || null,
                    other_details_2: input.other_details_2 || null,
                    category: input.category || 'Other',
                    quantity: itemQuantity,
                    qty_unlabeled: itemQuantity, // New items need labels for full quantity
                    price: input.price,
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
          consignor:consignors(id, consignor_number, name)
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
          consignor:consignors(id, consignor_number, name)
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
          consignor:consignors(id, consignor_number, name, commission_split, consignor_pays_card_fee, dealer_discount_percent)
        `)
                .eq('sku', sku)
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
        const originalItems = [...items];

        try {
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
