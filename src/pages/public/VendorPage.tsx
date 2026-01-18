import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ProductCard } from '../../components/storefront/ProductCard';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { Item } from '../../types';

interface Vendor {
    id: string;
    name: string;
    booth_location: string | null;
}

export function VendorPage() {
    const { id } = useParams<{ id: string }>();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVendorAndItems = async () => {
            if (!id) return;

            try {
                setIsLoading(true);
                setError(null);

                // Fetch vendor info
                const { data: vendorData, error: vendorError } = await supabase
                    .from('consignors')
                    .select('id, name, booth_location')
                    .eq('id', id)
                    .eq('is_active', true)
                    .single();

                if (vendorError) throw vendorError;
                setVendor(vendorData);

                // Fetch vendor's items
                const { data: itemsData, error: itemsError } = await supabase
                    .from('items')
                    .select(`
                        *,
                        consignor:consignors(id, name, booth_location)
                    `)
                    .eq('consignor_id', id)
                    .eq('is_listed', true)
                    .gt('quantity', 0)
                    .order('created_at', { ascending: false });

                if (itemsError) throw itemsError;
                setItems(itemsData || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load vendor');
            } finally {
                setIsLoading(false);
            }
        };

        fetchVendorAndItems();
    }, [id]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    if (error || !vendor) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
                <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">
                    Vendor Not Found
                </h1>
                <p className="text-[var(--color-muted)] mb-6">
                    This vendor doesn't exist or is no longer active.
                </p>
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-[var(--color-primary)] hover:underline"
                >
                    ← Back to home
                </Link>
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

            {/* Vendor Header */}
            <div className="bg-white rounded-2xl border border-[var(--color-border)] p-6 mb-8">
                <div className="flex items-center gap-4">
                    {/* Vendor Avatar */}
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-3xl font-bold text-white">
                            {vendor.name.charAt(0).toUpperCase()}
                        </span>
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
                            {vendor.name}
                        </h1>
                        {vendor.booth_location && (
                            <p className="text-[var(--color-muted)] mt-1">
                                Booth {vendor.booth_location}
                            </p>
                        )}
                        <p className="text-sm text-[var(--color-muted)] mt-2">
                            {items.length} {items.length === 1 ? 'item' : 'items'} available
                        </p>
                    </div>
                </div>
            </div>

            {/* Items Grid */}
            {items.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-[var(--color-muted)]">
                        This vendor has no items listed at the moment.
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
