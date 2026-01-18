import { useState, useMemo } from 'react';
import { usePublicInventory } from '../../hooks/usePublicInventory';
import { ProductCard } from '../../components/storefront/ProductCard';
import { HeroSection } from '../../components/storefront/HeroSection';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export function BrowsePage() {
    const {
        items,
        categories,
        vendors,
        isLoading,
        filters,
        updateFilters,
        pagination,
        setPage,
    } = usePublicInventory();

    const [showFilters, setShowFilters] = useState(false);
    const [categoriesOpen, setCategoriesOpen] = useState(false);
    const [vendorsOpen, setVendorsOpen] = useState(false);

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
            label: v.booth ? `${v.name} (Booth ${v.booth})` : v.name,
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

    return (
        <div className="animate-fadeIn">
            {/* Hero Section */}
            <HeroSection
                storeName="RavenPOS"
                searchValue={filters.search}
                onSearchChange={(value) => updateFilters({ search: value })}
            />

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Show sections only when not filtering */}
                {!isFiltered && !isLoading && (categoriesWithCounts.length > 0 || vendorsWithCounts.length > 0) && (
                    <section className="py-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                            {/* Categories Dropdown */}
                            {categoriesWithCounts.length > 0 && (
                                <div className="bg-white rounded-2xl border border-[var(--color-border)] overflow-hidden">
                                    <button
                                        onClick={() => setCategoriesOpen(!categoriesOpen)}
                                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface)] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center">
                                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <h3 className="font-semibold text-[var(--color-foreground)]">Shop by Category</h3>
                                                <p className="text-sm text-[var(--color-muted)]">{categoriesWithCounts.length} categories</p>
                                            </div>
                                        </div>
                                        <svg
                                            className={`w-5 h-5 text-[var(--color-muted)] transition-transform ${categoriesOpen ? 'rotate-180' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {categoriesOpen && (
                                        <div className="px-4 pb-4 animate-fadeIn">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {categoriesWithCounts.map((category) => (
                                                    <a
                                                        key={category.name}
                                                        href={`/category/${encodeURIComponent(category.name)}`}
                                                        className="block p-3 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-primary)] hover:text-white border border-[var(--color-border)] hover:border-transparent transition-all group"
                                                    >
                                                        <p className="font-medium text-sm truncate">{category.name}</p>
                                                        <p className="text-xs opacity-60 mt-0.5">{category.itemCount} items</p>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Vendors Dropdown */}
                            {vendorsWithCounts.length > 0 && (
                                <div className="bg-white rounded-2xl border border-[var(--color-border)] overflow-hidden">
                                    <button
                                        onClick={() => setVendorsOpen(!vendorsOpen)}
                                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface)] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <h3 className="font-semibold text-[var(--color-foreground)]">Our Vendors</h3>
                                                <p className="text-sm text-[var(--color-muted)]">{vendorsWithCounts.length} vendors</p>
                                            </div>
                                        </div>
                                        <svg
                                            className={`w-5 h-5 text-[var(--color-muted)] transition-transform ${vendorsOpen ? 'rotate-180' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {vendorsOpen && (
                                        <div className="px-4 pb-4 animate-fadeIn">
                                            <div className="grid grid-cols-2 gap-2">
                                                {vendorsWithCounts.map((vendor) => (
                                                    <a
                                                        key={vendor.id}
                                                        href={`/vendor/${vendor.id}`}
                                                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-primary)] hover:text-white border border-[var(--color-border)] hover:border-transparent transition-all group"
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 group-hover:from-white/20 group-hover:to-white/10">
                                                            <span className="text-sm font-bold text-white">
                                                                {vendor.name.charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-sm truncate">{vendor.name}</p>
                                                            {vendor.booth_location && (
                                                                <p className="text-xs opacity-60">Booth {vendor.booth_location}</p>
                                                            )}
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Browse All / Search Results Section */}
                <section className="py-10 border-t border-[var(--color-border)]">
                    {/* Section Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-bold text-[var(--color-foreground)]">
                                {isFiltered ? 'Search Results' : 'Browse All Items'}
                            </h2>
                            <span className="text-[var(--color-muted)]">
                                ({pagination.total} {pagination.total === 1 ? 'item' : 'items'})
                            </span>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="text-sm text-[var(--color-primary)] hover:underline"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
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
                            <span className="text-sm font-medium">Filters</span>
                            {hasActiveFilters && (
                                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                            )}
                        </button>
                    </div>

                    {/* Expandable Filters */}
                    {showFilters && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 p-4 bg-white rounded-xl border border-[var(--color-border)] animate-fadeIn">
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
                        <div className="text-center py-24">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
                                <svg
                                    className="w-8 h-8 text-[var(--color-muted)]"
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
                            <h3 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
                                No items found
                            </h3>
                            <p className="text-[var(--color-muted)]">
                                Try adjusting your search or filters
                            </p>
                        </div>
                    )}

                    {/* Product Grid */}
                    {!isLoading && items.length > 0 && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                                                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${pagination.page === pageNum
                                                        ? 'bg-[var(--color-primary)] text-white'
                                                        : 'bg-white text-[var(--color-foreground)] hover:bg-[var(--color-surface)] border border-[var(--color-border)]'
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
