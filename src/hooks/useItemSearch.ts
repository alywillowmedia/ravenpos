import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Item } from '../types';

export function useItemSearch() {
    const [searchResults, setSearchResults] = useState<Item[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const searchItems = useCallback(async (vendorShortcode: string, itemName: string) => {
        // Reset if both inputs are empty
        if (!vendorShortcode.trim() && !itemName.trim()) {
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        try {
            setIsSearching(true);
            setSearchError(null);

            let query = supabase
                .from('items')
                .select(`
          *,
          consignor:consignors(id, consignor_number, name, consignor_number)
        `)
                .gt('quantity', 0)
                .order('name', { ascending: true });

            // Filter by vendor shortcode if provided
            if (vendorShortcode.trim()) {
                // Match against consignor_number (case-insensitive, prefix match)
                const { data: consignors, error: consignorError } = await supabase
                    .from('consignors')
                    .select('id')
                    .ilike('consignor_number', `${vendorShortcode.trim()}%`);

                if (consignorError) throw consignorError;

                if (!consignors || consignors.length === 0) {
                    setSearchResults([]);
                    setSearchError(null);
                    return;
                }

                const consignorIds = consignors.map((c) => c.id);
                query = query.in('consignor_id', consignorIds);
            }

            // Filter by item name if provided (case-insensitive, contains match)
            if (itemName.trim()) {
                query = query.ilike('name', `%${itemName.trim()}%`);
            }

            const { data, error: itemSearchError } = await query.limit(20);

            if (itemSearchError) throw itemSearchError;

            setSearchResults(data || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to search items';
            setSearchError(message);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    return {
        searchResults,
        isSearching,
        searchError,
        searchItems,
    };
}
