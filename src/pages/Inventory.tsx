import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { EmptyState, PackageIcon } from '../components/ui/EmptyState';
import { ItemForm } from '../components/inventory/ItemForm';
import { BulkEditToolbar } from '../components/inventory/BulkEditToolbar';
import { BulkEditTable } from '../components/inventory/BulkEditTable';
import { ChangeSummaryModal } from '../components/inventory/ChangeSummaryModal';
import { useInventory } from '../hooks/useInventory';
import { useConsignors } from '../hooks/useConsignors';
import { useCategories } from '../hooks/useCategories';
import { useBulkEdit } from '../hooks/useBulkEdit';
import { formatCurrency } from '../lib/utils';
import type { Item, ItemInput } from '../types';

export function Inventory() {
    const navigate = useNavigate();
    const { items, isLoading, updateItem, updateItems, deleteItem } = useInventory();
    const { consignors } = useConsignors();
    const { getCategoryNames } = useCategories();

    const [editItem, setEditItem] = useState<Item | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filterConsignor, setFilterConsignor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    // Bulk edit state
    const bulkEdit = useBulkEdit();
    const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
    const [showChangeSummary, setShowChangeSummary] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);

    const handleUpdate = async (data: Partial<Item>) => {
        if (!editItem) return { error: 'No item' };
        const result = await updateItem(editItem.id, data);
        if (!result.error) {
            setEditItem(null);
        }
        return result;
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deleteItem(deleteTarget.id);
        setIsDeleting(false);
        setDeleteTarget(null);
    };

    // Filter items
    const filteredItems = useMemo(() =>
        items.filter((item) => {
            if (filterConsignor && item.consignor_id !== filterConsignor) return false;
            if (filterCategory && item.category !== filterCategory) return false;
            return true;
        }),
        [items, filterConsignor, filterCategory]
    );

    // Get selected items for bulk edit
    const selectedItems = useMemo(() =>
        filteredItems.filter((item) => bulkEdit.selectedIds.has(item.id)),
        [filteredItems, bulkEdit.selectedIds]
    );

    const consignorOptions = [
        { value: '', label: 'All Consignors' },
        ...consignors.map((c) => ({ value: c.id, label: `${c.consignor_number} - ${c.name}` })),
    ];

    const categoryOptions = [
        { value: '', label: 'All Categories' },
        ...getCategoryNames().map((name) => ({ value: name, label: name })),
    ];

    // Bulk edit handlers
    const handleSelectAll = useCallback(() => {
        bulkEdit.selectAll(filteredItems.map((item) => item.id));
    }, [bulkEdit, filteredItems]);

    const handleEditSelected = useCallback(() => {
        setIsSpreadsheetOpen(true);
    }, []);

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
        } else {
            // Show errors (could improve with toast notifications)
            console.error('Bulk update errors:', result.errors);
            alert(`Some updates failed:\n${result.errors.join('\n')}`);
        }
    }, [bulkEdit, items, updateItems]);

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
                            onChange={() => bulkEdit.toggleSelection(item.id)}
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
                width: '160px',
                sortable: true,
                render: (item) => (
                    <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                        {item.sku}
                    </span>
                ),
            },
            {
                key: 'name',
                header: 'Item',
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
                            {item.variant && (
                                <p className="text-xs text-[var(--color-muted)]">{item.variant}</p>
                            )}
                        </div>
                    </div>
                ),
            },
            {
                key: 'consignor',
                header: 'Consignor',
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
                width: '120px',
                sortable: true,
            },
            {
                key: 'quantity',
                header: 'Qty',
                width: '80px',
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
                width: '100px',
                sortable: true,
                render: (item) => (
                    <span className="font-medium">{formatCurrency(Number(item.price))}</span>
                ),
            },
            {
                key: 'actions',
                header: '',
                width: '100px',
                render: (item) => (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditItem(item);
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
    }, [bulkEdit]);

    return (
        <div className="animate-fadeIn">
            <Header
                title="Inventory"
                description={`${filteredItems.length} items in stock`}
                actions={
                    <div className="flex items-center gap-3">
                        {!bulkEdit.isActive ? (
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
                                    Add Items
                                </Button>
                            </>
                        ) : (
                            <Button variant="ghost" onClick={handleCancelBulkEdit}>
                                Exit Bulk Edit
                            </Button>
                        )}
                    </div>
                }
            />

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
                <div className="w-48">
                    <Select
                        options={consignorOptions}
                        value={filterConsignor}
                        onChange={(e) => setFilterConsignor(e.target.value)}
                        selectSize="sm"
                    />
                </div>
                <div className="w-40">
                    <Select
                        options={categoryOptions}
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        selectSize="sm"
                    />
                </div>
                {(filterConsignor || filterCategory) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setFilterConsignor('');
                            setFilterCategory('');
                        }}
                    >
                        Clear Filters
                    </Button>
                )}
            </div>

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
                    description="Add items to your inventory to get started."
                    action={
                        <Button onClick={() => navigate('/admin/add-items')}>
                            <PlusIcon />
                            Add Items
                        </Button>
                    }
                />
            ) : (
                <Table
                    data={filteredItems}
                    columns={columns}
                    keyExtractor={(item) => item.id}
                    searchable
                    searchPlaceholder="Search by name, SKU, or category..."
                    searchKeys={['name', 'sku', 'category', 'variant']}
                    isLoading={isLoading}
                    emptyMessage="No items match your filters"
                />
            )}

            {/* Bulk edit toolbar */}
            {bulkEdit.isActive && (
                <BulkEditToolbar
                    selectedCount={bulkEdit.selectedCount}
                    totalCount={filteredItems.length}
                    hasChanges={bulkEdit.hasChanges}
                    isEditing={isSpreadsheetOpen}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={bulkEdit.deselectAll}
                    onEditSelected={handleEditSelected}
                    onSaveChanges={handleSaveChanges}
                    onCancel={handleCancelBulkEdit}
                    isSaving={isSaving}
                />
            )}

            {/* Change summary modal */}
            <ChangeSummaryModal
                isOpen={showChangeSummary}
                onClose={() => setShowChangeSummary(false)}
                onConfirm={handleConfirmChanges}
                changeSummary={bulkEdit.getChangeSummary()}
                items={items}
                isLoading={isSaving}
            />

            {/* Exit confirmation modal */}
            <Modal
                isOpen={showExitConfirm}
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

            {/* Edit Modal */}
            <Modal
                isOpen={!!editItem}
                onClose={() => setEditItem(null)}
                title="Edit Item"
                size="lg"
            >
                {editItem && (
                    <ItemForm
                        item={editItem}
                        consignors={consignors}
                        categories={getCategoryNames()}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditItem(null)}
                    />
                )}
            </Modal>

            {/* Delete Confirmation */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Item"
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
