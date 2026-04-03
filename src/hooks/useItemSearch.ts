import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Item } from '../types';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';

function normalize(value: string) {
    return value.toLowerCase().trim();
}

function compact(value: string) {
    return normalize(value).replace(/[^a-z0-9]/g, '');
}

function isSubsequence(needle: string, haystack: string) {
    if (!needle) return false;
    let needleIndex = 0;
    for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
        if (haystack[i] === needle[needleIndex]) needleIndex += 1;
    }
    return needleIndex === needle.length;
}

function getFuzzyScore(item: Item, query: string) {
    const q = normalize(query);
    const qCompact = compact(query);
    if (!q) return 0;

    const name = normalize(item.name || '');
    const sku = normalize(item.sku || '');
    const nameCompact = compact(item.name || '');
    const skuCompact = compact(item.sku || '');
    const tokens = q.split(/\s+/).filter(Boolean);

    let score = 0;

    if (name === q) score = Math.max(score, 120);
    if (sku === q) score = Math.max(score, 125);

    if (name.startsWith(q)) score = Math.max(score, 105);
    if (sku.startsWith(q)) score = Math.max(score, 115);

    if (name.includes(q)) score = Math.max(score, 85);
    if (sku.includes(q)) score = Math.max(score, 100);

    if (qCompact && nameCompact.includes(qCompact)) score = Math.max(score, 90);
    if (qCompact && skuCompact.includes(qCompact)) score = Math.max(score, 110);

    if (tokens.length > 0 && tokens.every((token) => name.includes(token) || sku.includes(token))) {
        score = Math.max(score, 80);
    }

    if (qCompact && isSubsequence(qCompact, skuCompact)) score = Math.max(score, 75);
    if (qCompact && isSubsequence(qCompact, nameCompact)) score = Math.max(score, 65);

    return score;
}

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

            // Broad server-side filter for item name/SKU if provided.
            // We then rank and fuzzy-filter client-side for less strict matching.
            if (itemName.trim()) {
                const safeSearchTerm = itemName.trim().replace(/,/g, ' ');
                query = query.or(`name.ilike.%${safeSearchTerm}%,sku.ilike.%${safeSearchTerm}%`);
            }

            const { data, error: itemSearchError } = await query.limit(itemName.trim() ? 120 : 20);

            if (itemSearchError) throw itemSearchError;

            let rows = (data || []) as Item[];

            // Fallback pool: if the direct server filter is too strict, fetch a broader vendor-scoped set
            // and apply fuzzy ranking to recover intended matches.
            if (itemName.trim() && rows.length < 20) {
                let fallbackQuery = supabase
                    .from('items')
                    .select(`
          *,
          consignor:consignors(id, consignor_number, name, commission_split, consignor_pays_card_fee, dealer_discount_percent)
        `)
                    .gt('quantity', 0)
                    .order('name', { ascending: true });

                if (vendorShortcode.trim()) {
                    const { data: vendorConsignors, error: vendorConsignorError } = await supabase
                        .from('consignors')
                        .select('id')
                        .ilike('consignor_number', `${vendorShortcode.trim()}%`);

                    if (vendorConsignorError) throw vendorConsignorError;
                    const vendorConsignorIds = (vendorConsignors || []).map((c) => c.id);
                    fallbackQuery = fallbackQuery.in('consignor_id', vendorConsignorIds);
                }

                const { data: fallbackData, error: fallbackError } = await fallbackQuery.limit(250);
                if (!fallbackError && fallbackData) {
                    const mergedById = new Map<string, Item>();
                    for (const row of rows) mergedById.set(row.id, row);
                    for (const row of fallbackData as Item[]) mergedById.set(row.id, row);
                    rows = [...mergedById.values()];
                }
            }

            if (itemName.trim()) {
                const queryText = itemName.trim();
                rows = rows
                    .map((row) => ({ row, score: getFuzzyScore(row, queryText) }))
                    .filter((entry) => entry.score > 0)
                    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
                    .slice(0, 20)
                    .map((entry) => entry.row);
            }

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
