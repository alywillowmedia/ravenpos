import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { EmptyState, TagIcon } from '../components/ui/EmptyState';
import { useInventory } from '../hooks/useInventory';
import { useConsignors } from '../hooks/useConsignors';
import { useCategories } from '../hooks/useCategories';
import { formatCurrency } from '../lib/utils';
import { generateLabelsPDF } from '../lib/generateLabelsPDF';
import type { Item } from '../types';

type PrintMode = 'all' | 'new' | 'custom';
type PrintedFilter = 'all' | 'none_printed' | 'some_printed' | 'all_printed';
type SortField = 'name' | 'created_at' | 'updated_at' | 'price' | 'quantity';
type SortOrder = 'asc' | 'desc';

interface PrintQuantityOverride {
    [itemId: string]: number;
}

interface Filters {
    consignorId: string;
    category: string;
    printedStatus: PrintedFilter;
    dateAddedFrom: string;
    dateAddedTo: string;
    dateUpdatedFrom: string;
    dateUpdatedTo: string;
}

export function Labels() {
    const { items, isLoading, markAsPrinted } = useInventory();
    const { consignors } = useConsignors();
    const { getCategoryNames } = useCategories();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showPrintOptions, setShowPrintOptions] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [printMode, setPrintMode] = useState<PrintMode>('all');
    const [customQuantities, setCustomQuantities] = useState<PrintQuantityOverride>({});
    const [isGenerating, setIsGenerating] = useState(false);

    // Filters
    const [filters, setFilters] = useState<Filters>({
        consignorId: '',
        category: '',
        printedStatus: 'all',
        dateAddedFrom: '',
        dateAddedTo: '',
        dateUpdatedFrom: '',
        dateUpdatedTo: '',
    });

    // Sorting
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const categories = getCategoryNames();

    // Apply filters and sorting
    const filteredAndSortedItems = useMemo(() => {
        let result = [...items];

        // Filter by consignor
        if (filters.consignorId) {
            result = result.filter((item) => item.consignor_id === filters.consignorId);
        }

        // Filter by category
        if (filters.category) {
            result = result.filter((item) => item.category === filters.category);
        }

        // Filter by printed status (based on qty_unlabeled)
        if (filters.printedStatus !== 'all') {
            result = result.filter((item) => {
                const unlabeled = item.qty_unlabeled || 0;
                const total = item.quantity;
                switch (filters.printedStatus) {
                    case 'none_printed':
                        return unlabeled === total; // All need labels
                    case 'some_printed':
                        return unlabeled > 0 && unlabeled < total; // Some need labels
                    case 'all_printed':
                        return unlabeled === 0; // None need labels
                    default:
                        return true;
                }
            });
        }

        // Filter by date added range
        if (filters.dateAddedFrom) {
            const fromDate = new Date(filters.dateAddedFrom);
            result = result.filter((item) => new Date(item.created_at) >= fromDate);
        }
        if (filters.dateAddedTo) {
            const toDate = new Date(filters.dateAddedTo);
            toDate.setHours(23, 59, 59, 999);
            result = result.filter((item) => new Date(item.created_at) <= toDate);
        }

        // Filter by date updated range
        if (filters.dateUpdatedFrom) {
            const fromDate = new Date(filters.dateUpdatedFrom);
            result = result.filter((item) => new Date(item.updated_at) >= fromDate);
        }
        if (filters.dateUpdatedTo) {
            const toDate = new Date(filters.dateUpdatedTo);
            toDate.setHours(23, 59, 59, 999);
            result = result.filter((item) => new Date(item.updated_at) <= toDate);
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'created_at':
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    break;
                case 'updated_at':
                    comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
                    break;
                case 'price':
                    comparison = Number(a.price) - Number(b.price);
                    break;
                case 'quantity':
                    comparison = a.quantity - b.quantity;
                    break;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [items, filters, sortField, sortOrder]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.consignorId) count++;
        if (filters.category) count++;
        if (filters.printedStatus !== 'all') count++;
        if (filters.dateAddedFrom || filters.dateAddedTo) count++;
        if (filters.dateUpdatedFrom || filters.dateUpdatedTo) count++;
        return count;
    }, [filters]);

    const clearFilters = () => {
        setFilters({
            consignorId: '',
            category: '',
            printedStatus: 'all',
            dateAddedFrom: '',
            dateAddedTo: '',
            dateUpdatedFrom: '',
            dateUpdatedTo: '',
        });
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredAndSortedItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAndSortedItems.map((i) => i.id)));
        }
    };

    const selectedItems = filteredAndSortedItems.filter((i) => selectedIds.has(i.id));

    // Calculate print quantities based on mode
    const getPrintQuantity = (item: Item): number => {
        switch (printMode) {
            case 'all':
                return item.quantity;
            case 'new':
                return item.qty_unlabeled || 0;
            case 'custom':
                return customQuantities[item.id] ?? (item.qty_unlabeled || 0);
            default:
                return item.quantity;
        }
    };

    // Get items with their print quantities
    const getItemsWithPrintQuantities = () => {
        return selectedItems.map((item) => ({
            ...item,
            printQuantity: getPrintQuantity(item),
        }));
    };

    const getTotalLabels = () => {
        return selectedItems.reduce((sum, item) => sum + getPrintQuantity(item), 0);
    };

    const handleGeneratePDF = async () => {
        setIsGenerating(true);
        try {
            const itemsWithQuantities = getItemsWithPrintQuantities();
            generateLabelsPDF(itemsWithQuantities);
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        }
        setIsGenerating(false);
    };

    const handleGenerateAndMark = async () => {
        setIsGenerating(true);
        try {
            const itemsWithQuantities = getItemsWithPrintQuantities();
            generateLabelsPDF(itemsWithQuantities);

            // Mark items as printed
            const printedItems = selectedItems.map((item) => ({
                id: item.id,
                printedCount: getPrintQuantity(item),
            }));
            await markAsPrinted(printedItems);

            // Reset selection
            setShowPrintOptions(false);
            setSelectedIds(new Set());
            setCustomQuantities({});
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        }
        setIsGenerating(false);
    };

    const handleOpenPrintOptions = () => {
        // Initialize custom quantities with "new" values (unlabeled count)
        const initial: PrintQuantityOverride = {};
        selectedItems.forEach((item) => {
            initial[item.id] = item.qty_unlabeled || 0;
        });
        setCustomQuantities(initial);
        setShowPrintOptions(true);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: '2-digit',
        });
    };

    const columns: Column<Item>[] = [
        {
            key: 'select',
            header: '',
            width: '50px',
            render: (item) => (
                <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    onClick={(e) => e.stopPropagation()}
                />
            ),
        },
        {
            key: 'sku',
            header: 'SKU',
            width: '140px',
            render: (item) => (
                <span className="font-mono text-xs">{item.sku}</span>
            ),
        },
        {
            key: 'name',
            header: 'Item',
            sortable: true,
            render: (item) => (
                <div>
                    <p className="font-medium">{item.name}</p>
                    {item.variant && (
                        <p className="text-xs text-[var(--color-muted)]">{item.variant}</p>
                    )}
                </div>
            ),
        },
        {
            key: 'consignor',
            header: 'Consignor',
            width: '100px',
            render: (item) => {
                const c = item.consignor as { consignor_number: string } | undefined;
                return c?.consignor_number || '—';
            },
        },
        {
            key: 'category',
            header: 'Category',
            width: '100px',
            render: (item) => (
                <span className="text-xs">{item.category}</span>
            ),
        },
        {
            key: 'price',
            header: 'Price',
            width: '80px',
            render: (item) => formatCurrency(Number(item.price)),
        },
        {
            key: 'unlabeled',
            header: 'Unlabeled',
            width: '90px',
            render: (item) => {
                const unlabeled = item.qty_unlabeled || 0;
                const allLabeled = unlabeled === 0;
                return (
                    <span className={allLabeled ? 'text-green-600 font-medium' : 'text-amber-600'}>
                        {unlabeled === 0 ? '✓' : unlabeled}
                    </span>
                );
            },
        },
        {
            key: 'created_at',
            header: 'Added',
            width: '90px',
            sortable: true,
            render: (item) => (
                <span className="text-xs text-[var(--color-muted)]">
                    {formatDate(item.created_at)}
                </span>
            ),
        },
        {
            key: 'updated_at',
            header: 'Updated',
            width: '90px',
            sortable: true,
            render: (item) => (
                <span className="text-xs text-[var(--color-muted)]">
                    {formatDate(item.updated_at)}
                </span>
            ),
        },
    ];

    // Print Options Modal
    if (showPrintOptions) {
        return (
            <div className="animate-fadeIn">
                <div className="mb-6 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setShowPrintOptions(false)}>
                        ← Back to Selection
                    </Button>
                </div>

                <div className="max-w-2xl mx-auto">
                    <h2 className="text-xl font-semibold mb-6">Print Options</h2>

                    {/* Print Mode Selection */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 mb-6">
                        <h3 className="font-medium mb-4">Select Print Mode</h3>
                        <div className="space-y-3">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="radio"
                                    name="printMode"
                                    checked={printMode === 'all'}
                                    onChange={() => setPrintMode('all')}
                                    className="mt-1"
                                />
                                <div>
                                    <p className="font-medium">Print All</p>
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Print labels for the full quantity of each item
                                    </p>
                                </div>
                            </label>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="radio"
                                    name="printMode"
                                    checked={printMode === 'new'}
                                    onChange={() => setPrintMode('new')}
                                    className="mt-1"
                                />
                                <div>
                                    <p className="font-medium">Print New Only</p>
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Print labels only for items that haven't been printed yet
                                    </p>
                                </div>
                            </label>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="radio"
                                    name="printMode"
                                    checked={printMode === 'custom'}
                                    onChange={() => setPrintMode('custom')}
                                    className="mt-1"
                                />
                                <div>
                                    <p className="font-medium">Custom Quantities</p>
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Specify exactly how many labels to print for each item
                                    </p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Custom Quantities Input */}
                    {printMode === 'custom' && (
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 mb-6">
                            <h3 className="font-medium mb-4">Custom Quantities</h3>
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {selectedItems.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{item.name}</p>
                                            <p className="text-xs text-[var(--color-muted)]">
                                                {item.qty_unlabeled || 0} of {item.quantity} need labels
                                            </p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            max={item.quantity}
                                            value={customQuantities[item.id] ?? 0}
                                            onChange={(e) => setCustomQuantities((prev) => ({
                                                ...prev,
                                                [item.id]: Math.max(0, parseInt(e.target.value) || 0),
                                            }))}
                                            className="w-20 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <p className="text-blue-800">
                            <strong>{getTotalLabels()}</strong> labels will be generated across{' '}
                            <strong>{Math.ceil(getTotalLabels() / 30)}</strong> sheet(s)
                        </p>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setShowPrintOptions(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleGeneratePDF}
                            disabled={getTotalLabels() === 0 || isGenerating}
                        >
                            {isGenerating ? 'Generating...' : 'Preview PDF'}
                        </Button>
                        <Button
                            onClick={handleGenerateAndMark}
                            disabled={getTotalLabels() === 0 || isGenerating}
                        >
                            <PrintIcon />
                            {isGenerating ? 'Generating...' : 'Generate & Mark Printed'}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fadeIn">
            <Header
                title="Print Labels"
                description="Select items and generate Avery 5160 compatible label PDFs."
                actions={
                    selectedIds.size > 0 && (
                        <Button onClick={handleOpenPrintOptions}>
                            Configure Print ({selectedIds.size})
                        </Button>
                    )
                }
            />

            {items.length === 0 && !isLoading ? (
                <EmptyState
                    icon={<TagIcon />}
                    title="No items to label"
                    description="Add items to your inventory first, then come back to print labels."
                />
            ) : (
                <>
                    {/* Filter Toggle & Sort Controls */}
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <Button
                                variant={showFilters ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => setShowFilters(!showFilters)}
                            >
                                <FilterIcon />
                                Filters
                                {activeFilterCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </Button>
                            {activeFilterCount > 0 && (
                                <Button variant="ghost" size="sm" onClick={clearFilters}>
                                    Clear
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--color-muted)]">Sort by:</span>
                            <select
                                value={sortField}
                                onChange={(e) => setSortField(e.target.value as SortField)}
                                className="text-sm px-2 py-1 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            >
                                <option value="created_at">Date Added</option>
                                <option value="updated_at">Date Updated</option>
                                <option value="name">Name (A-Z)</option>
                                <option value="price">Price</option>
                                <option value="quantity">Quantity</option>
                            </select>
                            <button
                                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                className="p-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                            >
                                {sortOrder === 'asc' ? '↑' : '↓'}
                            </button>
                        </div>
                    </div>

                    {/* Filter Panel */}
                    {showFilters && (
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Consignor Filter */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Consignor</label>
                                    <select
                                        value={filters.consignorId}
                                        onChange={(e) => setFilters({ ...filters, consignorId: e.target.value })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    >
                                        <option value="">All Consignors</option>
                                        {consignors.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.consignor_number} - {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Category Filter */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Category</label>
                                    <select
                                        value={filters.category}
                                        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    >
                                        <option value="">All Categories</option>
                                        {categories.map((cat) => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Printed Status Filter */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Printed Status</label>
                                    <select
                                        value={filters.printedStatus}
                                        onChange={(e) => setFilters({ ...filters, printedStatus: e.target.value as PrintedFilter })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    >
                                        <option value="all">All Items</option>
                                        <option value="none_printed">Not Printed</option>
                                        <option value="some_printed">Partially Printed</option>
                                        <option value="all_printed">Fully Printed</option>
                                    </select>
                                </div>

                                {/* Spacer for alignment */}
                                <div></div>

                                {/* Date Added Range */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Added From</label>
                                    <input
                                        type="date"
                                        value={filters.dateAddedFrom}
                                        onChange={(e) => setFilters({ ...filters, dateAddedFrom: e.target.value })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Added To</label>
                                    <input
                                        type="date"
                                        value={filters.dateAddedTo}
                                        onChange={(e) => setFilters({ ...filters, dateAddedTo: e.target.value })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>

                                {/* Date Updated Range */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Updated From</label>
                                    <input
                                        type="date"
                                        value={filters.dateUpdatedFrom}
                                        onChange={(e) => setFilters({ ...filters, dateUpdatedFrom: e.target.value })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Updated To</label>
                                    <input
                                        type="date"
                                        value={filters.dateUpdatedTo}
                                        onChange={(e) => setFilters({ ...filters, dateUpdatedTo: e.target.value })}
                                        className="w-full text-sm px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Selection Controls */}
                    <div className="flex items-center gap-4 mb-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleSelectAll}
                        >
                            {selectedIds.size === filteredAndSortedItems.length ? 'Deselect All' : 'Select All'}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                // Select only items that need labels
                                const unlabeledIds = filteredAndSortedItems
                                    .filter((i) => (i.qty_unlabeled || 0) > 0)
                                    .map((i) => i.id);
                                setSelectedIds(new Set(unlabeledIds));
                            }}
                        >
                            Select Unlabeled
                        </Button>
                        {selectedIds.size > 0 && (
                            <span className="text-sm text-[var(--color-muted)]">
                                {selectedIds.size} selected
                            </span>
                        )}
                        <span className="text-sm text-[var(--color-muted)] ml-auto">
                            Showing {filteredAndSortedItems.length} of {items.length} items
                        </span>
                    </div>

                    <Table
                        data={filteredAndSortedItems}
                        columns={columns}
                        keyExtractor={(item) => item.id}
                        searchable
                        searchPlaceholder="Search items..."
                        searchKeys={['name', 'sku', 'variant']}
                        onRowClick={(item) => toggleSelect(item.id)}
                        isLoading={isLoading}
                    />

                    {/* Sticky Footer */}
                    {selectedIds.size > 0 && (
                        <div className="fixed bottom-0 left-0 right-0 lg:left-64 p-4 bg-white border-t border-[var(--color-border)] shadow-lg">
                            <div className="max-w-4xl mx-auto flex items-center justify-between">
                                <p className="text-sm text-[var(--color-muted)]">
                                    {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
                                </p>
                                <Button onClick={handleOpenPrintOptions}>
                                    Configure Print Options
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function PrintIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
        </svg>
    );
}

function FilterIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
    );
}
