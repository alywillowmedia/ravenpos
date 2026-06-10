import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Input } from '../components/ui/Input';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState, PackageIcon } from '../components/ui/EmptyState';
import { ItemForm } from '../components/inventory/ItemForm';
import { BulkEditToolbar } from '../components/inventory/BulkEditToolbar';
import { BulkEditTable } from '../components/inventory/BulkEditTable';
import { ChangeSummaryModal } from '../components/inventory/ChangeSummaryModal';
import { InventoryDiscountsTab } from '../components/inventory/InventoryDiscountsTab';
import { useAuth } from '../contexts/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { useConsignors } from '../hooks/useConsignors';
import { useCategories } from '../hooks/useCategories';
import { useBulkEdit } from '../hooks/useBulkEdit';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../lib/utils';
import { getAppliedCompareAtPrice } from '../lib/itemPricing';
import type { Item, ItemInput } from '../types';

function formatAddedDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function Inventory() {
    const navigate = useNavigate();
    const { userRecord } = useAuth();
    const [view, setView] = useState<'products' | 'discounts'>('products');
    const [inventoryPage, setInventoryPage] = useState(1);
    const [inventoryPageSize, setInventoryPageSize] = useState(50);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [filterConsignor, setFilterConsignor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [inventorySummary, setInventorySummary] = useState({
        totalItems: 0,
        totalQuantity: 0,
        totalValue: 0,
    });
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

    const { items, totalCount, isLoading, updateItem, updateItems, deleteItem, fetchMatchingItems, fetchMatchingSummary } = useInventory({
        paginated: true,
        page: inventoryPage,
        pageSize: inventoryPageSize,
        searchQuery: debouncedSearchQuery,
        consignorId: filterConsignor || undefined,
        category: filterCategory || undefined,
    });
    const {
        items: discountTabItems,
    } = useInventory({
        autoFetch: view === 'discounts',
        queryProfile: 'labels',
    });

    const toast = useToast();
    const { consignors } = useConsignors();
    const { getCategoryNames } = useCategories();
    const activeConsignors = useMemo(
        () => consignors.filter((consignor) => consignor.is_active),
        [consignors]
    );

    const [editItem, setEditItem] = useState<Item | null>(null);
    const [isEditItemDirty, setIsEditItemDirty] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Bulk edit state
    const bulkEdit = useBulkEdit();
    const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
    const [showChangeSummary, setShowChangeSummary] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferTargetConsignor, setTransferTargetConsignor] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [isSelectingAll, setIsSelectingAll] = useState(false);
    const [bulkItemCache, setBulkItemCache] = useState<Map<string, Item>>(new Map());

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 250);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        setInventoryPage(1);
    }, [debouncedSearchQuery, filterConsignor, filterCategory, inventoryPageSize]);

    useEffect(() => {
        if (view !== 'products') return;

        let isCurrent = true;
        setIsSummaryLoading(true);

        fetchMatchingSummary({
            consignorId: filterConsignor || undefined,
            category: filterCategory || undefined,
            searchQuery: debouncedSearchQuery,
        })
            .then((summary) => {
                if (isCurrent) setInventorySummary(summary);
            })
            .catch((error) => {
                console.error('Failed to load inventory summary:', error);
                if (isCurrent) {
                    setInventorySummary({ totalItems: 0, totalQuantity: 0, totalValue: 0 });
                }
            })
            .finally(() => {
                if (isCurrent) setIsSummaryLoading(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [debouncedSearchQuery, fetchMatchingSummary, filterCategory, filterConsignor, summaryRefreshKey, view]);

    const handleUpdate = async (data: Partial<Item>) => {
        if (!editItem) return { error: 'No item' };
        const result = await updateItem(editItem.id, data);
        if (!result.error) {
            setEditItem(null);
            setIsEditItemDirty(false);
            setSummaryRefreshKey((key) => key + 1);
        }
        return result;
    };

    const openEditItemModal = (item: Item) => {
        setIsEditItemDirty(false);
        setEditItem(item);
    };

    const closeEditItemModal = () => {
        if (isEditItemDirty && !window.confirm('Close this form and discard unsaved changes?')) {
            return;
        }
        setEditItem(null);
        setIsEditItemDirty(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const result = await deleteItem(deleteTarget.id);
        setIsDeleting(false);
        setDeleteTarget(null);
        if (!result.error) {
            setSummaryRefreshKey((key) => key + 1);
        }
    };

    const filteredItems = items;

    useEffect(() => {
        setBulkItemCache((prev) => {
            const next = new Map(prev);
            items.forEach((item) => next.set(item.id, item));
            return next;
        });
    }, [items]);

    // Get selected items for bulk edit
    const selectedItems = useMemo(() => {
        const selected: Item[] = [];
        bulkEdit.selectedIds.forEach((id) => {
            const item = bulkItemCache.get(id);
            if (item) selected.push(item);
        });
        return selected;
    }, [bulkEdit.selectedIds, bulkItemCache]);

    const consignorOptions = [
        { value: '', label: 'All Consignors' },
        ...activeConsignors.map((c) => ({ value: c.id, label: `${c.consignor_number} - ${c.name}` })),
    ];

    const categoryOptions = [
        { value: '', label: 'All Categories' },
        ...getCategoryNames().map((name) => ({ value: name, label: name })),
    ];
    const filteredItemIds = useMemo(
        () => filteredItems.map((item) => item.id),
        [filteredItems]
    );
    const totalPages = Math.max(1, Math.ceil(totalCount / inventoryPageSize));

    // Bulk edit handlers
    const handleSelectAll = useCallback(async () => {
        setIsSelectingAll(true);
        try {
            const matchingItems = await fetchMatchingItems({
                consignorId: filterConsignor || undefined,
                category: filterCategory || undefined,
                searchQuery: debouncedSearchQuery,
            });
            setBulkItemCache((prev) => {
                const next = new Map(prev);
                matchingItems.forEach((item) => next.set(item.id, item));
                return next;
            });
            bulkEdit.selectAll(matchingItems.map((item) => item.id));
            toast.success(
                'Products selected',
                `${matchingItems.length} product${matchingItems.length === 1 ? '' : 's'} selected from the current filters.`
            );
        } catch (error) {
            console.error('Failed to select all matching products:', error);
            toast.error('Unable to select all products', 'Please try again.');
        } finally {
            setIsSelectingAll(false);
        }
    }, [bulkEdit, debouncedSearchQuery, fetchMatchingItems, filterCategory, filterConsignor, toast]);

    const handleEditSelected = useCallback(() => {
        setIsSpreadsheetOpen(true);
    }, []);

    const handleOpenTransfer = useCallback(() => {
        if (bulkEdit.selectedCount === 0) return;
        setTransferTargetConsignor('');
        setShowTransferModal(true);
    }, [bulkEdit.selectedCount]);

    const handleConfirmTransfer = useCallback(async () => {
        if (!transferTargetConsignor) {
            toast.error('Select a vendor', 'Choose the destination vendor before transferring.');
            return;
        }

        const updates = selectedItems
            .filter((item) => item.consignor_id !== transferTargetConsignor)
            .map((item) => ({
                id: item.id,
                changes: { consignor_id: transferTargetConsignor } as Partial<ItemInput>,
            }));

        if (updates.length === 0) {
            toast.error('No eligible products', 'Selected products are already assigned to that vendor.');
            return;
        }

        setIsTransferring(true);
        const result = await updateItems(updates);
        setIsTransferring(false);

        if (result.success) {
            const target = activeConsignors.find((c) => c.id === transferTargetConsignor);
            const targetLabel = target ? `${target.consignor_number} - ${target.name}` : 'selected vendor';
            setShowTransferModal(false);
            setTransferTargetConsignor('');
            bulkEdit.clearChanges();
            bulkEdit.deselectAll();
            setSummaryRefreshKey((key) => key + 1);
            toast.success(
                'Products transferred',
                `${updates.length} product${updates.length === 1 ? '' : 's'} moved to ${targetLabel}.`
            );
        } else {
            toast.error('Some transfers failed', result.errors.slice(0, 2).join(' • '));
        }
    }, [activeConsignors, bulkEdit, selectedItems, toast, transferTargetConsignor, updateItems]);

    const handleSaveChanges = useCallback(() => {
        setShowChangeSummary(true);
    }, []);

    const handleConfirmChanges = useCallback(async () => {
        setIsSaving(true);
        const updates = bulkEdit.prepareUpdates();
        const result = await updateItems(updates);
        setIsSaving(false);

        if (result.success) {
            setShowChangeSummary(false);
            setIsSpreadsheetOpen(false);
            bulkEdit.clearChanges();
            bulkEdit.deselectAll();
            bulkEdit.toggleBulkEditMode();
            setSummaryRefreshKey((key) => key + 1);
            toast.success('Bulk changes saved', `${updates.length} product update${updates.length === 1 ? '' : 's'} applied.`);
        } else {
            console.error('Bulk update errors:', result.errors);
            toast.error('Some updates failed', result.errors.slice(0, 2).join(' • '));
        }
    }, [bulkEdit, toast, updateItems]);

    const handleCancelBulkEdit = useCallback(() => {
        if (bulkEdit.hasChanges) {
            setShowExitConfirm(true);
        } else {
            setIsSpreadsheetOpen(false);
            bulkEdit.deselectAll();
            bulkEdit.toggleBulkEditMode();
        }
    }, [bulkEdit]);

    const handleConfirmExit = useCallback(() => {
        setShowExitConfirm(false);
        setIsSpreadsheetOpen(false);
        bulkEdit.clearChanges();
        bulkEdit.deselectAll();
        bulkEdit.toggleBulkEditMode();
    }, [bulkEdit]);

    const handleEscapePressed = useCallback(() => {
        if (bulkEdit.hasChanges) {
            setShowExitConfirm(true);
        } else {
            setIsSpreadsheetOpen(false);
        }
    }, [bulkEdit.hasChanges]);

    const handleStageChange = useCallback((
        itemId: string,
        field: keyof ItemInput,
        newValue: unknown,
        originalValue: unknown
    ) => {
        bulkEdit.stageChange(itemId, field, newValue, originalValue);
    }, [bulkEdit]);

    // Table columns with checkbox when bulk edit is active
    const columns: Column<Item>[] = useMemo(() => {
        const baseColumns: Column<Item>[] = [];

        // Add checkbox column when bulk edit is active
        if (bulkEdit.isActive) {
            baseColumns.push({
                key: 'select',
                header: '',
                width: '48px',
                render: (item) => (
                    <div className="flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={bulkEdit.isSelected(item.id)}
                            onChange={(e) => bulkEdit.toggleSelection(item.id, {
                                shiftKey: (e.nativeEvent as MouseEvent).shiftKey,
                                visibleIds: filteredItemIds,
                            })}
                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                ),
            });
        }

        return [
            ...baseColumns,
            {
                key: 'sku',
                header: 'SKU',
                width: '140px',
                minWidth: '140px',
                sortable: true,
                render: (item) => (
                    <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                        {item.sku}
                    </span>
                ),
            },
            {
                key: 'name',
                header: 'Product',
                minWidth: '220px',
                sortable: true,
                render: (item) => (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--color-surface)] flex-shrink-0 flex items-center justify-center border border-[var(--color-border)]">
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
                        <div>
                            <p className="font-medium text-[var(--color-foreground)]">{item.name}</p>
                            {item.variant_summary && (
                                <p className="text-xs text-[var(--color-muted)]">{item.variant_summary}</p>
                            )}
                        </div>
                    </div>
                ),
            },
            {
                key: 'consignor',
                header: 'Consignor',
                width: '100px',
                minWidth: '100px',
                render: (item) => {
                    const c = item.consignor;
                    return c ? (
                        <span className="text-sm">
                            {(c as { consignor_number: string }).consignor_number}
                        </span>
                    ) : '—';
                },
            },
            {
                key: 'category',
                header: 'Category',
                width: '110px',
                minWidth: '110px',
                sortable: true,
            },
            {
                key: 'created_at',
                header: 'Added',
                width: '120px',
                minWidth: '120px',
                sortable: true,
                render: (item) => (
                    <span className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                        {formatAddedDate(item.created_at)}
                    </span>
                ),
            },
            {
                key: 'quantity',
                header: 'Units',
                width: '72px',
                minWidth: '72px',
                sortable: true,
                render: (item) => (
                    <Badge variant={item.quantity > 0 ? 'default' : 'danger'}>
                        {item.quantity}
                    </Badge>
                ),
            },
            {
                key: 'price',
                header: 'Price',
                width: '96px',
                minWidth: '96px',
                sortable: true,
                render: (item) => (
                    <div className="flex flex-col">
                        {getAppliedCompareAtPrice(item) !== null && (
                            <span className="text-xs text-[var(--color-muted)] line-through">
                                {formatCurrency(getAppliedCompareAtPrice(item)!)}
                            </span>
                        )}
                        <span className="font-medium">{formatCurrency(Number(item.price))}</span>
                    </div>
                ),
            },
            {
                key: 'actions',
                header: '',
                width: '88px',
                minWidth: '88px',
                render: (item) => (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openEditItemModal(item);
                            }}
                            className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                            title="Edit"
                        >
                            <EditIcon />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(item);
                            }}
                            className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                            title="Delete"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                ),
            },
        ];
    }, [bulkEdit, filteredItemIds]);

    const viewTabs = [
        { id: 'products', label: 'Products' },
        { id: 'discounts', label: 'Discounts' },
    ];

    return (
        <div className="animate-fadeIn">
            <Header
                title={view === 'products' ? 'Inventory' : 'Inventory Discounts'}
                description={view === 'products' ? `${totalCount} products in stock` : 'Create and manage automatic catalog discounts'}
                actions={
                    <div className="flex items-center gap-3">
                        {view === 'products' && !bulkEdit.isActive ? (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => bulkEdit.toggleBulkEditMode()}
                                    disabled={filteredItems.length === 0}
                                >
                                    <BulkEditIcon />
                                    Bulk Edit
                                </Button>
                                <Button variant="secondary" onClick={() => navigate('/admin/import')}>
                                    Import CSV
                                </Button>
                                <Button onClick={() => navigate('/admin/add-items')}>
                                    <PlusIcon />
                                    Add Products
                                </Button>
                            </>
                        ) : view === 'products' ? (
                            <Button variant="ghost" onClick={handleCancelBulkEdit}>
                                Exit Bulk Edit
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <Tabs
                    tabs={viewTabs}
                    activeTab={view}
                    onChange={(id) => {
                        if (id === 'products' || id === 'discounts') {
                            setView(id);
                        }
                    }}
                    size="sm"
                    className="w-full max-w-[260px] shrink-0 bg-[var(--color-card)]"
                />

                {view === 'products' && (
                    <div className="flex w-full flex-wrap items-center gap-2 xl:justify-end">
                        <div className="min-w-[240px] flex-1 xl:max-w-sm">
                            <Input
                                type="search"
                                placeholder="Search products..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                inputSize="sm"
                                className="rounded-full bg-[var(--color-card)]"
                            />
                        </div>
                        <div className="w-[190px]">
                            <Select
                                options={consignorOptions}
                                value={filterConsignor}
                                onChange={(e) => setFilterConsignor(e.target.value)}
                                selectSize="sm"
                                className="rounded-full bg-[var(--color-card)]"
                            />
                        </div>
                        <div className="w-[160px]">
                            <Select
                                options={categoryOptions}
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                selectSize="sm"
                                className="rounded-full bg-[var(--color-card)]"
                            />
                        </div>
                        {(filterConsignor || filterCategory || searchQuery) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setFilterConsignor('');
                                    setFilterCategory('');
                                    setSearchQuery('');
                                    setDebouncedSearchQuery('');
                                    setInventoryPage(1);
                                }}
                                className="rounded-full"
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {view === 'products' && (
                <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm">
                    <span className="font-medium text-[var(--color-foreground)]">
                        {inventorySummary.totalItems.toLocaleString()} product{inventorySummary.totalItems === 1 ? '' : 's'}
                    </span>
                    <span className="text-[var(--color-muted)]">
                        {inventorySummary.totalQuantity.toLocaleString()} unit{inventorySummary.totalQuantity === 1 ? '' : 's'}
                    </span>
                    <span className="font-medium text-[var(--color-primary)]">
                        {formatCurrency(inventorySummary.totalValue)} value
                    </span>
                    {isSummaryLoading && (
                        <span className="text-xs text-[var(--color-muted)]">Updating...</span>
                    )}
                </div>
            )}

            {view === 'discounts' ? (
                <InventoryDiscountsTab
                    mode="admin"
                    userId={userRecord?.id || null}
                    items={discountTabItems}
                    categories={getCategoryNames()}
                    consignors={activeConsignors}
                />
            ) : (
                <>
                {/* Spreadsheet editor when active */}
                {isSpreadsheetOpen && selectedItems.length > 0 ? (
                    <BulkEditTable
                        items={selectedItems}
                        categories={getCategoryNames()}
                        stagedChanges={bulkEdit.getAllStagedChanges()}
                        onStageChange={handleStageChange}
                        onEscapePressed={handleEscapePressed}
                    />
                ) : items.length === 0 && !isLoading ? (
                    <EmptyState
                        icon={<PackageIcon />}
                        title="No inventory yet"
                        description="Add products to your inventory to get started."
                        action={
                            <Button onClick={() => navigate('/admin/add-items')}>
                                <PlusIcon />
                                Add Products
                            </Button>
                        }
                    />
                ) : (
                    <Table
                        data={filteredItems}
                        columns={columns}
                        keyExtractor={(item) => item.id}
                        isLoading={isLoading}
                        emptyMessage="No products match your filters"
                    />
                )}

                {!isSpreadsheetOpen && totalCount > 0 && (
                    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="text-xs text-[var(--color-muted)]">
                            Showing {(inventoryPage - 1) * inventoryPageSize + 1}-{Math.min(inventoryPage * inventoryPageSize, totalCount)} of {totalCount}
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-xs text-[var(--color-muted)] flex items-center gap-2">
                                Rows
                                <select
                                    value={inventoryPageSize}
                                    onChange={(e) => setInventoryPageSize(Number(e.target.value))}
                                    className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-xs"
                                >
                                {[25, 50, 100, 200].map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                            </label>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setInventoryPage((prev) => Math.max(1, prev - 1))}
                                    disabled={inventoryPage === 1}
                                >
                                    Previous
                                </Button>
                                <span className="text-xs text-[var(--color-muted)] min-w-[100px] text-center">
                                    Page {inventoryPage} of {totalPages}
                                </span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setInventoryPage((prev) => Math.min(totalPages, prev + 1))}
                                    disabled={inventoryPage === totalPages}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </>
            )}

            {/* Bulk edit toolbar */}
            {view === 'products' && bulkEdit.isActive && (
                <BulkEditToolbar
                    selectedCount={bulkEdit.selectedCount}
                    totalCount={totalCount}
                    hasChanges={bulkEdit.hasChanges}
                    isEditing={isSpreadsheetOpen}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={bulkEdit.deselectAll}
                    onEditSelected={handleEditSelected}
                    onTransferSelected={handleOpenTransfer}
                    onSaveChanges={handleSaveChanges}
                    onCancel={handleCancelBulkEdit}
                    isSaving={isSaving}
                    isSelectingAll={isSelectingAll}
                />
            )}

            {/* Change summary modal */}
            <ChangeSummaryModal
                isOpen={view === 'products' && showChangeSummary}
                onClose={() => setShowChangeSummary(false)}
                onConfirm={handleConfirmChanges}
                changeSummary={bulkEdit.getChangeSummary()}
                items={selectedItems}
                isLoading={isSaving}
            />

            {/* Exit confirmation modal */}
            <Modal
                isOpen={view === 'products' && showExitConfirm}
                onClose={() => setShowExitConfirm(false)}
                title="Discard Changes?"
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    You have unsaved changes. Are you sure you want to exit bulk edit mode?
                    All pending changes will be lost.
                </p>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>
                        Keep Editing
                    </Button>
                    <Button variant="danger" onClick={handleConfirmExit}>
                        Discard Changes
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Transfer modal */}
            <Modal
                isOpen={view === 'products' && showTransferModal}
                onClose={() => {
                    setShowTransferModal(false);
                    setTransferTargetConsignor('');
                }}
                title={`Transfer ${selectedItems.length} Product${selectedItems.length === 1 ? '' : 's'}`}
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-[var(--color-muted)]">
                        Move selected products to a different vendor.
                    </p>
                    <Select
                        label="Destination Vendor"
                        options={[
                            { value: '', label: 'Select vendor...' },
                            ...activeConsignors.map((c) => ({
                                value: c.id,
                                label: `${c.consignor_number} - ${c.name}`,
                            })),
                        ]}
                        value={transferTargetConsignor}
                        onChange={(e) => setTransferTargetConsignor(e.target.value)}
                    />
                </div>
                <ModalFooter>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setShowTransferModal(false);
                            setTransferTargetConsignor('');
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirmTransfer}
                        isLoading={isTransferring}
                        disabled={!transferTargetConsignor}
                    >
                        Transfer Products
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={view === 'products' && !!editItem}
                onClose={closeEditItemModal}
                title="Edit Product"
                size="4xl"
                closeOnOverlayClick={false}
                closeOnEscape={false}
                showCloseButton
            >
                {editItem && (
                    <div onChangeCapture={() => setIsEditItemDirty(true)}>
                        <ItemForm
                            item={editItem}
                            consignors={activeConsignors}
                            categories={getCategoryNames()}
                            onSubmit={handleUpdate}
                            onCancel={closeEditItemModal}
                        />
                    </div>
                )}
            </Modal>

            {/* Delete Confirmation */}
            <Modal
                isOpen={view === 'products' && !!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Product"
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
                </p>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={handleDelete} isLoading={isDeleting}>
                        Delete
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

function PlusIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function EditIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
    );
}

function ImagePlaceholderIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
    );
}

function BulkEditIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
            <path d="M9 3v18" />
        </svg>
    );
}
