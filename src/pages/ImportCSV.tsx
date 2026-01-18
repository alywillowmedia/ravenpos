import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Table, type Column } from '../components/ui/Table';
import { useConsignors } from '../hooks/useConsignors';
import { useInventory } from '../hooks/useInventory';
import { useCategories } from '../hooks/useCategories';
import { formatCurrency } from '../lib/utils';

interface CSVRow {
    [key: string]: string;
}

interface MappedItem {
    id: string;
    sku: string;
    name: string;
    variant: string;
    category: string;
    quantity: number;
    price: number;
}

export function ImportCSV() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { consignors } = useConsignors();
    const { createItems } = useInventory();
    const { getCategoryNames } = useCategories();

    const [selectedConsignor, setSelectedConsignor] = useState('');
    const [csvData, setCsvData] = useState<CSVRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mappedItems, setMappedItems] = useState<MappedItem[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Column mappings
    const [skuColumn, setSkuColumn] = useState('');
    const [nameColumn, setNameColumn] = useState('');
    const [variantColumn, setVariantColumn] = useState('');
    const [categoryColumn, setCategoryColumn] = useState('');
    const [quantityColumn, setQuantityColumn] = useState('');
    const [priceColumn, setPriceColumn] = useState('');

    const downloadTemplate = () => {
        const link = document.createElement('a');
        link.href = '/templates/inventory_template.csv';
        link.download = 'inventory_template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setCsvData([]);
        setMappedItems([]);

        Papa.parse<CSVRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    setError('Error parsing CSV: ' + results.errors[0].message);
                    return;
                }

                const data = results.data;
                if (data.length === 0) {
                    setError('CSV file is empty');
                    return;
                }

                const columnHeaders = Object.keys(data[0]);
                setHeaders(columnHeaders);
                setCsvData(data);

                // Auto-detect column mappings based on exact matches first, then fallback to includes
                const lowerHeaders = columnHeaders.map((h) => h.toLowerCase().trim());

                // Try exact match first, then partial match
                const findColumn = (exactMatches: string[], partialMatches: string[]) => {
                    // First try exact matches
                    const exactMatch = columnHeaders.find((_h, i) =>
                        exactMatches.some((k) => lowerHeaders[i] === k)
                    );
                    if (exactMatch) return exactMatch;

                    // Then try partial matches
                    return columnHeaders.find((_h, i) =>
                        partialMatches.some((k) => lowerHeaders[i].includes(k))
                    ) || '';
                };

                setSkuColumn(findColumn(['sku'], ['sku', 'upc', 'barcode', 'code']));
                setNameColumn(findColumn(['name', 'item name'], ['name', 'title', 'item', 'description']));
                setVariantColumn(findColumn(['variant'], ['variant', 'size', 'color', 'option']));
                setCategoryColumn(findColumn(['category'], ['category', 'type', 'cat']));
                setQuantityColumn(findColumn(['quantity', 'qty'], ['quantity', 'qty', 'stock', 'count']));
                setPriceColumn(findColumn(['price'], ['price', 'cost', 'amount', 'value']));
            },
        });
    };

    const applyMapping = () => {
        if (!nameColumn || !priceColumn) {
            setError('Name and Price columns are required');
            return;
        }

        const categories = getCategoryNames();
        const items: MappedItem[] = csvData.map((row, index) => {
            const rawPrice = row[priceColumn] || '0';
            const price = parseFloat(rawPrice.replace(/[^0-9.-]/g, '')) || 0;

            const rawQty = quantityColumn ? row[quantityColumn] : '1';
            const quantity = parseInt(rawQty, 10) || 1;

            let category = categoryColumn ? row[categoryColumn] : 'Other';
            if (!categories.includes(category)) {
                category = 'Other';
            }

            return {
                id: `row-${index}`,
                sku: skuColumn ? row[skuColumn]?.trim() || '' : '',
                name: row[nameColumn] || '',
                variant: variantColumn ? row[variantColumn] || '' : '',
                category,
                quantity,
                price,
            };
        }).filter((item) => item.name && item.price > 0);

        if (items.length === 0) {
            setError('No valid items found. Make sure Name and Price columns are mapped correctly.');
            return;
        }

        setMappedItems(items);
        setError(null);
    };

    const handleImport = async () => {
        if (!selectedConsignor) {
            setError('Please select a consignor');
            return;
        }

        const consignorData = consignors.find((c) => c.id === selectedConsignor);
        if (!consignorData) return;

        setIsImporting(true);
        setError(null);

        const itemsToCreate = mappedItems.map((item) => ({
            consignor_id: selectedConsignor,
            consignorNumber: consignorData.consignor_number,
            sku: item.sku || undefined,
            name: item.name,
            variant: item.variant,
            category: item.category,
            quantity: item.quantity,
            price: item.price,
        }));

        const result = await createItems(itemsToCreate);

        setIsImporting(false);

        if (result.error) {
            setError(result.error);
        } else {
            navigate('/admin/inventory');
        }
    };

    const consignorOptions = consignors.map((c) => ({
        value: c.id,
        label: `${c.consignor_number} - ${c.name}`,
    }));

    const headerOptions = [
        { value: '', label: 'Not mapped' },
        ...headers.map((h) => ({ value: h, label: h })),
    ];

    const previewColumns: Column<MappedItem>[] = [
        { key: 'sku', header: 'SKU', width: '120px' },
        { key: 'name', header: 'Name', sortable: true },
        { key: 'variant', header: 'Variant' },
        { key: 'category', header: 'Category' },
        { key: 'quantity', header: 'Qty', width: '80px' },
        {
            key: 'price',
            header: 'Price',
            width: '100px',
            render: (item) => formatCurrency(item.price),
        },
    ];

    return (
        <div className="animate-fadeIn">
            <Header
                title="Import from CSV"
                description="Upload a CSV file to bulk import items."
            />

            {error && (
                <div className="mb-6 p-4 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            {/* Step 1: Select Consignor */}
            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <StepNumber>1</StepNumber>
                        Select Consignor
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="max-w-xs">
                        <Select
                            options={consignorOptions}
                            value={selectedConsignor}
                            onChange={(e) => setSelectedConsignor(e.target.value)}
                            placeholder="Select consignor..."
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Step 2: Upload File */}
            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <StepNumber>2</StepNumber>
                            Upload CSV File
                        </span>
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 rounded-lg transition-colors"
                        >
                            <DownloadIcon />
                            Download Template
                        </button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
                    >
                        <UploadIcon />
                        <p className="mt-2 font-medium text-[var(--color-foreground)]">
                            Click to upload CSV
                        </p>
                        <p className="text-sm text-[var(--color-muted)]">
                            or drag and drop
                        </p>
                    </div>
                    {csvData.length > 0 && (
                        <p className="mt-4 text-sm text-[var(--color-success)]">
                            ✓ Loaded {csvData.length} rows
                        </p>
                    )}
                    <p className="mt-4 text-xs text-[var(--color-muted)]">
                        Valid categories: Clothing, Accessories, Collectibles, Books, Furniture, Electronics, Art, Jewelry, Vintage, Other
                    </p>
                </CardContent>
            </Card>

            {/* Step 3: Map Columns */}
            {csvData.length > 0 && (
                <Card variant="outlined" className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <StepNumber>3</StepNumber>
                            Map Columns
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
                            <Select
                                label="SKU"
                                options={headerOptions}
                                value={skuColumn}
                                onChange={(e) => setSkuColumn(e.target.value)}
                            />
                            <Select
                                label="Name *"
                                options={headerOptions}
                                value={nameColumn}
                                onChange={(e) => setNameColumn(e.target.value)}
                            />
                            <Select
                                label="Variant"
                                options={headerOptions}
                                value={variantColumn}
                                onChange={(e) => setVariantColumn(e.target.value)}
                            />
                            <Select
                                label="Category"
                                options={headerOptions}
                                value={categoryColumn}
                                onChange={(e) => setCategoryColumn(e.target.value)}
                            />
                            <Select
                                label="Quantity"
                                options={headerOptions}
                                value={quantityColumn}
                                onChange={(e) => setQuantityColumn(e.target.value)}
                            />
                            <Select
                                label="Price *"
                                options={headerOptions}
                                value={priceColumn}
                                onChange={(e) => setPriceColumn(e.target.value)}
                            />
                        </div>
                        <Button onClick={applyMapping}>
                            Preview Mapping
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Preview & Import */}
            {mappedItems.length > 0 && (
                <Card variant="outlined">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <StepNumber>4</StepNumber>
                            Preview & Import
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table
                            data={mappedItems.slice(0, 10)}
                            columns={previewColumns}
                            keyExtractor={(item) => item.id}
                            emptyMessage="No items"
                        />
                        {mappedItems.length > 10 && (
                            <p className="mt-2 text-sm text-[var(--color-muted)]">
                                Showing first 10 of {mappedItems.length} items
                            </p>
                        )}
                        <div className="mt-6 flex items-center justify-between">
                            <p className="text-sm text-[var(--color-muted)]">
                                {mappedItems.length} items will be imported
                            </p>
                            <Button
                                onClick={handleImport}
                                isLoading={isImporting}
                                disabled={!selectedConsignor}
                            >
                                Import {mappedItems.length} Items
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function StepNumber({ children }: { children: React.ReactNode }) {
    return (
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs font-medium flex items-center justify-center">
            {children}
        </span>
    );
}

function UploadIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
    );
}
