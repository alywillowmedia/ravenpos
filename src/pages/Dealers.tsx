import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Input, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useDealers } from '../hooks/useDealers';
import { formatDate } from '../lib/utils';
import type { Dealer, DealerInput } from '../types';

const EMPTY_DEALER_FORM: DealerInput = {
    name: '',
    business_name: null,
    email: null,
    phone: null,
    notes: null,
    is_active: true,
};

export function Dealers() {
    const { dealers, isLoading, createDealer, updateDealer, deleteDealer } = useDealers();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddDealerDirty, setIsAddDealerDirty] = useState(false);
    const [editTarget, setEditTarget] = useState<Dealer | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Dealer | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [formData, setFormData] = useState<DealerInput>(EMPTY_DEALER_FORM);

    const resetForm = () => setFormData(EMPTY_DEALER_FORM);

    const openAddModal = () => {
        setIsAddDealerDirty(false);
        resetForm();
        setIsAddModalOpen(true);
    };

    const closeAddModal = () => {
        if (isAddDealerDirty && !window.confirm('Close this form and discard unsaved changes?')) {
            return;
        }
        setIsAddDealerDirty(false);
        setIsAddModalOpen(false);
        resetForm();
    };

    const openEditModal = (dealer: Dealer) => {
        setEditTarget(dealer);
        setFormData({
            name: dealer.name,
            business_name: dealer.business_name,
            email: dealer.email,
            phone: dealer.phone,
            notes: dealer.notes,
            is_active: dealer.is_active,
        });
    };

    const handleAddDealer = async () => {
        if (!formData.name.trim()) return;
        const { error } = await createDealer(formData);
        if (!error) {
            setIsAddDealerDirty(false);
            setIsAddModalOpen(false);
            resetForm();
        }
    };

    const handleSaveDealer = async () => {
        if (!editTarget || !formData.name.trim()) return;
        const { error } = await updateDealer(editTarget.id, formData);
        if (!error) {
            setEditTarget(null);
            resetForm();
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deleteDealer(deleteTarget.id);
        setIsDeleting(false);
        setDeleteTarget(null);
    };

    const columns: Column<Dealer>[] = [
        {
            key: 'name',
            header: 'Dealer',
            sortable: true,
            render: (dealer) => (
                <div>
                    <p className="font-medium text-[var(--color-foreground)]">{dealer.name}</p>
                    {dealer.business_name && (
                        <p className="text-xs text-[var(--color-muted)]">{dealer.business_name}</p>
                    )}
                </div>
            ),
        },
        {
            key: 'contact',
            header: 'Contact',
            render: (dealer) => (
                <div className="text-sm">
                    {dealer.phone && <p>{dealer.phone}</p>}
                    {dealer.email && <p className="text-[var(--color-muted)]">{dealer.email}</p>}
                    {!dealer.phone && !dealer.email && <span className="text-[var(--color-muted)]">—</span>}
                </div>
            ),
        },
        {
            key: 'is_active',
            header: 'Status',
            width: '110px',
            render: (dealer) => (
                <Badge variant={dealer.is_active ? 'success' : 'secondary'}>
                    {dealer.is_active ? 'Active' : 'Inactive'}
                </Badge>
            ),
        },
        {
            key: 'created_at',
            header: 'Added',
            width: '120px',
            sortable: true,
            render: (dealer) => (
                <span className="text-sm text-[var(--color-muted)]">{formatDate(dealer.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            header: '',
            width: '110px',
            render: (dealer) => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(dealer);
                        }}
                        className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                        title="Edit"
                    >
                        <EditIcon />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(dealer);
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
                title="Dealers"
                description="Manage people and businesses you purchase inventory from."
                actions={
                    <Button onClick={openAddModal}>
                        <PlusIcon />
                        Add Dealer
                    </Button>
                }
            />

            {dealers.length === 0 && !isLoading ? (
                <EmptyState
                    icon={<DealersIcon />}
                    title="No dealers yet"
                    description="Add your first dealer so purchases can be tied to the right seller."
                    action={
                        <Button onClick={openAddModal}>
                            <PlusIcon />
                            Add Dealer
                        </Button>
                    }
                />
            ) : (
                <Table
                    data={dealers}
                    columns={columns}
                    keyExtractor={(dealer) => dealer.id}
                    searchable
                    searchPlaceholder="Search dealers..."
                    searchKeys={['name', 'business_name', 'email', 'phone']}
                    onRowClick={openEditModal}
                    isLoading={isLoading}
                    emptyMessage="No dealers found"
                />
            )}

            <Modal
                isOpen={isAddModalOpen}
                onClose={closeAddModal}
                title="Add Dealer"
                size="md"
                closeOnOverlayClick={false}
                closeOnEscape={false}
                showCloseButton
            >
                <div className="space-y-4" onChangeCapture={() => setIsAddDealerDirty(true)}>
                    <DealerFields formData={formData} onChange={setFormData} />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={closeAddModal}>Cancel</Button>
                    <Button onClick={handleAddDealer} disabled={!formData.name.trim()}>
                        Add Dealer
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={!!editTarget}
                onClose={() => {
                    setEditTarget(null);
                    resetForm();
                }}
                title="Edit Dealer"
                size="md"
            >
                <div className="space-y-4">
                    <DealerFields formData={formData} onChange={setFormData} />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
                    <Button onClick={handleSaveDealer} disabled={!formData.name.trim()}>
                        Save Changes
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Dealer"
                description={`Delete ${deleteTarget?.name || 'this dealer'}? Existing purchase records will keep historical totals and remove the dealer link.`}
                size="sm"
            >
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                        Cancel
                    </Button>
                    <Button variant="danger" isLoading={isDeleting} onClick={handleDelete}>
                        Delete Dealer
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

function DealerFields({
    formData,
    onChange,
}: {
    formData: DealerInput;
    onChange: (value: DealerInput | ((prev: DealerInput) => DealerInput)) => void;
}) {
    return (
        <>
            <Input
                label="Dealer Name *"
                value={formData.name}
                onChange={(e) => onChange((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Dealer name"
            />
            <Input
                label="Business Name"
                value={formData.business_name || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, business_name: e.target.value || null }))}
                placeholder="Business name"
            />
            <Input
                label="Phone"
                value={formData.phone || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, phone: e.target.value || null }))}
                placeholder="(555) 123-4567"
            />
            <Input
                label="Email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, email: e.target.value || null }))}
                placeholder="dealer@example.com"
            />
            <Textarea
                label="Notes"
                value={formData.notes || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, notes: e.target.value || null }))}
                rows={3}
                placeholder="Internal notes"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => onChange((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-[var(--color-border)]"
                />
                Dealer is active
            </label>
        </>
    );
}

function DealersIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V9l7-4 7 4v12" />
            <path d="M9 14h6" />
            <path d="M9 17h6" />
        </svg>
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
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
