import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ProductCard } from '../../components/storefront/ProductCard';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { Item } from '../../types';

export function CategoryPage() {
    const { category } = useParams<{ category: string }>();
    const decodedCategory = category ? decodeURIComponent(category) : '';

    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchItems = async () => {
            if (!decodedCategory) return;

            try {
                setIsLoading(true);
                setError(null);

                const { data, error: fetchError } = await supabase
                    .from('items')
                    .select(`
                        *,
                        consignor:consignors(id, name, booth_location)
                    `)
                    .eq('category', decodedCategory)
                    .eq('is_listed', true)
                    .gt('quantity', 0)
                    .order('created_at', { ascending: false });

                if (fetchError) throw fetchError;
                setItems(data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load category');
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [decodedCategory]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
            {/* Back Link */}
            <Link
                to="/"
                className="inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors mb-6"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to home
            </Link>

            {/* Category Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-[var(--color-foreground)]">
                    {decodedCategory}
                </h1>
                <p className="text-[var(--color-muted)] mt-2">
                    {items.length} {items.length === 1 ? 'item' : 'items'} in this category
                </p>
            </div>

            {/* Items Grid */}
            {error ? (
                <div className="text-center py-16">
                    <p className="text-[var(--color-error)]">{error}</p>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
                        <svg className="w-8 h-8 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                    </div>
                    <p className="text-[var(--color-muted)]">
                        No items in this category at the moment.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {items.map((item) => (
                        <ProductCard key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
}
