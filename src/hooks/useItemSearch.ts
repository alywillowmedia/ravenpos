import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Item } from '../types';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';

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
          consignor:consignors(id, consignor_number, name, commission_split, consignor_pays_card_fee, dealer_discount_percent)
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

            const rows = (data || []) as Item[];
            const consignorIds = rows
                .map((row) => row.consignor?.id)
                .filter((id): id is string => Boolean(id));

            if (consignorIds.length === 0) {
                setSearchResults(rows);
                return;
            }

            const today = getLocalDateString();
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('consignor_rate_schedules')
                .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                .in('consignor_id', consignorIds)
                .lte('effective_date', today);

            if (scheduleError) {
                setSearchResults(rows);
                return;
            }

            const schedulesByConsignor = new Map<string, ConsignorRateSchedule[]>();
            for (const schedule of ((scheduleData || []) as ConsignorRateSchedule[])) {
                const existing = schedulesByConsignor.get(schedule.consignor_id) || [];
                existing.push(schedule);
                schedulesByConsignor.set(schedule.consignor_id, existing);
            }

            const hydratedRows = rows.map((row) => {
                if (!row.consignor?.id) return row;
                return {
                    ...row,
                    consignor: applyEffectiveConsignorTerms(
                        row.consignor,
                        schedulesByConsignor.get(row.consignor.id) || [],
                        today
                    ),
                };
            });

            setSearchResults(hydratedRows);
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
