import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePublicInventory } from '../../hooks/usePublicInventory';
import { usePublicStorefrontSettings } from '../../hooks/usePublicStorefrontSettings';
import { ProductCard } from '../../components/storefront/ProductCard';
import { HeroSection } from '../../components/storefront/HeroSection';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { buildVendorPath } from '../../lib/storefront';

export function BrowsePage() {
    const location = useLocation();
    const embedParam = new URLSearchParams(location.search).get('embed');
    const querySearch = new URLSearchParams(location.search).get('q')?.trim() || '';
    const isEmbedMode = embedParam === '1' || embedParam === 'true';

    const {
        items,
        featuredItems,
        categories,
        vendors,
        isLoading,
        filters,
        updateFilters,
        pagination,
        setPage,
    } = usePublicInventory();
    const { settings: homeHeroSettings } = usePublicStorefrontSettings();

    const [showFilters, setShowFilters] = useState(false);

    // Calculate category item counts
    const categoriesWithCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach((item) => {
            counts[item.category] = (counts[item.category] || 0) + 1;
        });
        return categories.map((name) => ({
            name,
            itemCount: counts[name] || 0,
        }));
    }, [categories, items]);

    // Calculate vendor item counts
    const vendorsWithCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach((item) => {
            if (item.consignor_id) {
                counts[item.consignor_id] = (counts[item.consignor_id] || 0) + 1;
            }
        });
        return vendors.map((v) => ({
            ...v,
            booth_location: v.booth,
            itemCount: counts[v.id] || 0,
        }));
    }, [vendors, items]);

    const vendorOptions = [
        { value: '', label: 'All Vendors' },
        ...vendors.map((v) => ({
            value: v.id,
            label: v.booth
                ? `${v.storefront_display_name || v.name} (Booth ${v.booth})`
                : (v.storefront_display_name || v.name),
        })),
    ];

    const priceRanges = [
        { value: '', label: 'Any Price' },
        { value: '0-25', label: 'Under $25' },
        { value: '25-50', label: '$25 - $50' },
        { value: '50-100', label: '$50 - $100' },
        { value: '100-250', label: '$100 - $250' },
        { value: '250+', label: '$250+' },
    ];

    const handlePriceChange = (value: string) => {
        if (!value) {
            updateFilters({ minPrice: null, maxPrice: null });
        } else if (value === '250+') {
            updateFilters({ minPrice: 250, maxPrice: null });
        } else {
            const [min, max] = value.split('-').map(Number);
            updateFilters({ minPrice: min, maxPrice: max });
        }
    };

    const getCurrentPriceValue = () => {
        if (filters.minPrice === null && filters.maxPrice === null) return '';
        if (filters.minPrice === 250 && filters.maxPrice === null) return '250+';
        return `${filters.minPrice || 0}-${filters.maxPrice || 0}`;
    };

    const clearFilters = () => {
        updateFilters({
            search: '',
            category: '',
            minPrice: null,
            maxPrice: null,
            vendor: '',
        });
    };

    const hasActiveFilters =
        filters.search ||
        filters.category ||
        filters.minPrice !== null ||
        filters.maxPrice !== null ||
        filters.vendor;

    // Check if we're showing filtered results or the full homepage
    const isFiltered = hasActiveFilters;

    useEffect(() => {
        if (filters.search !== querySearch) {
            updateFilters({ search: querySearch });
        }
    }, [filters.search, querySearch, updateFilters]);

    return (
        <div className="animate-fadeIn">
            {!isEmbedMode && (
                <HeroSection
                    settings={homeHeroSettings}
                />
            )}

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {isEmbedMode && (
                    <section className="pt-8 pb-4">
                        <div className="relative max-w-2xl mx-auto">
                            <input
                                type="text"
                                placeholder="Search for items..."
                                value={filters.search}
                                onChange={(e) => updateFilters({ search: e.target.value })}
                                className="w-full px-6 py-4 pr-14 rounded-2xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] text-lg text-[var(--color-foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:ring-4 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all shadow-sm"
                            />
                            <svg
                                className="absolute right-5 top-1/2 -translate-y-1/2 w-6 h-6 text-[var(--color-muted)]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                        </div>
                    </section>
                )}

                {/* Show sections only when not filtering */}
                {!isFiltered && !isLoading && (categoriesWithCounts.length > 0 || vendorsWithCounts.length > 0) && (
                    <div className="space-y-12 py-8">
                        {/* Categories Section */}
                        {categoriesWithCounts.length > 0 && (
                            <section id="categories">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold text-[var(--color-foreground)]">Shop by Category</h2>
                                </div>
                                <div className="flex overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 gap-4 snap-x hide-scrollbar">
                                    {categoriesWithCounts.map((category) => (
                                        <a
                                            key={category.name}
                                            href={`/category/${encodeURIComponent(category.name)}`}
                                            className="flex-none w-40 p-6 rounded-2xl bg-[var(--color-surface-elevated)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)] border-2 border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all group snap-start text-center shadow-sm"
                                        >
                                            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--color-surface)] group-hover:bg-white/20 flex items-center justify-center transition-colors">
                                                <svg className="w-6 h-6 text-[var(--color-primary)] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                                </svg>
                                            </div>
                                            <h3 className="font-semibold text-sm truncate">{category.name}</h3>
                                            <p className="text-xs opacity-70 mt-1">{category.itemCount} items</p>
                                        </a>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Vendors Section */}
                        {vendorsWithCounts.length > 0 && (
                            <section className="bg-[var(--color-surface-elevated)] -mx-4 px-4 py-8 sm:mx-0 sm:px-8 sm:rounded-3xl border-2 border-[var(--color-border)] shadow-sm" id="vendors">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-2xl font-bold text-[var(--color-foreground)]">Meet Our Vendors</h2>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {vendorsWithCounts.slice(0, 8).map((vendor) => (
                                        <a
                                            key={vendor.id}
                                            href={buildVendorPath(vendor)}
                                            className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border-2 border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all group"
                                        >
                                            {vendor.storefront_logo_url ? (
                                                <img
                                                    src={vendor.storefront_logo_url}
                                                    alt={`${vendor.storefront_display_name || vendor.name} logo`}
                                                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-[var(--color-border)] group-hover:border-[var(--color-primary)] transition-colors"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 border-2 border-[var(--color-primary)]/20 group-hover:border-[var(--color-primary)] transition-colors">
                                                    <span className="text-lg font-bold text-[var(--color-primary)]">
                                                        {(vendor.storefront_display_name || vendor.name).charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="font-semibold text-sm text-[var(--color-foreground)] truncate group-hover:text-[var(--color-primary)] transition-colors">
                                                    {vendor.storefront_display_name || vendor.name}
                                                </p>
                                                {vendor.booth_location && (
                                                    <p className="text-xs text-[var(--color-muted)] mt-0.5">Booth {vendor.booth_location}</p>
                                                )}
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}

                {!isFiltered && !isLoading && featuredItems.length > 0 && (
                    <section className="py-12 border-t-2 border-[var(--color-border)]">
                        <div className="flex items-center justify-between gap-3 mb-8">
                            <h2 className="text-3xl font-bold text-[var(--color-foreground)] tracking-tight">
                                Featured Picks
                            </h2>
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm font-bold">
                                {featuredItems.length} {featuredItems.length === 1 ? 'item' : 'items'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {featuredItems.map((item) => (
                                <ProductCard key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Browse All / Search Results Section */}
                <section className="py-12 border-t-2 border-[var(--color-border)]">
                    {/* Section Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <h2 className="text-3xl font-bold text-[var(--color-foreground)] tracking-tight">
                                {isFiltered ? 'Search Results' : 'Browse All Items'}
                            </h2>
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] text-[var(--color-muted)] text-sm font-bold">
                                {pagination.total} {pagination.total === 1 ? 'item' : 'items'}
                            </span>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="text-sm font-bold text-[var(--color-primary)] hover:underline"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] border-2 border-[var(--color-border)] transition-colors shadow-sm"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                                />
                            </svg>
                            <span className="text-sm font-bold">Filters</span>
                            {hasActiveFilters && (
                                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary)]" />
                            )}
                        </button>
                    </div>

                    {/* Expandable Filters */}
                    {showFilters && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 p-6 bg-[var(--color-surface-elevated)] rounded-3xl border-2 border-[var(--color-border)] shadow-lg animate-fadeIn">
                            <Select
                                label="Category"
                                options={[
                                    { value: '', label: 'All Categories' },
                                    ...categories.map((c) => ({ value: c, label: c })),
                                ]}
                                value={filters.category}
                                onChange={(e) => updateFilters({ category: e.target.value })}
                            />
                            <Select
                                label="Price Range"
                                options={priceRanges}
                                value={getCurrentPriceValue()}
                                onChange={(e) => handlePriceChange(e.target.value)}
                            />
                            <Select
                                label="Vendor"
                                options={vendorOptions}
                                value={filters.vendor}
                                onChange={(e) => updateFilters({ vendor: e.target.value })}
                            />
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-24">
                            <LoadingSpinner size={32} />
                        </div>
                    )}

                    {/* Empty State */}
                    {!isLoading && items.length === 0 && (
                        <div className="text-center py-32 bg-[var(--color-surface-elevated)] rounded-3xl border-2 border-[var(--color-border)] border-dashed">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--color-surface)] flex items-center justify-center border-2 border-[var(--color-border)]">
                                <svg
                                    className="w-10 h-10 text-[var(--color-muted)]"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                    />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
                                No items found
                            </h3>
                            <p className="text-[var(--color-muted)] text-lg">
                                Try adjusting your search or filters
                            </p>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="mt-6 px-6 py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-bold hover:opacity-90 transition-opacity"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    )}

                    {/* Product Grid */}
                    {!isLoading && items.length > 0 && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {items.map((item) => (
                                    <ProductCard key={item.id} item={item} />
                                ))}
                            </div>

                            {/* Pagination */}
                            {pagination.totalPages > 1 && (
                                <div className="flex items-center justify-center gap-2 mt-12">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setPage(pagination.page - 1)}
                                        disabled={pagination.page === 1}
                                    >
                                        Previous
                                    </Button>

                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                            let pageNum: number;
                                            if (pagination.totalPages <= 5) {
                                                pageNum = i + 1;
                                            } else if (pagination.page <= 3) {
                                                pageNum = i + 1;
                                            } else if (pagination.page >= pagination.totalPages - 2) {
                                                pageNum = pagination.totalPages - 4 + i;
                                            } else {
                                                pageNum = pagination.page - 2 + i;
                                            }

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setPage(pageNum)}
                                                    className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${pagination.page === pageNum
                                                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-md scale-110'
                                                        : 'bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] border-2 border-[var(--color-border)] hover:border-[var(--color-primary)]'
                                                        }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setPage(pagination.page + 1)}
                                        disabled={pagination.page === pagination.totalPages}
                                    >
                                        Next
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
