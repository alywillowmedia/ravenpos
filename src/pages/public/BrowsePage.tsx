import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePublicInventory } from '../../hooks/usePublicInventory';
import { ProductCard } from '../../components/storefront/ProductCard';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { buildVendorPath } from '../../lib/storefront';

type ShopPanel = 'categories' | 'vendors' | null;

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

    const [showFilters, setShowFilters] = useState(false);
    const [activeShopPanel, setActiveShopPanel] = useState<ShopPanel>(null);

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

    const shopNavButtons = [
        { key: 'products', label: 'All Products' },
        { key: 'categories', label: 'Categories' },
        { key: 'vendors', label: 'Vendors', count: vendorsWithCounts.length },
    ] as const;

    useEffect(() => {
        updateFilters({ search: querySearch });
    }, [querySearch, updateFilters]);

    return (
        <div className="animate-fadeIn">
            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {!isEmbedMode && (
                    <section className="border-b border-[var(--color-border)] py-8 sm:py-10">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                            <div className="max-w-2xl">
                                <p className="ravenlia-eyebrow mb-2">Shop Ravenlia</p>
                                <h1 className="ravenlia-display text-4xl leading-tight text-[var(--color-foreground)] sm:text-5xl">
                                    Browse the collection
                                </h1>
                                <p className="mt-3 text-[var(--color-muted)]">
                                    Search current in-store finds, explore categories, and visit vendor storefronts.
                                </p>
                            </div>

                            <div className="w-full max-w-xl">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search items by name or SKU"
                                        value={filters.search}
                                        onChange={(e) => updateFilters({ search: e.target.value })}
                                        className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] py-3 pl-11 pr-4 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] shadow-[var(--shadow-gallery)] transition-colors focus:outline-none focus:border-[var(--color-foreground)]"
                                    />
                                    <svg className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <nav className="mt-7 flex flex-wrap gap-2" aria-label="Shop navigation">
                            {shopNavButtons.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => {
                                        if (item.key === 'products') {
                                            setActiveShopPanel(null);
                                            document.getElementById('all-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            return;
                                        }
                                        setActiveShopPanel((current) => current === item.key ? null : item.key);
                                    }}
                                    aria-expanded={item.key === 'products' ? undefined : activeShopPanel === item.key}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${(item.key === 'products' ? activeShopPanel === null : activeShopPanel === item.key)
                                        ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)] text-[var(--color-background)] shadow-[var(--shadow-gallery)]'
                                        : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] hover:border-[var(--color-foreground)] hover:shadow-[var(--shadow-gallery)]'
                                        }`}
                                >
                                    {item.label}
                                    {'count' in item && (
                                        <span className={`text-xs ${activeShopPanel === item.key ? 'text-[var(--color-background)]/70' : 'text-[var(--color-muted)]'}`}>
                                            {item.count}
                                        </span>
                                    )}
                                    {item.key !== 'products' && (
                                        <svg className={`h-3.5 w-3.5 transition-transform ${activeShopPanel === item.key ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </nav>

                        {activeShopPanel && !isLoading && (
                            <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 shadow-[var(--shadow-gallery)] animate-fadeIn">
                                {activeShopPanel === 'categories' && (
                                    <div>
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="ravenlia-eyebrow">Shop by category</p>
                                            <Link to="/shop/categories" className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
                                                View all
                                            </Link>
                                        </div>
                                        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
                                            {categoriesWithCounts.map((category) => (
                                                <Link
                                                    key={category.name}
                                                    to={`/shop/category/${encodeURIComponent(category.name)}`}
                                                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-foreground)] transition-all hover:border-[var(--color-foreground)]"
                                                >
                                                    {category.name}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeShopPanel === 'vendors' && (
                                    <div>
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="ravenlia-eyebrow">Vendor storefronts</p>
                                            <Link to="/shop/vendors" className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
                                                View all
                                            </Link>
                                        </div>
                                        <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                                            {vendorsWithCounts.map((vendor) => (
                                                <Link
                                                    key={vendor.id}
                                                    to={buildVendorPath(vendor)}
                                                    className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 transition-all hover:border-[var(--color-foreground)]"
                                                >
                                                    {vendor.storefront_logo_url ? (
                                                        <img
                                                            src={vendor.storefront_logo_url}
                                                            alt={`${vendor.storefront_display_name || vendor.name} logo`}
                                                            className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                                                        />
                                                    ) : (
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)] ring-1 ring-[var(--color-border)]">
                                                            {(vendor.storefront_display_name || vendor.name).charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm text-[var(--color-foreground)] group-hover:text-[var(--color-primary)]">
                                                            {vendor.storefront_display_name || vendor.name}
                                                        </p>
                                                        <p className="truncate text-xs text-[var(--color-muted)]">
                                                            {vendor.booth_location ? `Booth ${vendor.booth_location}` : `${vendor.itemCount} ${vendor.itemCount === 1 ? 'item' : 'items'}`}
                                                        </p>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                )}

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

                {!isFiltered && !isLoading && featuredItems.length > 0 && (
                    <section id="featured" className="py-12 border-t border-[var(--color-border)]">
                        <div className="flex items-end justify-between gap-3 mb-8">
                            <div>
                                <p className="ravenlia-eyebrow mb-2">Hand-selected</p>
                                <h2 className="text-3xl text-[var(--color-foreground)]">Featured Picks</h2>
                            </div>
                            <span className="text-sm text-[var(--color-muted)]">
                                {featuredItems.length} {featuredItems.length === 1 ? 'piece' : 'pieces'}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                            {featuredItems.map((item) => (
                                <ProductCard key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Browse All / Search Results Section */}
                <section id="all-products" className="py-12 border-t border-[var(--color-border)]">
                    {/* Section Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
                        <div>
                            <p className="ravenlia-eyebrow mb-2">{isFiltered ? 'Results' : 'The collection'}</p>
                            <div className="flex items-center gap-3">
                                <h2 className="text-3xl text-[var(--color-foreground)]">
                                    {isFiltered ? 'Search Results' : 'Browse All'}
                                </h2>
                                <span className="text-sm text-[var(--color-muted)]">
                                    {pagination.total} {pagination.total === 1 ? 'piece' : 'pieces'}
                                </span>
                                {hasActiveFilters && (
                                    <button
                                        onClick={clearFilters}
                                        className="text-sm text-[var(--color-primary)] hover:underline"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-5 py-2.5 transition-all hover:border-[var(--color-foreground)] hover:shadow-[var(--shadow-gallery)]"
                        >
                            <svg
                                className="w-4 h-4"
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
                            <span className="text-sm">Filters</span>
                            {hasActiveFilters && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                            )}
                        </button>
                    </div>

                    {/* Expandable Filters */}
                    {showFilters && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 p-6 bg-[var(--color-surface-elevated)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-gallery)] animate-fadeIn">
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
                        <div className="text-center py-32 bg-[var(--color-surface-elevated)] rounded-2xl border border-dashed border-[var(--color-border)]">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
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
                            <h3 className="text-2xl text-[var(--color-foreground)] mb-2">
                                Nothing here yet
                            </h3>
                            <p className="text-[var(--color-muted)] text-lg">
                                Try adjusting your search or filters
                            </p>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="mt-6 rounded-full bg-[var(--color-foreground)] px-6 py-3 text-sm font-medium text-[var(--color-background)] transition-colors hover:bg-[var(--color-primary)]"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    )}

                    {/* Product Grid */}
                    {!isLoading && items.length > 0 && (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
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
                                                    className={`w-10 h-10 rounded-full text-sm transition-all ${pagination.page === pageNum
                                                        ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                                                        : 'bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:border-[var(--color-foreground)]'
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
