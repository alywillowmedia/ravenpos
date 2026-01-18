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
import type { Item } from '../../types';

export function VendorInventory() {
    const { userRecord } = useAuth();
    const { items, isLoading, createItem, createItems, updateItem, deleteItem } = useInventory(userRecord?.consignor_id || undefined);
    const { consignors } = useConsignors();
    const { getCategoryNames } = useCategories();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
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
            setIsAddModalOpen(false);
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
            setIsBatchModalOpen(false);
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
                <div>
                    <p className="font-medium">{item.name}</p>
                    {item.variant && (
                        <p className="text-xs text-[var(--color-muted)]">{item.variant}</p>
                    )}
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

    return (
        <div className="animate-fadeIn">
            <Header
                title="My Inventory"
                description="Manage your consigned items"
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setIsBatchModalOpen(true)}>
                            Add Multiple
                        </Button>
                        <Button onClick={() => setIsAddModalOpen(true)}>
                            Add Item
                        </Button>
                    </div>
                }
            />

            {items.length === 0 && !isLoading ? (
                <div className="py-12">
                    <EmptyState
                        icon={<PackageIcon />}
                        title="No items yet"
                        description="Start adding items to your inventory"
                        action={
                            <Button onClick={() => setIsAddModalOpen(true)}>
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

            {/* Add Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Add Item"
                size="md"
            >
                <VendorItemForm
                    consignorId={userRecord?.consignor_id || ''}
                    onSubmit={handleAddItem}
                    onCancel={() => setIsAddModalOpen(false)}
                />
            </Modal>

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

            {/* Batch Entry Modal */}
            <Modal
                isOpen={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                title="Add Multiple Items"
                size="lg"
            >
                <VendorBatchEntry
                    categories={getCategoryNames()}
                    onSubmit={handleBatchSubmit}
                    onCancel={() => setIsBatchModalOpen(false)}
                />
            </Modal>
        </div>
    );
}
