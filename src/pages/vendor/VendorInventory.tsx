import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Table, type Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, PackageIcon } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import { useConsignors } from '../../hooks/useConsignors';
import { useCategories } from '../../hooks/useCategories';
import { formatCurrency } from '../../lib/utils';
import { VendorItemForm } from '../../components/vendor/VendorItemForm';
import { VendorBatchEntry } from '../../components/vendor/VendorBatchEntry';
import { Tabs } from '../../components/ui/Tabs';
import type { Item } from '../../types';

export function VendorInventory() {
    const { userRecord } = useAuth();
    const { items, isLoading, createItem, createItems, updateItem, deleteItem } = useInventory(userRecord?.consignor_id || undefined);
    const { consignors } = useConsignors();
    const { getCategoryNames } = useCategories();

    const [view, setView] = useState<'list' | 'single' | 'batch'>('list');
    const [editingItem, setEditingItem] = useState<Item | null>(null);
    const [deletingItem, setDeletingItem] = useState<Item | null>(null);

    const handleAddItem = async (data: Partial<Item>) => {
        if (!userRecord?.consignor_id) return { error: 'No consignor ID' };

        // Get the consignor number for SKU generation
        const consignor = consignors.find(c => c.id === userRecord.consignor_id);
        if (!consignor) return { error: 'Consignor not found' };

        const result = await createItem(
            {
                ...data,
                consignor_id: userRecord.consignor_id,
            } as Omit<Item, 'id' | 'created_at' | 'updated_at' | 'consignor'>,
            consignor.consignor_number
        );

        if (!result.error) {
            setView('list');
        }
        return result;
    };

    const handleUpdateItem = async (data: Partial<Item>) => {
        if (!editingItem) return { error: 'No item' };
        const result = await updateItem(editingItem.id, data);
        if (!result.error) {
            setEditingItem(null);
        }
        return result;
    };

    const handleDeleteItem = async () => {
        if (!deletingItem) return;
        await deleteItem(deletingItem.id);
        setDeletingItem(null);
    };

    const handleBatchSubmit = async (batchItems: Partial<Item>[]) => {
        if (!userRecord?.consignor_id) return { error: 'No consignor ID' };

        const consignor = consignors.find(c => c.id === userRecord.consignor_id);
        if (!consignor) return { error: 'Consignor not found' };

        const itemsToCreate = batchItems.map(item => ({
            ...item,
            consignor_id: userRecord.consignor_id!,
            name: item.name!,
            price: item.price!,
            consignorNumber: consignor.consignor_number,
        }));

        const result = await createItems(itemsToCreate);

        if (!result.error) {
            setView('list');
        }
        return result;
    };

    const columns: Column<Item>[] = [
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
                        <p className="font-medium">{item.name}</p>
                        {item.variant && (
                            <p className="text-xs text-[var(--color-muted)]">{item.variant}</p>
                        )}
                    </div>
                </div>
            ),
        },
        {
            key: 'category',
            header: 'Category',
            width: '120px',
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
            render: (item) => formatCurrency(Number(item.price)),
        },
        {
            key: 'actions',
            header: '',
            width: '100px',
            render: (item) => (
                <div className="flex gap-2">
                    <button
                        onClick={() => setEditingItem(item)}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => setDeletingItem(item)}
                        className="text-xs text-[var(--color-danger)] hover:underline"
                    >
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    const tabs = [
        { id: 'list', label: 'View All Items' },
        { id: 'single', label: 'Add Single Item' },
        { id: 'batch', label: 'Batch Entry' },
    ];

    return (
        <div className="animate-fadeIn space-y-6">
            <Header
                title="My Inventory"
                description="Manage your consigned items"
            />

            <Tabs
                tabs={tabs}
                activeTab={view}
                onChange={(id) => setView(id as any)}
                className="max-w-md"
            />

            <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden p-6">
                {view === 'list' && (
                    <>
                        {items.length === 0 && !isLoading ? (
                            <div className="py-12">
                                <EmptyState
                                    icon={<PackageIcon />}
                                    title="No items yet"
                                    description="Start adding items to your inventory"
                                    action={
                                        <Button onClick={() => setView('single')}>
                                            Add Your First Item
                                        </Button>
                                    }
                                />
                            </div>
                        ) : (
                            <Table
                                data={items}
                                columns={columns}
                                keyExtractor={(item) => item.id}
                                searchable
                                searchPlaceholder="Search items..."
                                searchKeys={['name', 'sku', 'category', 'variant']}
                                isLoading={isLoading}
                            />
                        )}
                    </>
                )}

                {view === 'single' && (
                    <div className="max-w-3xl mx-auto">
                        <div className="mb-6">
                            <h2 className="text-lg font-semibold">Add New Item</h2>
                            <p className="text-sm text-[var(--color-muted)]">
                                Add a single item to your inventory with detailed information.
                            </p>
                        </div>
                        <VendorItemForm
                            consignorId={userRecord?.consignor_id || ''}
                            onSubmit={handleAddItem}
                            onCancel={() => setView('list')}
                        />
                    </div>
                )}

                {view === 'batch' && (
                    <div>
                        <div className="mb-6">
                            <h2 className="text-lg font-semibold">Batch Entry</h2>
                            <p className="text-sm text-[var(--color-muted)]">
                                Quickly add multiple items at once.
                            </p>
                        </div>
                        <VendorBatchEntry
                            categories={getCategoryNames()}
                            onSubmit={handleBatchSubmit}
                            onCancel={() => setView('list')}
                        />
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            <Modal
                isOpen={!!editingItem}
                onClose={() => setEditingItem(null)}
                title="Edit Item"
                size="md"
            >
                {editingItem && (
                    <VendorItemForm
                        item={editingItem}
                        consignorId={userRecord?.consignor_id || ''}
                        onSubmit={handleUpdateItem}
                        onCancel={() => setEditingItem(null)}
                    />
                )}
            </Modal>

            {/* Delete Confirmation */}
            <Modal
                isOpen={!!deletingItem}
                onClose={() => setDeletingItem(null)}
                title="Delete Item"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-[var(--color-muted)]">
                        Are you sure you want to delete <strong>{deletingItem?.name}</strong>?
                        This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setDeletingItem(null)}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={handleDeleteItem}>
                            Delete
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
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
