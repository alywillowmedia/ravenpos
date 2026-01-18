import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState, UsersIcon } from '../components/ui/EmptyState';
import { ConsignorForm } from '../components/consignors/ConsignorForm';
import { useConsignors } from '../hooks/useConsignors';
import type { Consignor } from '../types';

export function Consignors() {
    const navigate = useNavigate();
    const { consignors, isLoading, createConsignor, deleteConsignor } = useConsignors();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Consignor | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleAddConsignor = async (data: Partial<Consignor>) => {
        const { error } = await createConsignor(data);
        if (!error) {
            setIsAddModalOpen(false);
        }
        return { error };
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deleteConsignor(deleteTarget.id);
        setIsDeleting(false);
        setDeleteTarget(null);
    };

    const columns: Column<Consignor>[] = [
        {
            key: 'consignor_number',
            header: 'ID',
            width: '100px',
            sortable: true,
            render: (c) => (
                <span className="font-mono text-sm font-medium">{c.consignor_number}</span>
            ),
        },
        {
            key: 'name',
            header: 'Name',
            sortable: true,
            render: (c) => (
                <div>
                    <p className="font-medium text-[var(--color-foreground)]">{c.name}</p>
                    {c.booth_location && (
                        <p className="text-xs text-[var(--color-muted)]">{c.booth_location}</p>
                    )}
                </div>
            ),
        },
        {
            key: 'email',
            header: 'Contact',
            render: (c) => (
                <div className="text-sm">
                    {c.email && <p>{c.email}</p>}
                    {c.phone && <p className="text-[var(--color-muted)]">{c.phone}</p>}
                    {!c.email && !c.phone && <span className="text-[var(--color-muted)]">—</span>}
                </div>
            ),
        },
        {
            key: 'commission_split',
            header: 'Split',
            width: '100px',
            sortable: true,
            render: (c) => (
                <span className="text-sm">{Math.round(Number(c.commission_split) * 100)}%</span>
            ),
        },
        {
            key: 'is_active',
            header: 'Status',
            width: '100px',
            render: (c) => (
                <Badge variant={c.is_active ? 'success' : 'secondary'}>
                    {c.is_active ? 'Active' : 'Inactive'}
                </Badge>
            ),
        },
        {
            key: 'actions',
            header: '',
            width: '80px',
            render: (c) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(c);
                    }}
                    className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                    title="Delete"
                >
                    <TrashIcon />
                </button>
            ),
        },
    ];

    return (
        <div className="animate-fadeIn">
            <Header
                title="Consignors"
                description="Manage your vendors and their commission splits."
                actions={
                    <Button onClick={() => setIsAddModalOpen(true)}>
                        <PlusIcon />
                        Add Consignor
                    </Button>
                }
            />

            {consignors.length === 0 && !isLoading ? (
                <EmptyState
                    icon={<UsersIcon />}
                    title="No consignors yet"
                    description="Add your first consignor to start tracking their inventory and sales."
                    action={
                        <Button onClick={() => setIsAddModalOpen(true)}>
                            <PlusIcon />
                            Add Consignor
                        </Button>
                    }
                />
            ) : (
                <Table
                    data={consignors}
                    columns={columns}
                    keyExtractor={(c) => c.id}
                    searchable
                    searchPlaceholder="Search consignors..."
                    searchKeys={['name', 'consignor_number', 'email', 'phone', 'booth_location']}
                    onRowClick={(c) => navigate(`/admin/consignors/${c.id}`)}
                    isLoading={isLoading}
                    emptyMessage="No consignors found"
                />
            )}

            {/* Add Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Add Consignor"
                description="Enter the consignor's details below."
                size="md"
            >
                <ConsignorForm
                    onSubmit={handleAddConsignor}
                    onCancel={() => setIsAddModalOpen(false)}
                />
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Consignor"
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will also delete all their inventory items. This action cannot be undone.
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

function TrashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
    );
}
