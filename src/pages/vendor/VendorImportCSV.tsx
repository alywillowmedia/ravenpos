import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Table, type Column } from '../../components/ui/Table';
import { useAuth } from '../../contexts/AuthContext';
import { useConsignors } from '../../hooks/useConsignors';
import { useInventory } from '../../hooks/useInventory';
import { useCategories } from '../../hooks/useCategories';
import { formatCurrency } from '../../lib/utils';
import { detectShopifyCSV, preprocessShopifyCSV, type PreprocessResult } from '../../lib/csvPreprocessing';

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
    image_url: string | null;
}

export function VendorImportCSV() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { userRecord } = useAuth();
    const { consignors } = useConsignors();
    const { createItems } = useInventory(userRecord?.consignor_id || undefined);
    const { getCategoryNames } = useCategories();

    // Get vendor's consignor data
    const consignorData = consignors.find((c) => c.id === userRecord?.consignor_id);

    const [csvData, setCsvData] = useState<CSVRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mappedItems, setMappedItems] = useState<MappedItem[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Shopify import state
    const [hasHandleColumn, setHasHandleColumn] = useState(false);
    const [isShopifyImport, setIsShopifyImport] = useState<boolean | null>(null);
    const [preprocessResult, setPreprocessResult] = useState<PreprocessResult | null>(null);
    const [shopifyStepComplete, setShopifyStepComplete] = useState(false);

    // Column mappings
    const [skuColumn, setSkuColumn] = useState('');
    const [nameColumn, setNameColumn] = useState('');
    const [variantColumn, setVariantColumn] = useState('');
    const [categoryColumn, setCategoryColumn] = useState('');
    const [quantityColumn, setQuantityColumn] = useState('');
    const [priceColumn, setPriceColumn] = useState('');
    const [imageColumn, setImageColumn] = useState('');

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
        setHasHandleColumn(false);
        setIsShopifyImport(null);
        setPreprocessResult(null);
        setShopifyStepComplete(false);

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

                // Detect if this looks like a Shopify export
                const isShopify = detectShopifyCSV(columnHeaders);
                setHasHandleColumn(isShopify);
                if (!isShopify) {
                    // Skip Shopify step if no Handle column
                    setShopifyStepComplete(true);
                }

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
                setImageColumn(findColumn(['image src', 'image url'], ['image', 'photo', 'picture', 'img']));
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
                image_url: imageColumn ? row[imageColumn]?.trim() || null : null,
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
        if (!userRecord?.consignor_id || !consignorData) {
            setError('Unable to determine your consignor account');
            return;
        }

        setIsImporting(true);
        setError(null);

        const itemsToCreate = mappedItems.map((item) => ({
            consignor_id: userRecord.consignor_id!,
            consignorNumber: consignorData.consignor_number,
            sku: item.sku || undefined,
            name: item.name,
            variant: item.variant,
            category: item.category,
            quantity: item.quantity,
            price: item.price,
            image_url: item.image_url,
        }));

        const result = await createItems(itemsToCreate);

        setIsImporting(false);

        if (result.error) {
            setError(result.error);
        } else {
            navigate('/vendor/inventory');
        }
    };

    const handleShopifyPreprocess = () => {
        if (isShopifyImport === null) {
            setError('Please select whether this is a Shopify import');
            return;
        }

        if (isShopifyImport) {
            // Run Shopify preprocessing
            const result = preprocessShopifyCSV(csvData);
            setCsvData(result.data);
            setPreprocessResult(result);

            // Auto-map Shopify-specific columns
            const lowerHeaders = headers.map(h => h.toLowerCase().trim());

            // Map Title -> name if not already mapped
            const titleIdx = lowerHeaders.findIndex(h => h === 'title');
            if (titleIdx !== -1 && !nameColumn) {
                setNameColumn(headers[titleIdx]);
            }

            // Map Option1 Value -> variant if not already mapped
            const variantIdx = lowerHeaders.findIndex(h =>
                h === 'option1 value' || h === 'variant sku' || h.includes('option')
            );
            if (variantIdx !== -1 && !variantColumn) {
                setVariantColumn(headers[variantIdx]);
            }

            // Map Image Src -> image_url if not already mapped
            const imageIdx = lowerHeaders.findIndex(h =>
                h === 'image src' || h === 'image url'
            );
            if (imageIdx !== -1 && !imageColumn) {
                setImageColumn(headers[imageIdx]);
            }

            // Check for warnings
            if (result.warnings.length > 0) {
                setError(`Warning: ${result.warnings.join(', ')}`);
            }
        }

        setShopifyStepComplete(true);
    };

    const headerOptions = [
        { value: '', label: 'Not mapped' },
        ...headers.map((h) => ({ value: h, label: h })),
    ];

    const previewColumns: Column<MappedItem>[] = [
        {
            key: 'image',
            header: '',
            width: '50px',
            render: (item) => (
                <div className="w-8 h-8 rounded overflow-hidden bg-[var(--color-surface)] flex-shrink-0 flex items-center justify-center border border-[var(--color-border)]">
                    {item.image_url ? (
                        <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <ImagePlaceholderIcon />
                    )}
                </div>
            ),
        },
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

    // Show loading state if consignor data not yet loaded
    if (!consignorData && userRecord?.consignor_id) {
        return (
            <div className="animate-fadeIn">
                <Header
                    title="Import from CSV"
                    description="Loading your account information..."
                />
            </div>
        );
    }

    // Show error if no consignor association
    if (!userRecord?.consignor_id) {
        return (
            <div className="animate-fadeIn">
                <Header
                    title="Import from CSV"
                    description="Upload a CSV file to bulk import items."
                />
                <div className="p-4 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    Your account is not associated with a consignor. Please contact support.
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fadeIn">
            <Header
                title="Import from CSV"
                description={`Bulk import items to your inventory (${consignorData?.name || 'Your Account'})`}
            />

            {error && (
                <div className="mb-6 p-4 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            {/* Step 1: Upload File */}
            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <StepNumber>1</StepNumber>
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
                            Loaded {csvData.length} rows
                        </p>
                    )}
                    <p className="mt-4 text-xs text-[var(--color-muted)]">
                        Valid categories: Clothing, Accessories, Collectibles, Books, Furniture, Electronics, Art, Jewelry, Vintage, Other
                    </p>
                </CardContent>
            </Card>

            {/* Step 2: Shopify Import Detection (only shows if Handle column detected) */}
            {csvData.length > 0 && hasHandleColumn && !shopifyStepComplete && (
                <Card variant="outlined" className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <StepNumber>2</StepNumber>
                            Is this a Shopify export?
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-[var(--color-muted)] mb-4">
                            We detected a "Handle" column which is common in Shopify exports.
                            Shopify exports often have blank product titles for variant rows.
                        </p>
                        <div className="space-y-3 mb-4">
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface-elevated)] transition-colors">
                                <input
                                    type="radio"
                                    name="shopifyImport"
                                    checked={isShopifyImport === true}
                                    onChange={() => setIsShopifyImport(true)}
                                    className="w-4 h-4 text-[var(--color-primary)]"
                                />
                                <div>
                                    <p className="font-medium text-[var(--color-foreground)]">Yes - Fix blank variant titles</p>
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Copy product titles to all variants with the same Handle
                                    </p>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface-elevated)] transition-colors">
                                <input
                                    type="radio"
                                    name="shopifyImport"
                                    checked={isShopifyImport === false}
                                    onChange={() => setIsShopifyImport(false)}
                                    className="w-4 h-4 text-[var(--color-primary)]"
                                />
                                <div>
                                    <p className="font-medium text-[var(--color-foreground)]">No - Import as-is</p>
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Use the CSV data without preprocessing
                                    </p>
                                </div>
                            </label>
                        </div>
                        <Button onClick={handleShopifyPreprocess}>
                            Continue
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Shopify Preprocessing Summary */}
            {preprocessResult && (
                <div className="mb-6 p-4 rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/30">
                    <p className="font-medium text-[var(--color-success)] mb-1">
                        Shopify CSV Preprocessed
                    </p>
                    <p className="text-sm text-[var(--color-foreground)]">
                        Fixed {preprocessResult.fixedCount} blank product title{preprocessResult.fixedCount !== 1 ? 's' : ''} across {preprocessResult.productCount} product{preprocessResult.productCount !== 1 ? 's' : ''}.
                    </p>
                    {preprocessResult.warnings.length > 0 && (
                        <p className="text-sm text-[var(--color-warning)] mt-1">
                            {preprocessResult.warnings.length} warning{preprocessResult.warnings.length !== 1 ? 's' : ''}: Some products have no title
                        </p>
                    )}
                </div>
            )}

            {/* Step 3: Map Columns (or Step 2 if no Shopify step) */}
            {csvData.length > 0 && shopifyStepComplete && (
                <Card variant="outlined" className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <StepNumber>{hasHandleColumn ? 3 : 2}</StepNumber>
                            Map Columns
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
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
                            <Select
                                label="Image URL"
                                options={headerOptions}
                                value={imageColumn}
                                onChange={(e) => setImageColumn(e.target.value)}
                            />
                        </div>
                        <Button onClick={applyMapping}>
                            Preview Mapping
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Preview & Import (or Step 3 if no Shopify step) */}
            {mappedItems.length > 0 && (
                <Card variant="outlined">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <StepNumber>{hasHandleColumn ? 4 : 3}</StepNumber>
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
                                {mappedItems.length} items will be imported to your inventory
                            </p>
                            <Button
                                onClick={handleImport}
                                isLoading={isImporting}
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

function ImagePlaceholderIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
    );
}
