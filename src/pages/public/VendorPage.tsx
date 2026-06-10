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

const VENDOR_PAGE_FETCH_BATCH_SIZE = 1000;

export function VendorPage() {
    const { id } = useParams<{ id: string }>();
    const vendorParam = id || '';
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [descExpanded, setDescExpanded] = useState(false);

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

                const fetchVendorItems = async (featuredOnly: boolean): Promise<Item[]> => {
                    const allItems: Item[] = [];
                    let offset = 0;
                    let hasMore = true;

                    while (hasMore) {
                        let query = supabase
                            .from('items')
                            .select(`
                                *,
                                consignor:consignors(id, name, storefront_slug, booth_location, storefront_display_name, storefront_logo_url)
                            `)
                            .eq('consignor_id', vendorId)
                            .eq('is_listed', true)
                            .gt('quantity', 0)
                            .range(offset, offset + VENDOR_PAGE_FETCH_BATCH_SIZE - 1);

                        if (featuredOnly) {
                            query = query
                                .eq('storefront_featured', true)
                                .order('updated_at', { ascending: false })
                                .order('id', { ascending: false });
                        } else {
                            query = query
                                .order('created_at', { ascending: false })
                                .order('id', { ascending: false });
                        }

                        // Storefront only ever shows items that have a photo
                        query = query.not('image_url', 'is', null).neq('image_url', '');

                        const { data: batch, error: batchError } = await query;
                        if (batchError) throw batchError;

                        const typedBatch = (batch || []) as Item[];
                        allItems.push(...typedBatch);

                        if (typedBatch.length < VENDOR_PAGE_FETCH_BATCH_SIZE) {
                            hasMore = false;
                        } else {
                            offset += VENDOR_PAGE_FETCH_BATCH_SIZE;
                        }
                    }

                    return allItems;
                };

                const [featuredData, itemsData] = await Promise.all([
                    fetchVendorItems(true),
                    fetchVendorItems(false),
                ]);

                setFeaturedItems(featuredData);
                setItems(itemsData);
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

    const hasHeader = Boolean(vendor.storefront_header_image_url);

    return (
        <div className="animate-fadeIn">
            {/* Branded storefront header */}
            <header className="relative border-b border-[var(--color-border)]">
                {hasHeader ? (
                    <div className="relative h-56 sm:h-72 lg:h-80 overflow-hidden">
                        <img
                            src={vendor.storefront_header_image_url ?? undefined}
                            alt={`${vendorName} header`}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/10" />
                    </div>
                ) : (
                    <div className="h-32 sm:h-40 bg-[var(--color-surface)]" />
                )}

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Back link floats over the header */}
                    <Link
                        to="/vendors"
                        className={`absolute top-5 left-4 sm:left-6 lg:left-8 inline-flex items-center gap-2 text-sm transition-colors ${hasHeader ? 'text-white/90 hover:text-white drop-shadow' : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'}`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        All vendors
                    </Link>

                    {/* Identity block — logo overlaps the header image */}
                    <div className="-mt-12 sm:-mt-14 pb-8 flex flex-col sm:flex-row sm:items-end gap-5">
                        {vendor.storefront_logo_url ? (
                            <img
                                src={vendor.storefront_logo_url}
                                alt={`${vendorName} logo`}
                                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover flex-shrink-0 ring-4 ring-[var(--color-background)] shadow-[var(--shadow-gallery-lifted)] bg-[var(--color-surface)]"
                            />
                        ) : (
                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0 ring-4 ring-[var(--color-background)] shadow-[var(--shadow-gallery-lifted)]">
                                <span className="text-4xl text-[var(--color-primary-foreground)]">
                                    {vendorName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}

                        <div className="sm:pb-1">
                            <p className="ravenlia-eyebrow mb-1">Vendor</p>
                            <h1 className="text-3xl sm:text-4xl text-[var(--color-foreground)] leading-tight">
                                {vendorName}
                            </h1>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-muted)]">
                                {vendor.booth_location && <span>Booth {vendor.booth_location}</span>}
                                {vendor.booth_location && <span className="h-1 w-1 rounded-full bg-[var(--color-muted-foreground)]" aria-hidden />}
                                <span>{visibleCount} {visibleCount === 1 ? 'piece' : 'pieces'} available</span>
                            </div>
                        </div>
                    </div>

                    {vendor.storefront_description && (() => {
                        const isLong = vendor.storefront_description.length > 280;
                        return (
                            <div className="max-w-2xl pb-10">
                                <p
                                    className={`text-[var(--color-muted)] leading-relaxed whitespace-pre-wrap ${isLong && !descExpanded ? 'line-clamp-5' : ''}`}
                                >
                                    {vendor.storefront_description}
                                </p>
                                {isLong && (
                                    <button
                                        onClick={() => setDescExpanded((v) => !v)}
                                        className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
                                    >
                                        {descExpanded ? 'Show less' : 'Read more'}
                                        <svg className={`h-3.5 w-3.5 transition-transform ${descExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </header>

            {/* Items */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {!vendor.storefront_show_items ? (
                    <div className="text-center py-20 text-[var(--color-muted)]">
                        This vendor is not showing storefront items right now.
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-20 text-[var(--color-muted)]">
                        This vendor has no items listed at the moment.
                    </div>
                ) : (
                    <div className="space-y-16">
                        {featuredItems.length > 0 && (
                            <section>
                                <p className="ravenlia-eyebrow mb-2">Hand-selected</p>
                                <h2 className="text-2xl text-[var(--color-foreground)] mb-8">Featured Items</h2>
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                                    {featuredItems.map((item) => (
                                        <ProductCard key={item.id} item={item} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {regularItems.length > 0 && (
                            <section>
                                {featuredItems.length > 0 && (
                                    <>
                                        <p className="ravenlia-eyebrow mb-2">The collection</p>
                                        <h2 className="text-2xl text-[var(--color-foreground)] mb-8">More from {vendorName}</h2>
                                    </>
                                )}
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                                    {regularItems.map((item) => (
                                        <ProductCard key={item.id} item={item} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
