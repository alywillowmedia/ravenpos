import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { SearchResultRow } from '../ui/SearchResultRow';
import { useItemSearch } from '../../hooks/useItemSearch';
import { formatCurrency } from '../../lib/utils';
import type { Item } from '../../types';

interface SmartSearchProps {
    onItemSelect: (item: Item) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SmartSearch({ onItemSelect, isOpen, onClose }: SmartSearchProps) {
    const [vendorShortcode, setVendorShortcode] = useState('');
    const [itemName, setItemName] = useState('');
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

    const { searchResults, isSearching, searchError, searchItems } = useItemSearch();

    // Debounced search
    useEffect(() => {
        if (searchTimeout) clearTimeout(searchTimeout);

        const timeout = setTimeout(() => {
            searchItems(vendorShortcode, itemName);
        }, 300); // 300ms debounce

        setSearchTimeout(timeout);

        return () => clearTimeout(timeout);
    }, [vendorShortcode, itemName, searchItems]);

    const handleItemClick = (item: Item) => {
        onItemSelect(item);
        // Reset form
        setVendorShortcode('');
        setItemName('');
        onClose();
    };

    const handleClose = () => {
        setVendorShortcode('');
        setItemName('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-foreground)]">
                        <Search className="w-5 h-5" />
                        Smart Item Search
                    </h2>
                    <button
                        onClick={handleClose}
                        className="rounded p-1 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <CardContent className="p-4 flex-1 overflow-auto">
                    {/* Search Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
                                Vendor Shortcode
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g., ALY"
                                value={vendorShortcode}
                                onChange={(e) => setVendorShortcode(e.target.value.toUpperCase())}
                                autoFocus
                                className="w-full"
                            />
                            <p className="mt-1 text-xs text-[var(--color-muted)]">
                                Leave empty to search all vendors
                            </p>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
                                Item Name or SKU
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g., shirt or df4"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                className="w-full"
                            />
                            <p className="mt-1 text-xs text-[var(--color-muted)]">
                                Supports partial and fuzzy matches
                            </p>
                        </div>
                    </div>

                    {/* Error Message */}
                    {searchError && (
                        <div className="mb-4 rounded border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                            {searchError}
                        </div>
                    )}

                    {/* Loading Indicator */}
                    {isSearching && (
                        <div className="flex justify-center py-8">
                            <LoadingSpinner />
                        </div>
                    )}

                    {/* Search Results */}
                    {!isSearching && searchResults.length === 0 && (vendorShortcode || itemName) && (
                        <div className="py-8 text-center text-[var(--color-muted)]">
                            <p>No items found matching your search.</p>
                            <p className="mt-2 text-sm">Try adjusting your filters.</p>
                        </div>
                    )}

                    {!isSearching && searchResults.length === 0 && !vendorShortcode && !itemName && (
                        <div className="py-8 text-center text-[var(--color-muted)]">
                            <p>Enter a vendor shortcode and/or item name to search.</p>
                        </div>
                    )}

                    {!isSearching && searchResults.length > 0 && (
                        <div className="space-y-2">
                            <p className="mb-3 text-sm text-[var(--color-muted)]">
                                Found {searchResults.length} item{searchResults.length !== 1 ? 's' : ''}
                            </p>
                            {searchResults.map((item, index) => {
                                const subtitle = item.consignor && typeof item.consignor === 'object'
                                    ? `Vendor: ${item.consignor.name || item.consignor.consignor_number}`
                                    : 'Unknown vendor';
                                return (
                                    <SearchResultRow
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        selected={index === 0}
                                        title={item.name}
                                        subtitle={subtitle}
                                        value={formatCurrency(item.price)}
                                        meta={`Qty: ${item.quantity}`}
                                        detail={item.variant_summary || undefined}
                                    />
                                );
                            })}
                        </div>
                    )}
                </CardContent>

                {/* Footer */}
                <div className="flex justify-end gap-2 border-t border-[var(--color-border)] p-4">
                    <Button
                        variant="secondary"
                        onClick={handleClose}
                    >
                        Close
                    </Button>
                </div>
            </Card>
        </div>
    );
}
