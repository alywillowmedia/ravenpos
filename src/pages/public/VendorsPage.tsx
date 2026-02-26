import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { buildVendorPath } from '../../lib/storefront';

interface VendorRow {
    id: string;
    name: string;
    booth_location: string | null;
    storefront_slug: string | null;
    storefront_display_name: string | null;
    storefront_logo_url: string | null;
}

export function VendorsPage() {
    const [vendors, setVendors] = useState<VendorRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const { data, error: fetchError } = await supabase
                    .from('consignors')
                    .select('id, name, booth_location, storefront_slug, storefront_display_name, storefront_logo_url')
                    .eq('is_active', true)
                    .eq('storefront_show_items', true)
                    .order('name', { ascending: true });

                if (fetchError) throw fetchError;
                setVendors((data || []) as VendorRow[]);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load vendors');
            } finally {
                setIsLoading(false);
            }
        };

        void fetchVendors();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-[var(--color-foreground)]">Vendors</h1>
                <p className="text-[var(--color-muted)] mt-2">Visit each vendor storefront.</p>
            </div>

            {error ? (
                <div className="text-center py-16 text-[var(--color-error)]">{error}</div>
            ) : vendors.length === 0 ? (
                <div className="text-center py-16 text-[var(--color-muted)]">No vendors available.</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {vendors.map((vendor) => {
                        const displayName = vendor.storefront_display_name || vendor.name;
                        return (
                            <Link
                                key={vendor.id}
                                to={buildVendorPath(vendor)}
                                className="flex items-center gap-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-4 hover:border-[var(--color-primary)] transition-colors"
                            >
                                {vendor.storefront_logo_url ? (
                                    <img
                                        src={vendor.storefront_logo_url}
                                        alt={`${displayName} logo`}
                                        className="h-12 w-12 rounded-full border border-[var(--color-border)] object-cover"
                                    />
                                ) : (
                                    <div className="h-12 w-12 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center font-bold text-[var(--color-primary)]">
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-[var(--color-foreground)]">{displayName}</p>
                                    {vendor.booth_location && (
                                        <p className="text-sm text-[var(--color-muted)]">Booth {vendor.booth_location}</p>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
