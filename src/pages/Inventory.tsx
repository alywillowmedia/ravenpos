import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { EmptyState, PackageIcon } from '../components/ui/EmptyState';
import { ItemForm } from '../components/inventory/ItemForm';
import { useInventory } from '../hooks/useInventory';
import { useConsignors } from '../hooks/useConsignors';
import { useCategories } from '../hooks/useCategories';
import { formatCurrency } from '../lib/utils';
import type { Item } from '../types';

export function Inventory() {
    const navigate = useNavigate();
    const { items, isLoading, updateItem, deleteItem } = useInventory();
    const { consignors } = useConsignors();
    const { getCategoryNames } = useCategories();

    const [editItem, setEditItem] = useState<Item | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filterConsignor, setFilterConsignor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

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
    const filteredItems = items.filter((item) => {
        if (filterConsignor && item.consignor_id !== filterConsignor) return false;
        if (filterCategory && item.category !== filterCategory) return false;
        return true;
    });

    const consignorOptions = [
        { value: '', label: 'All Consignors' },
        ...consignors.map((c) => ({ value: c.id, label: `${c.consignor_number} - ${c.name}` })),
    ];

    const categoryOptions = [
        { value: '', label: 'All Categories' },
        ...getCategoryNames().map((name) => ({ value: name, label: name })),
    ];

    const columns: Column<Item>[] = [
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
                <div>
                    <p className="font-medium text-[var(--color-foreground)]">{item.name}</p>
                    {item.variant && (
                        <p className="text-xs text-[var(--color-muted)]">{item.variant}</p>
                    )}
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

    return (
        <div className="animate-fadeIn">
            <Header
                title="Inventory"
                description={`${filteredItems.length} items in stock`}
                actions={
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" onClick={() => navigate('/admin/import')}>
                            Import CSV
                        </Button>
                        <Button onClick={() => navigate('/admin/add-items')}>
                            <PlusIcon />
                            Add Items
                        </Button>
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

            {items.length === 0 && !isLoading ? (
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

            {/* Edit Modal */}
            <Modal
                isOpen={!!editItem}
                onClose={() => setEditItem(null)}
                title="Edit Item"
                size="md"
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
