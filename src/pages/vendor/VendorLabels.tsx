import { useState, useMemo } from 'react';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Table, type Column } from '../../components/ui/Table';
import { EmptyState, TagIcon } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useInventory } from '../../hooks/useInventory';
import { useCategories } from '../../hooks/useCategories';
import { formatCurrency } from '../../lib/utils';
import { generateLabelsPDF } from '../../lib/generateLabelsPDF';
import { downloadDymo30252PrintPack, downloadDymo30252TemplateForItems, downloadDymoPrintDataCsvFile } from '../../lib/dymoLabelTemplate';
import { checkDymoWebAvailability, printDymoLabelsDirect, type DymoWebAvailability } from '../../lib/dymoWebPrint';
import type { Item } from '../../types';

type PrintMode = 'all' | 'new' | 'custom';
type PrintedFilter = 'all' | 'none_printed' | 'some_printed' | 'all_printed';
type SortField = 'name' | 'created_at' | 'updated_at' | 'price' | 'quantity';
type SortOrder = 'asc' | 'desc';

interface PrintQuantityOverride {
    [itemId: string]: number;
}

interface Filters {
    category: string;
    printedStatus: PrintedFilter;
    dateAddedFrom: string;
    dateAddedTo: string;
    dateUpdatedFrom: string;
    dateUpdatedTo: string;
}

export function VendorLabels() {
    const { userRecord } = useAuth();
    const toast = useToast();
    const { items, isLoading, markAsPrinted } = useInventory({
        consignorId: userRecord?.consignor_id || undefined,
        queryProfile: 'labels',
    });
    const { getCategoryNames } = useCategories();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [showPrintOptions, setShowPrintOptions] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [printMode, setPrintMode] = useState<PrintMode>('all');
    const [customQuantities, setCustomQuantities] = useState<PrintQuantityOverride>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAwaitingPrintConfirmation, setIsAwaitingPrintConfirmation] = useState(false);
    const [showDymoInfoModal, setShowDymoInfoModal] = useState(false);
    const [showDymoCompletePrompt, setShowDymoCompletePrompt] = useState(false);
    const [pendingPrintedItems, setPendingPrintedItems] = useState<Array<{ id: string; printedCount: number }>>([]);
    const [dymoWebAvailability, setDymoWebAvailability] = useState<DymoWebAvailability | null>(null);
    const [isCheckingDymoWeb, setIsCheckingDymoWeb] = useState(false);
    const [selectedDymoPrinter, setSelectedDymoPrinter] = useState('');

    // Filters (no consignor filter for vendors - they only see their own items)
    const [filters, setFilters] = useState<Filters>({
        category: '',
        printedStatus: 'all',
        dateAddedFrom: '',
        dateAddedTo: '',
        dateUpdatedFrom: '',
        dateUpdatedTo: '',
    });

    // Sorting
    const [sortField, setSortField] = useState<SortField>('updated_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const categories = getCategoryNames();

    // Apply filters and sorting
    const filteredAndSortedItems = useMemo(() => {
        let result = [...items];

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
        if (filters.category) count++;
        if (filters.printedStatus !== 'all') count++;
        if (filters.dateAddedFrom || filters.dateAddedTo) count++;
        if (filters.dateUpdatedFrom || filters.dateUpdatedTo) count++;
        return count;
    }, [filters]);

    const clearFilters = () => {
        setFilters({
            category: '',
            printedStatus: 'all',
            dateAddedFrom: '',
            dateAddedTo: '',
            dateUpdatedFrom: '',
            dateUpdatedTo: '',
        });
    };

    const toggleSelect = (
        id: string,
        options?: { shiftKey?: boolean; visibleIds?: string[] }
    ) => {
        const shiftKey = options?.shiftKey ?? false;
        const visibleIds = options?.visibleIds;

        setSelectedIds((prev) => {
            if (
                shiftKey &&
                lastSelectedId
            ) {
                const idsInOrder = visibleIds && visibleIds.length > 0
                    ? visibleIds
                    : filteredAndSortedItems.map((item) => item.id);
                const startIndex = idsInOrder.indexOf(lastSelectedId);
                const endIndex = idsInOrder.indexOf(id);

                if (startIndex !== -1 && endIndex !== -1) {
                    const rangeStart = Math.min(startIndex, endIndex);
                    const rangeEnd = Math.max(startIndex, endIndex);
                    const rangeIds = idsInOrder.slice(rangeStart, rangeEnd + 1);

                    const next = new Set(prev);
                    const shouldSelectRange = !prev.has(id);
                    rangeIds.forEach((rangeId) => {
                        if (shouldSelectRange) {
                            next.add(rangeId);
                        } else {
                            next.delete(rangeId);
                        }
                    });
                    return next;
                }
            }

            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
        setLastSelectedId(id);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredAndSortedItems.length) {
            setSelectedIds(new Set());
            setLastSelectedId(null);
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

    const getDymoPrintableItems = () => {
        return getItemsWithPrintQuantities().filter((item) => (item.printQuantity ?? 0) > 0);
    };

    const getDymoCompletionSummary = () => {
        const printable = getDymoPrintableItems();
        let totalQueued = 0;
        let unlabeledPortion = 0;

        for (const item of printable) {
            const printCount = item.printQuantity ?? 0;
            const unlabeled = item.qty_unlabeled || 0;
            totalQueued += printCount;
            unlabeledPortion += Math.min(printCount, unlabeled);
        }

        return {
            itemCount: printable.length,
            totalQueued,
            unlabeledPortion,
            extraBeyondUnlabeled: Math.max(0, totalQueued - unlabeledPortion),
        };
    };

    const handleGeneratePDF = async () => {
        setIsGenerating(true);
        try {
            const itemsWithQuantities = getItemsWithPrintQuantities();
            generateLabelsPDF(itemsWithQuantities);
            toast.success('Labels ready', 'Opened label PDF in a new tab.');
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            const message = error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.';
            toast.error('Unable to generate labels', message);
        }
        setIsGenerating(false);
    };

    const handleGenerateAndMark = async () => {
        setIsGenerating(true);
        try {
            const itemsWithQuantities = getItemsWithPrintQuantities();
            generateLabelsPDF(itemsWithQuantities);

            const printedItems = selectedItems.map((item) => ({
                id: item.id,
                printedCount: getPrintQuantity(item),
            })).filter((item) => item.printedCount > 0);

            setPendingPrintedItems(printedItems);
            setIsAwaitingPrintConfirmation(true);
            toast.info('Print generated', 'Confirm once labels finish printing to mark them as printed.');
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            const message = error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.';
            toast.error('Unable to generate labels', message);
        }
        setIsGenerating(false);
    };

    const handleOpenDymoFilesModal = () => {
        const itemsWithQuantities = getDymoPrintableItems();
        if (itemsWithQuantities.length === 0) {
            toast.warning('No labels queued', 'Set at least one print quantity before generating DYMO files.');
            return;
        }

        setShowDymoInfoModal(true);
        void refreshDymoWebAvailability();
    };

    const refreshDymoWebAvailability = async () => {
        setIsCheckingDymoWeb(true);
        try {
            const status = await checkDymoWebAvailability();
            setDymoWebAvailability(status);
            setSelectedDymoPrinter((current) => {
                if (!status.available || status.printers.length === 0) {
                    return '';
                }
                if (current && status.printers.includes(current)) {
                    return current;
                }
                return status.printers[0];
            });
        } finally {
            setIsCheckingDymoWeb(false);
        }
    };

    const handleRequestCloseDymoModal = () => {
        const summary = getDymoCompletionSummary();
        if (summary.totalQueued === 0) {
            setShowDymoInfoModal(false);
            return;
        }
        setShowDymoInfoModal(false);
        setShowDymoCompletePrompt(true);
    };

    const handleCloseWithoutMarkingDymo = () => {
        setShowDymoCompletePrompt(false);
        setShowDymoInfoModal(false);
    };

    const handleDownloadDymoTemplate = () => {
        const itemsWithQuantities = getDymoPrintableItems();
        if (itemsWithQuantities.length === 0) {
            toast.warning('No labels queued', 'Set at least one print quantity before generating DYMO files.');
            return;
        }

        try {
            downloadDymo30252TemplateForItems(itemsWithQuantities);
            toast.success('DYMO template downloaded', 'Next, download the print data CSV and import both in DYMO Connect.');
        } catch (error) {
            console.error('Failed to download DYMO template:', error);
            toast.error('Unable to generate DYMO template', 'Please try again.');
        }
    };

    const handleDownloadDymoPack = () => {
        const itemsWithQuantities = getDymoPrintableItems();
        if (itemsWithQuantities.length === 0) {
            toast.warning('No labels queued', 'Set at least one print quantity before generating DYMO files.');
            return;
        }

        try {
            const result = downloadDymo30252PrintPack(itemsWithQuantities);
            toast.success('DYMO files downloaded', `Template + print data exported for ${result.rowCount} label${result.rowCount === 1 ? '' : 's'}.`);
        } catch (error) {
            console.error('Failed to download DYMO print pack:', error);
            toast.error('Unable to generate DYMO files', 'Please try again.');
        }
    };

    const handleDirectDymoPrint = async () => {
        const printable = getDymoPrintableItems();
        if (printable.length === 0) {
            toast.warning('No labels queued', 'Set at least one print quantity before printing.');
            return;
        }

        setIsGenerating(true);
        try {
            const result = await printDymoLabelsDirect(printable, selectedDymoPrinter || undefined);
            setShowDymoInfoModal(false);
            setShowDymoCompletePrompt(true);
            toast.success(
                'Sent to DYMO printer',
                `${result.labelCount} label${result.labelCount === 1 ? '' : 's'} sent to "${result.printerName}".`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Direct DYMO printing is unavailable.';
            toast.error('Direct DYMO print failed', `${message} You can still use the file download flow below.`);
            void refreshDymoWebAvailability();
        }
        setIsGenerating(false);
    };

    const handleDownloadDymoCsv = () => {
        const itemsWithQuantities = getDymoPrintableItems();
        if (itemsWithQuantities.length === 0) {
            toast.warning('No labels queued', 'Set at least one print quantity before generating DYMO files.');
            return;
        }

        try {
            const result = downloadDymoPrintDataCsvFile(itemsWithQuantities);
            toast.success(
                'DYMO print data downloaded',
                `${result.rowCount} label row${result.rowCount === 1 ? '' : 's'} exported.`
            );
        } catch (error) {
            console.error('Failed to download DYMO print data:', error);
            toast.error('Unable to generate DYMO print data', 'Please try again.');
        }
    };

    const handleConfirmDymoCompleted = async () => {
        const printable = getDymoPrintableItems();
        const printedItems = printable
            .map((item) => ({ id: item.id, printedCount: item.printQuantity ?? 0 }))
            .filter((item) => item.printedCount > 0);

        if (printedItems.length === 0) {
            toast.warning('Nothing to confirm', 'No labels are queued to be marked as printed.');
            setShowDymoCompletePrompt(false);
            return;
        }

        const summary = getDymoCompletionSummary();

        setIsGenerating(true);
        try {
            await markAsPrinted(printedItems);
            setShowDymoCompletePrompt(false);
            setShowDymoInfoModal(false);
            setShowPrintOptions(false);
            setSelectedIds(new Set());
            setCustomQuantities({});
            setPendingPrintedItems([]);
            setIsAwaitingPrintConfirmation(false);
            toast.success(
                'Labels marked as printed',
                `${summary.unlabeledPortion} currently unlabeled label${summary.unlabeledPortion === 1 ? '' : 's'} were marked as printed.`
            );
        } catch (error) {
            console.error('Failed to mark DYMO labels as printed:', error);
            toast.error('Unable to mark labels as printed', 'Please try again.');
        }
        setIsGenerating(false);
    };

    const handleConfirmPrinted = async () => {
        if (pendingPrintedItems.length === 0) {
            toast.warning('Nothing to confirm', 'No labels are queued to be marked as printed.');
            return;
        }

        setIsGenerating(true);
        try {
            await markAsPrinted(pendingPrintedItems);
            setShowPrintOptions(false);
            setSelectedIds(new Set());
            setCustomQuantities({});
            setPendingPrintedItems([]);
            setIsAwaitingPrintConfirmation(false);
            toast.success('Labels marked as printed', 'Inventory unlabeled counts were updated.');
        } catch (error) {
            console.error('Failed to mark labels as printed:', error);
            toast.error('Unable to mark labels as printed', 'Please try again.');
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
        setPendingPrintedItems([]);
        setIsAwaitingPrintConfirmation(false);
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
            render: (item, meta) => (
                <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    readOnly
                    onClick={(event) => {
                        event.stopPropagation();
                        toggleSelect(item.id, {
                            shiftKey: event.shiftKey,
                            visibleIds: meta?.visibleKeys,
                        });
                    }}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
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
                    {item.variant_summary && (
                        <p className="text-xs text-[var(--color-muted)]">{item.variant_summary}</p>
                    )}
                </div>
            ),
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
                    <span className={allLabeled ? 'font-medium text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>
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
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setShowPrintOptions(false);
                            setPendingPrintedItems([]);
                            setIsAwaitingPrintConfirmation(false);
                        }}
                    >
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
                                    disabled={isAwaitingPrintConfirmation}
                                    className="mt-1 accent-[var(--color-primary)]"
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
                                    disabled={isAwaitingPrintConfirmation}
                                    className="mt-1 accent-[var(--color-primary)]"
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
                                    disabled={isAwaitingPrintConfirmation}
                                    className="mt-1 accent-[var(--color-primary)]"
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

                            {/* Apply to All */}
                            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--color-border)]">
                                <label className="text-sm text-[var(--color-muted)]">Apply to all:</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="Qty"
                                    id="applyToAllInput"
                                    className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={isAwaitingPrintConfirmation}
                                    onClick={() => {
                                        const input = document.getElementById('applyToAllInput') as HTMLInputElement;
                                        const value = Math.max(0, parseInt(input.value) || 0);
                                        if (value >= 0) {
                                            const newQuantities: PrintQuantityOverride = {};
                                            selectedItems.forEach((item) => {
                                                newQuantities[item.id] = value;
                                            });
                                            setCustomQuantities(newQuantities);
                                            input.value = '';
                                        }
                                    }}
                                >
                                    Apply
                                </Button>
                            </div>

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
                                            disabled={isAwaitingPrintConfirmation}
                                            onChange={(e) => setCustomQuantities((prev) => ({
                                                ...prev,
                                                [item.id]: Math.max(0, parseInt(e.target.value) || 0),
                                            }))}
                                            className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <p className="text-[var(--color-foreground)]">
                            <strong>{getTotalLabels()}</strong> labels will be generated across{' '}
                            <strong>{Math.ceil(getTotalLabels() / 30)}</strong> sheet(s)
                        </p>
                    </div>
                    {isAwaitingPrintConfirmation && (
                        <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                            <p className="text-sm text-[var(--color-warning)]">
                                PDF generated. After you finish printing from the PDF tab, click
                                {' '}<strong>Confirm Printed &amp; Mark</strong>.
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowPrintOptions(false);
                                setPendingPrintedItems([]);
                                setIsAwaitingPrintConfirmation(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleGeneratePDF}
                            disabled={getTotalLabels() === 0 || isGenerating}
                        >
                            {isGenerating ? 'Generating...' : (isAwaitingPrintConfirmation ? 'Re-open PDF' : 'Preview PDF')}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleOpenDymoFilesModal}
                            disabled={getTotalLabels() === 0 || isGenerating}
                        >
                            Download DYMO Files
                            <span
                                role="button"
                                tabIndex={0}
                                aria-label="DYMO help"
                                title="How to use DYMO files"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleOpenDymoFilesModal();
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleOpenDymoFilesModal();
                                    }
                                }}
                                className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none"
                            >
                                i
                            </span>
                        </Button>
                        <Button
                            onClick={isAwaitingPrintConfirmation ? handleConfirmPrinted : handleGenerateAndMark}
                            disabled={getTotalLabels() === 0 || isGenerating}
                        >
                            <PrintIcon />
                            {isGenerating ? 'Processing...' : (isAwaitingPrintConfirmation ? 'Confirm Printed & Mark' : 'Generate PDF Then Confirm')}
                        </Button>
                    </div>
                </div>
                <DymoInfoModal
                    isOpen={showDymoInfoModal}
                    onClose={handleRequestCloseDymoModal}
                    onRefreshAvailability={refreshDymoWebAvailability}
                    onDirectPrint={handleDirectDymoPrint}
                    dymoWebAvailability={dymoWebAvailability}
                    isCheckingDymoWeb={isCheckingDymoWeb}
                    isBusy={isGenerating}
                    selectedPrinter={selectedDymoPrinter}
                    onSelectPrinter={setSelectedDymoPrinter}
                    onDownloadPack={handleDownloadDymoPack}
                    onDownloadTemplate={handleDownloadDymoTemplate}
                    onDownloadCsv={handleDownloadDymoCsv}
                />
                <DymoCompletePromptModal
                    isOpen={showDymoCompletePrompt}
                    onClose={handleCloseWithoutMarkingDymo}
                    onConfirm={handleConfirmDymoCompleted}
                    itemCount={getDymoCompletionSummary().itemCount}
                    totalQueued={getDymoCompletionSummary().totalQueued}
                    unlabeledPortion={getDymoCompletionSummary().unlabeledPortion}
                    extraBeyondUnlabeled={getDymoCompletionSummary().extraBeyondUnlabeled}
                    isBusy={isGenerating}
                />
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
                                    <span className="ml-1 rounded-full bg-[var(--color-background)]/40 px-1.5 py-0.5 text-xs">
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
                                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Category Filter */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Category</label>
                                    <select
                                        value={filters.category}
                                        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
                                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
                                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Added To</label>
                                    <input
                                        type="date"
                                        value={filters.dateAddedTo}
                                        onChange={(e) => setFilters({ ...filters, dateAddedTo: e.target.value })}
                                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>

                                {/* Spacer for alignment */}
                                <div></div>

                                {/* Date Updated Range */}
                                <div>
                                    <label className="block text-sm font-medium mb-1">Updated From</label>
                                    <input
                                        type="date"
                                        value={filters.dateUpdatedFrom}
                                        onChange={(e) => setFilters({ ...filters, dateUpdatedFrom: e.target.value })}
                                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Updated To</label>
                                    <input
                                        type="date"
                                        value={filters.dateUpdatedTo}
                                        onChange={(e) => setFilters({ ...filters, dateUpdatedTo: e.target.value })}
                                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
                                setLastSelectedId(null);
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
                        virtualized
                        virtualRowHeight={64}
                        virtualViewportHeight={680}
                        onRowClick={(item, event, meta) => toggleSelect(item.id, {
                            shiftKey: event.shiftKey,
                            visibleIds: meta.visibleKeys,
                        })}
                        isLoading={isLoading && items.length === 0}
                    />

                    {/* Sticky Footer */}
                    {selectedIds.size > 0 && (
                        <div className="fixed bottom-0 left-0 right-0 lg:left-64 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 shadow-lg">
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

function DymoInfoModal({
    isOpen,
    onClose,
    onRefreshAvailability,
    onDirectPrint,
    dymoWebAvailability,
    isCheckingDymoWeb,
    isBusy,
    selectedPrinter,
    onSelectPrinter,
    onDownloadPack,
    onDownloadTemplate,
    onDownloadCsv,
}: {
    isOpen: boolean;
    onClose: () => void;
    onRefreshAvailability: () => Promise<void>;
    onDirectPrint: () => Promise<void>;
    dymoWebAvailability: DymoWebAvailability | null;
    isCheckingDymoWeb: boolean;
    isBusy: boolean;
    selectedPrinter: string;
    onSelectPrinter: (value: string) => void;
    onDownloadPack: () => void;
    onDownloadTemplate: () => void;
    onDownloadCsv: () => void;
}) {
    const hasPrinters = (dymoWebAvailability?.printers.length ?? 0) > 0;
    const canDirectPrint = Boolean(dymoWebAvailability?.available && hasPrinters && !isBusy);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="DYMO Printing"
            description="Use one-click direct print when available, or export files as fallback."
            size="lg"
        >
            <div className="space-y-3 text-sm text-[var(--color-foreground)]">
                <p><strong>Direct print status</strong></p>
                {isCheckingDymoWeb ? (
                    <p>Checking DYMO Web Service...</p>
                ) : dymoWebAvailability?.available ? (
                    <p>
                        Ready. Found {dymoWebAvailability.printers.length} DYMO printer{dymoWebAvailability.printers.length === 1 ? '' : 's'}:
                        {' '}
                        <strong>{dymoWebAvailability.printers.join(', ')}</strong>
                    </p>
                ) : (
                    <p>
                        Direct print not ready.
                        {dymoWebAvailability?.reason ? ` ${dymoWebAvailability.reason}` : ''}
                    </p>
                )}
                {dymoWebAvailability?.available && hasPrinters && (
                    <div className="space-y-1">
                        <label className="block font-medium" htmlFor="dymo-printer-select">DYMO Printer</label>
                        <select
                            id="dymo-printer-select"
                            value={selectedPrinter}
                            onChange={(event) => onSelectPrinter(event.target.value)}
                            disabled={isBusy || isCheckingDymoWeb}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        >
                            {dymoWebAvailability.printers.map((printerName) => (
                                <option key={printerName} value={printerName}>
                                    {printerName}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <p><strong>Fallback export files</strong></p>
                <p><code>ravenpos-30252-template.label</code> is your visual label layout.</p>
                <p><code>ravenpos-30252-print-data.csv</code> contains one row per label, expanded by print quantity.</p>
                <p><strong>Fallback steps (if direct print is unavailable)</strong></p>
                <p>1. Download the DYMO pack (or template + CSV separately).</p>
                <p>2. Open DYMO Connect and load the <code>.label</code> template.</p>
                <p>3. Import/link the CSV as data source and map fields: <code>VENDOR</code>, <code>PRICE</code>, <code>NAME</code>, <code>VARIANT</code>, <code>SKU</code>, <code>DETAILS</code>, <code>BARCODE</code>.</p>
                <p>4. Print all records to output the full quantity.</p>
            </div>
            <ModalFooter className="justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={onDirectPrint} disabled={!canDirectPrint}>
                        {isBusy ? 'Printing...' : 'Direct Print Now'}
                    </Button>
                    <Button variant="secondary" onClick={() => void onRefreshAvailability()} disabled={isCheckingDymoWeb || isBusy}>
                        {isCheckingDymoWeb ? 'Checking...' : 'Re-check DYMO'}
                    </Button>
                    <Button variant="secondary" onClick={onDownloadPack} disabled={isBusy}>
                        Download DYMO Pack
                    </Button>
                    <Button variant="secondary" onClick={onDownloadTemplate}>
                        Download Template (.label)
                    </Button>
                    <Button variant="secondary" onClick={onDownloadCsv}>
                        Download Print Data (.csv)
                    </Button>
                </div>
                <Button onClick={onClose}>Close</Button>
            </ModalFooter>
        </Modal>
    );
}

function DymoCompletePromptModal({
    isOpen,
    onClose,
    onConfirm,
    itemCount,
    totalQueued,
    unlabeledPortion,
    extraBeyondUnlabeled,
    isBusy,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    itemCount: number;
    totalQueued: number;
    unlabeledPortion: number;
    extraBeyondUnlabeled: number;
    isBusy: boolean;
}) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Mark DYMO Labels As Printed?"
            description="Closing the DYMO help modal can also finalize inventory label counts."
            size="md"
        >
            <div className="space-y-3 text-sm text-[var(--color-foreground)]">
                <p>
                    You have <strong>{totalQueued}</strong> total label{totalQueued === 1 ? '' : 's'} queued across{' '}
                    <strong>{itemCount}</strong> selected item{itemCount === 1 ? '' : 's'}.
                </p>
                <p>
                    This will mark <strong>{unlabeledPortion}</strong> currently unlabeled label{unlabeledPortion === 1 ? '' : 's'} as printed.
                </p>
                {extraBeyondUnlabeled > 0 && (
                    <p className="text-[var(--color-muted)]">
                        {extraBeyondUnlabeled} queued label{extraBeyondUnlabeled === 1 ? '' : 's'} exceed current unlabeled counts and won&apos;t further reduce unlabeled inventory.
                    </p>
                )}
            </div>
            <ModalFooter>
                <Button variant="secondary" onClick={onClose} disabled={isBusy}>
                    Close Without Marking
                </Button>
                <Button onClick={onConfirm} disabled={isBusy}>
                    {isBusy ? 'Marking...' : 'Yes, Mark Completed'}
                </Button>
            </ModalFooter>
        </Modal>
    );
}
