import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { ItemForm } from '../components/inventory/ItemForm';
import { BatchEntry } from '../components/inventory/BatchEntry';
import { useConsignors } from '../hooks/useConsignors';
import { useInventory } from '../hooks/useInventory';
import { useCategories } from '../hooks/useCategories';
import type { Item } from '../types';

type Mode = 'single' | 'batch';

export function AddItems() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const defaultConsignorId = searchParams.get('consignor') || '';

    const { consignors } = useConsignors();
    const { createItem, createItems } = useInventory();
    const { getCategoryNames } = useCategories();

    const [mode, setMode] = useState<Mode>('single');
    const [selectedConsignor, setSelectedConsignor] = useState(defaultConsignorId);
    const [successModal, setSuccessModal] = useState<{ count: number } | null>(null);

    const selectedConsignorData = consignors.find((c) => c.id === selectedConsignor);

    const handleSingleSubmit = async (data: Partial<Item>) => {
        if (!selectedConsignorData) return { error: 'No consignor selected' };

        const result = await createItem(
            { ...data, consignor_id: selectedConsignor } as Omit<Item, 'id' | 'sku' | 'created_at' | 'updated_at'>,
            selectedConsignorData.consignor_number
        );

        if (!result.error) {
            setSuccessModal({ count: 1 });
        }

        return result;
    };

    const handleBatchSubmit = async (items: Partial<Item>[]) => {
        if (!selectedConsignorData) return { error: 'No consignor selected' };

        const itemsWithConsignor = items.map((item) => ({
            ...item,
            consignor_id: selectedConsignor,
            consignorNumber: selectedConsignorData.consignor_number,
        })) as (Omit<Item, 'id' | 'sku' | 'created_at' | 'updated_at'> & { consignorNumber: string })[];

        const result = await createItems(itemsWithConsignor);

        if (!result.error) {
            setSuccessModal({ count: items.length });
        }

        return result;
    };

    const consignorOptions = consignors.map((c) => ({
        value: c.id,
        label: `${c.consignor_number} - ${c.name}`,
    }));

    return (
        <div className="animate-fadeIn">
            <Header
                title="Add Items"
                description="Add single items or batch import multiple items at once."
            />

            {/* Consignor Selection */}
            <Card variant="outlined" className="mb-6">
                <CardContent>
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                        <div className="flex-1 w-full sm:w-auto sm:max-w-xs">
                            <Select
                                label="Consignor"
                                options={consignorOptions}
                                value={selectedConsignor}
                                onChange={(e) => setSelectedConsignor(e.target.value)}
                                placeholder="Select consignor..."
                            />
                        </div>
                        {!selectedConsignor && consignors.length === 0 && (
                            <Button variant="secondary" onClick={() => navigate('/admin/consignors')}>
                                Add a Consignor First
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {selectedConsignor && (
                <>
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-2 mb-6">
                        <button
                            onClick={() => setMode('single')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'single'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                                }`}
                        >
                            Single Item
                        </button>
                        <button
                            onClick={() => setMode('batch')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'batch'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                                }`}
                        >
                            Batch Entry
                        </button>
                    </div>

                    {/* Content */}
                    <Card variant="outlined">
                        <CardHeader>
                            <CardTitle>
                                {mode === 'single' ? 'Add Single Item' : 'Batch Entry'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {mode === 'single' ? (
                                <ItemForm
                                    consignors={consignors}
                                    categories={getCategoryNames()}
                                    onSubmit={handleSingleSubmit}
                                    onCancel={() => navigate('/admin/inventory')}
                                    hideConsignor
                                    defaultConsignorId={selectedConsignor}
                                />
                            ) : (
                                <BatchEntry
                                    categories={getCategoryNames()}
                                    consignorId={selectedConsignor}
                                    onSubmit={handleBatchSubmit}
                                />
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Success Modal */}
            <Modal
                isOpen={!!successModal}
                onClose={() => setSuccessModal(null)}
                title="Items Added"
                size="sm"
            >
                <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
                        <CheckIcon />
                    </div>
                    <p className="text-lg font-medium text-[var(--color-foreground)]">
                        {successModal?.count === 1
                            ? '1 item added successfully!'
                            : `${successModal?.count} items added successfully!`}
                    </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-4">
                    <Button variant="secondary" onClick={() => setSuccessModal(null)}>
                        Add More
                    </Button>
                    <Button onClick={() => navigate('/admin/inventory')}>
                        View Inventory
                    </Button>
                </div>
            </Modal>
        </div>
    );
}

function CheckIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}
