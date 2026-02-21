import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ProductCard } from '../../components/storefront/ProductCard';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { Item } from '../../types';
import { isUuid, slugifyStorefrontName } from '../../lib/storefront';

interface Vendor {
    id: string;
    name: string;
    booth_location: string | null;
    storefront_slug: string | null;
    storefront_display_name: string | null;
    storefront_description: string | null;
    storefront_logo_url: string | null;
    storefront_header_image_url: string | null;
    storefront_show_items: boolean;
    storefront_images_only: boolean;
}

export function VendorPage() {
    const { id } = useParams<{ id: string }>();
    const vendorParam = id || '';
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVendorAndItems = async () => {
            if (!vendorParam) return;

            try {
                setIsLoading(true);
                setError(null);

                let vendorData: Vendor | null = null;
                let vendorError: { message: string } | null = null;

                if (isUuid(vendorParam)) {
                    const result = await supabase
                        .from('consignors')
                        .select(`
                            id,
                            name,
                            booth_location,
                            storefront_slug,
                            storefront_display_name,
                            storefront_description,
                            storefront_logo_url,
                            storefront_header_image_url,
                            storefront_show_items,
                            storefront_images_only
                        `)
                        .eq('id', vendorParam)
                        .eq('is_active', true)
                        .single();
                    vendorData = result.data as Vendor | null;
                    vendorError = result.error as { message: string } | null;
                } else {
                    const bySlug = await supabase
                        .from('consignors')
                        .select(`
                            id,
                            name,
                            booth_location,
                            storefront_slug,
                            storefront_display_name,
                            storefront_description,
                            storefront_logo_url,
                            storefront_header_image_url,
                            storefront_show_items,
                            storefront_images_only
                        `)
                        .eq('storefront_slug', vendorParam)
                        .eq('is_active', true)
                        .maybeSingle();

                    vendorData = bySlug.data as Vendor | null;
                    vendorError = bySlug.error as { message: string } | null;

                    if (!vendorError && !vendorData) {
                        const fallback = await supabase
                            .from('consignors')
                            .select(`
                                id,
                                name,
                                booth_location,
                                storefront_slug,
                                storefront_display_name,
                                storefront_description,
                                storefront_logo_url,
                                storefront_header_image_url,
                                storefront_show_items,
                                storefront_images_only
                            `)
                            .eq('is_active', true);

                        if (!fallback.error && fallback.data) {
                            vendorData =
                                (fallback.data as Vendor[]).find((v) => {
                                    const slug = slugifyStorefrontName(v.storefront_display_name || v.name);
                                    return slug === vendorParam;
                                }) || null;
                        } else if (fallback.error) {
                            vendorError = fallback.error as { message: string };
                        }
                    }
                }

                if (vendorError) throw vendorError;
                if (!vendorData) throw new Error('Vendor not found');
                setVendor(vendorData);

                const vendorId = vendorData.id;

                const { data: freshVendorData, error: freshVendorError } = await supabase
                    .from('consignors')
                    .select(`
                        id,
                        name,
                        booth_location,
                        storefront_slug,
                        storefront_display_name,
                        storefront_description,
                        storefront_logo_url,
                        storefront_header_image_url,
                        storefront_show_items,
                        storefront_images_only
                    `)
                    .eq('id', vendorId)
                    .eq('is_active', true)
                    .single();

                if (freshVendorError) throw freshVendorError;
                setVendor(freshVendorData as Vendor);

                if (!(freshVendorData as Vendor).storefront_show_items) {
                    setFeaturedItems([]);
                    setItems([]);
                    return;
                }

                let featuredQuery = supabase
                    .from('items')
                    .select(`
                        *,
                        consignor:consignors(id, name, storefront_slug, booth_location, storefront_display_name, storefront_logo_url)
                    `)
                    .eq('consignor_id', vendorId)
                    .eq('is_listed', true)
                    .eq('storefront_featured', true)
                    .gt('quantity', 0)
                    .order('updated_at', { ascending: false });

                let itemsQuery = supabase
                    .from('items')
                    .select(`
                        *,
                        consignor:consignors(id, name, storefront_slug, booth_location, storefront_display_name, storefront_logo_url)
                    `)
                    .eq('consignor_id', vendorId)
                    .eq('is_listed', true)
                    .gt('quantity', 0)
                    .order('created_at', { ascending: false });

                if ((freshVendorData as Vendor).storefront_images_only) {
                    featuredQuery = featuredQuery.not('image_url', 'is', null);
                    itemsQuery = itemsQuery.not('image_url', 'is', null);
                }

                const [{ data: featuredData, error: featuredError }, { data: itemsData, error: itemsError }] = await Promise.all([
                    featuredQuery,
                    itemsQuery,
                ]);

                if (featuredError) throw featuredError;
                if (itemsError) throw itemsError;

                setFeaturedItems(featuredData || []);
                setItems(itemsData || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load vendor');
            } finally {
                setIsLoading(false);
            }
        };

        fetchVendorAndItems();
    }, [vendorParam]);

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

    const vendorName = vendor.storefront_display_name || vendor.name;
    const featuredItemIds = new Set(featuredItems.map((item) => item.id));
    const regularItems = items.filter((item) => !featuredItemIds.has(item.id));
    const visibleCount = items.length;

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
            <div className="bg-[var(--color-surface-elevated)] rounded-2xl border-2 border-[var(--color-border)] overflow-hidden mb-8">
                {vendor.storefront_header_image_url && (
                    <div className="h-40 sm:h-52">
                        <img
                            src={vendor.storefront_header_image_url}
                            alt={`${vendorName} header`}
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
                <div className="p-6">
                    <div className="flex items-center gap-4">
                        {vendor.storefront_logo_url ? (
                            <img
                                src={vendor.storefront_logo_url}
                                alt={`${vendorName} logo`}
                                className="w-16 h-16 rounded-full object-cover flex-shrink-0 border border-black/20"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0 border border-black/20">
                                <span className="text-3xl font-bold text-[var(--color-primary-foreground)]">
                                    {vendorName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}

                        <div>
                            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
                                {vendorName}
                            </h1>
                            {vendor.booth_location && (
                                <p className="text-[var(--color-muted)] mt-1">
                                    Booth {vendor.booth_location}
                                </p>
                            )}
                            <p className="text-sm text-[var(--color-muted)] mt-2">
                                {visibleCount} {visibleCount === 1 ? 'item' : 'items'} available
                            </p>
                        </div>
                    </div>

                    {vendor.storefront_description && (
                        <p className="text-[var(--color-muted)] mt-4 whitespace-pre-wrap">
                            {vendor.storefront_description}
                        </p>
                    )}
                </div>
            </div>

            {/* Items Grid */}
            {!vendor.storefront_show_items ? (
                <div className="text-center py-16">
                    <p className="text-[var(--color-muted)]">
                        This vendor is not showing storefront items right now.
                    </p>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-[var(--color-muted)]">
                        This vendor has no items listed at the moment.
                    </p>
                </div>
            ) : (
                <div className="space-y-10">
                    {featuredItems.length > 0 && (
                        <section>
                            <h2 className="text-xl font-semibold text-[var(--color-foreground)] mb-4">
                                Featured Items
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {featuredItems.map((item) => (
                                    <ProductCard key={item.id} item={item} />
                                ))}
                            </div>
                        </section>
                    )}

                    {regularItems.length > 0 && (
                        <section>
                            {featuredItems.length > 0 && (
                                <h2 className="text-xl font-semibold text-[var(--color-foreground)] mb-4">
                                    More from {vendorName}
                                </h2>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {regularItems.map((item) => (
                                    <ProductCard key={item.id} item={item} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
