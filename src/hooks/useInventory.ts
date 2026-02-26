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

function isMissingRateScheduleTable(error: unknown): boolean {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return err?.code === '42P01' || text.includes('consignor_rate_schedules');
}

export function useInventory(consignorId?: string) {
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            let query = supabase
                .from('items')
                .select(`
          *,
          consignor:consignors(id, consignor_number, name)
        `)
                .order('created_at', { ascending: false });

            if (consignorId) {
                query = query.eq('consignor_id', consignorId);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;
            setItems(data || []);
        } catch (err) {
            setError(formatSupabaseError(err, 'Failed to fetch items'));
        } finally {
            setIsLoading(false);
        }
    }, [consignorId]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

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
            let finalUpdates = { ...updates };
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
          consignor:consignors(id, consignor_number, name, commission_split, consignor_pays_card_fee)
        `)
                .eq('sku', sku)
                .single();

            if (fetchError) throw fetchError;

            const consignor = data?.consignor as Item['consignor'];
            if (!consignor?.id) {
                return { data, error: null };
            }

            const today = getLocalDateString();
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('consignor_rate_schedules')
                .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                .eq('consignor_id', consignor.id)
                .lte('effective_date', today);

            if (scheduleError && !isMissingRateScheduleTable(scheduleError)) throw scheduleError;

            const nextData: Item = {
                ...(data as Item),
                consignor: applyEffectiveConsignorTerms(
                    consignor,
                    (scheduleData || []) as ConsignorRateSchedule[],
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
                    let finalChanges = { ...changes };

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
