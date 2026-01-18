import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Item, ItemInput } from '../types';
import { generateSKU } from '../lib/utils';

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
            setError(err instanceof Error ? err.message : 'Failed to fetch items');
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

            const { data, error: createError } = await supabase
                .from('items')
                .insert({
                    consignor_id: input.consignor_id,
                    sku,
                    name: input.name,
                    variant: input.variant || null,
                    category: input.category || 'Other',
                    quantity: input.quantity ?? 1,
                    price: input.price,
                    image_url: input.image_url || null,
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
            const message = err instanceof Error ? err.message : 'Failed to create item';
            return { data: null, error: message };
        }
    };

    const createItems = async (
        inputs: (Partial<ItemInput> & { consignor_id: string; name: string; price: number; consignorNumber: string })[]
    ) => {
        try {
            const itemsToInsert = inputs.map((input) => ({
                consignor_id: input.consignor_id,
                // Use provided SKU or auto-generate
                sku: input.sku?.trim() || generateSKU(input.consignorNumber),
                name: input.name,
                variant: input.variant || null,
                category: input.category || 'Other',
                quantity: input.quantity ?? 1,
                price: input.price,
                image_url: input.image_url || null,
            }));

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
            const message = err instanceof Error ? err.message : 'Failed to create items';
            return { data: null, error: message };
        }
    };

    const updateItem = async (id: string, updates: Partial<ItemInput>) => {
        try {
            const { data, error: updateError } = await supabase
                .from('items')
                .update(updates)
                .eq('id', id)
                .select(`
          *,
          consignor:consignors(id, consignor_number, name)
        `)
                .single();

            if (updateError) throw updateError;

            setItems((prev) => prev.map((item) => (item.id === id ? data : item)));
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update item';
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
            const message = err instanceof Error ? err.message : 'Failed to delete item';
            return { error: message };
        }
    };

    const getItemBySku = async (sku: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('items')
                .select(`
          *,
          consignor:consignors(id, consignor_number, name, commission_split)
        `)
                .eq('sku', sku)
                .single();

            if (fetchError) throw fetchError;
            return { data, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Item not found';
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
            const message = err instanceof Error ? err.message : 'Failed to update quantity';
            return { error: message };
        }
    };

    const markAsPrinted = async (printedItems: { id: string; printedCount: number }[]) => {
        try {
            // Update each item's printed_quantity
            for (const { id, printedCount } of printedItems) {
                const item = items.find((i) => i.id === id);
                if (!item) continue;

                const newPrintedQty = (item.printed_quantity || 0) + printedCount;

                const { error: updateError } = await supabase
                    .from('items')
                    .update({ printed_quantity: newPrintedQty })
                    .eq('id', id);

                if (updateError) throw updateError;
            }

            // Refresh items to get updated printed_quantity values
            await fetchItems();
            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to mark items as printed';
            return { error: message };
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
        deleteItem,
        getItemBySku,
        decrementQuantity,
        markAsPrinted,
    };
}
