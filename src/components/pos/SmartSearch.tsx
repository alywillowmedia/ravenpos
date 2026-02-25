import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        Smart Item Search
                    </h2>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <CardContent className="p-4 flex-1 overflow-auto">
                    {/* Search Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty to search all vendors
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Item Name
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g., shirt"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                className="w-full"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty to see all items
                            </p>
                        </div>
                    </div>

                    {/* Error Message */}
                    {searchError && (
                        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
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
                        <div className="text-center py-8 text-gray-500">
                            <p>No items found matching your search.</p>
                            <p className="text-sm mt-2">Try adjusting your filters.</p>
                        </div>
                    )}

                    {!isSearching && searchResults.length === 0 && !vendorShortcode && !itemName && (
                        <div className="text-center py-8 text-gray-500">
                            <p>Enter a vendor shortcode and/or item name to search.</p>
                        </div>
                    )}

                    {!isSearching && searchResults.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-600 mb-3">
                                Found {searchResults.length} item{searchResults.length !== 1 ? 's' : ''}
                            </p>
                            {searchResults.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex-1">
                                            <h3 className="font-medium text-gray-900 group-hover:text-blue-900">
                                                {item.name}
                                            </h3>
                                            <p className="text-xs text-gray-600 mt-0.5">
                                                {item.consignor && typeof item.consignor === 'object'
                                                    ? `Vendor: ${item.consignor.name || item.consignor.consignor_number}`
                                                    : 'Unknown vendor'}
                                            </p>
                                        </div>
                                        <div className="text-right ml-2">
                                            <p className="font-semibold text-gray-900 group-hover:text-blue-900">
                                                {formatCurrency(item.price)}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Qty: {item.quantity}
                                            </p>
                                        </div>
                                    </div>
                                    {item.variant_summary && (
                                        <p className="text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded mt-2 inline-block">
                                            {item.variant_summary}
                                        </p>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>

                {/* Footer */}
                <div className="border-t p-4 flex justify-end gap-2">
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
