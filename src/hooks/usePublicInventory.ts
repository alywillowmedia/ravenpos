import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Item } from '../types';

export interface PublicFilters {
    search: string;
    category: string;
    minPrice: number | null;
    maxPrice: number | null;
    vendor: string;
}

export interface PaginationState {
    page: number;
    pageSize: number;
    total: number;
}

const DEFAULT_PAGE_SIZE = 24;

export function usePublicInventory() {
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [vendors, setVendors] = useState<{ id: string; name: string; booth: string | null }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
    });
    const [filters, setFilters] = useState<PublicFilters>({
        search: '',
        category: '',
        minPrice: null,
        maxPrice: null,
        vendor: '',
    });

    // Track if component is mounted to avoid state updates after unmount
    const isMountedRef = useRef(true);

    // Track the current fetch to prevent race conditions
    const fetchIdRef = useRef(0);

    // Fetch categories for filter dropdown
    const fetchCategories = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('categories')
                .select('name')
                .order('name');

            if (fetchError) {
                if (fetchError.message?.includes('abort')) return;
                throw fetchError;
            }
            if (isMountedRef.current) {
                setCategories(data?.map((c) => c.name) || []);
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error('Failed to fetch categories:', err);
        }
    }, []);

    // Fetch vendors (active consignors) for filter dropdown
    const fetchVendors = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('consignors')
                .select('id, name, booth_location')
                .eq('is_active', true)
                .order('name');

            if (fetchError) {
                if (fetchError.message?.includes('abort')) return;
                throw fetchError;
            }
            if (isMountedRef.current) {
                setVendors(
                    data?.map((c) => ({
                        id: c.id,
                        name: c.name,
                        booth: c.booth_location,
                    })) || []
                );
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error('Failed to fetch vendors:', err);
        }
    }, []);

    // Fetch a single item by ID
    const getItemById = useCallback(async (id: string) => {
        try {
            const { data, error: fetchError } = await supabase
                .from('items')
                .select(
                    `
                    *,
                    consignor:consignors(id, name, booth_location)
                `
                )
                .eq('id', id)
                .gt('quantity', 0)
                .single();

            if (fetchError) throw fetchError;
            return { data, error: null };
        } catch (err) {
            return {
                data: null,
                error: err instanceof Error ? err.message : 'Item not found',
            };
        }
    }, []);

    // Initialize data - fetch categories and vendors once
    useEffect(() => {
        isMountedRef.current = true;
        fetchCategories();
        fetchVendors();

        return () => {
            isMountedRef.current = false;
        };
    }, [fetchCategories, fetchVendors]);

    // Fetch items when filters or pagination changes
    // Use a debounced effect with proper race condition handling
    useEffect(() => {
        const currentFetchId = ++fetchIdRef.current;
        let timeoutId: NodeJS.Timeout | null = null;

        const doFetch = async () => {
            // Check if this fetch is still the latest one
            if (currentFetchId !== fetchIdRef.current) return;

            try {
                setIsLoading(true);
                setError(null);

                // Build the base query
                let query = supabase
                    .from('items')
                    .select(
                        `
                        *,
                        consignor:consignors(id, name, booth_location)
                    `,
                        { count: 'exact' }
                    )
                    .gt('quantity', 0)
                    .eq('is_listed', true);

                // Apply search filter
                if (filters.search) {
                    query = query.or(
                        `name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`
                    );
                }

                // Apply category filter
                if (filters.category) {
                    query = query.eq('category', filters.category);
                }

                // Apply price range filters
                if (filters.minPrice !== null) {
                    query = query.gte('price', filters.minPrice);
                }
                if (filters.maxPrice !== null) {
                    query = query.lte('price', filters.maxPrice);
                }

                // Apply vendor filter
                if (filters.vendor) {
                    query = query.eq('consignor_id', filters.vendor);
                }

                // Apply pagination
                const from = (pagination.page - 1) * pagination.pageSize;
                const to = from + pagination.pageSize - 1;
                query = query.range(from, to).order('created_at', { ascending: false });

                const { data, error: fetchError, count } = await query;

                // Check again if this fetch is still the latest one
                if (currentFetchId !== fetchIdRef.current) return;

                if (fetchError) {
                    // Ignore abort errors
                    if (fetchError.message?.includes('abort') || fetchError.message?.includes('AbortError')) {
                        return;
                    }
                    throw fetchError;
                }

                if (isMountedRef.current && currentFetchId === fetchIdRef.current) {
                    setItems(data || []);
                    setPagination((prev) => ({
                        ...prev,
                        total: count || 0,
                    }));
                }
            } catch (err) {
                if (err instanceof Error && (err.name === 'AbortError' || err.message?.includes('abort'))) {
                    return;
                }
                if (isMountedRef.current && currentFetchId === fetchIdRef.current) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch items');
                }
            } finally {
                if (isMountedRef.current && currentFetchId === fetchIdRef.current) {
                    setIsLoading(false);
                }
            }
        };

        // Debounce the fetch with 100ms delay to handle React Strict Mode
        timeoutId = setTimeout(doFetch, 100);

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [filters, pagination.page, pagination.pageSize]);

    // Update filters (resets to page 1)
    const updateFilters = (newFilters: Partial<PublicFilters>) => {
        setFilters((prev) => ({ ...prev, ...newFilters }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    // Change page
    const setPage = (page: number) => {
        setPagination((prev) => ({ ...prev, page }));
    };

    // Calculate total pages
    const totalPages = Math.ceil(pagination.total / pagination.pageSize);

    // Manual refresh function
    const refresh = useCallback(() => {
        fetchIdRef.current++;
        // Trigger a re-fetch by updating a dependency
        setFilters((prev) => ({ ...prev }));
    }, []);

    return {
        items,
        categories,
        vendors,
        isLoading,
        error,
        filters,
        updateFilters,
        pagination: {
            ...pagination,
            totalPages,
        },
        setPage,
        getItemById,
        refresh,
    };
}
