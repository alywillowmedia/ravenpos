import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState, UsersIcon } from '../components/ui/EmptyState';
import { ConsignorForm } from '../components/consignors/ConsignorForm';
import { DeleteConfirmationModal } from '../components/ui/DeleteConfirmationModal';
import { useConsignors } from '../hooks/useConsignors';
import { isConsignorScheduled } from '../lib/consignorStatus';
import { getConsignorDisplayName, getConsignorPayToName } from '../lib/consignors';
import { supabase } from '../lib/supabase';
import type { Consignor, ConsignorInput } from '../types';

export function Consignors() {
    const navigate = useNavigate();
    const { consignors, isLoading, error, createConsignor, deleteConsignor } = useConsignors();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Consignor | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [itemCount, setItemCount] = useState(0);

    // Fetch item count when deleteTarget changes
    useEffect(() => {
        if (!deleteTarget) {
            setItemCount(0);
            return;
        }

        const fetchItemCount = async () => {
            try {
                const { count, error: countError } = await supabase
                    .from('items')
                    .select('id', { count: 'exact', head: true })
                    .eq('consignor_id', deleteTarget.id);

                if (countError) throw countError;
                setItemCount(count || 0);
            } catch (err) {
                console.error('Failed to fetch item count:', err);
                setItemCount(0);
            }
        };

        fetchItemCount();
    }, [deleteTarget]);

    const handleAddConsignor = async (data: Partial<ConsignorInput>) => {
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
                    <p className="font-medium text-[var(--color-foreground)]">{getConsignorDisplayName(c)}</p>
                    <p className="text-xs text-[var(--color-muted)]">Pay To: {getConsignorPayToName(c)}</p>
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
            key: 'consignor_pays_card_fee',
            header: 'Card Fee',
            width: '130px',
            render: (c) => (
                <Badge variant={c.consignor_pays_card_fee ? 'warning' : 'secondary'}>
                    {c.consignor_pays_card_fee ? 'Consignor' : 'Customer'}
                </Badge>
            ),
        },
        {
            key: 'is_active',
            header: 'Status',
            width: '100px',
            render: (c) => {
                if (!c.is_active) {
                    return <Badge variant="secondary">Inactive</Badge>;
                }

                if (isConsignorScheduled(c)) {
                    return <Badge variant="warning">Scheduled</Badge>;
                }

                return <Badge variant="success">Active</Badge>;
            },
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

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

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
                    searchKeys={['name', 'business_name', 'first_name', 'last_name', 'consignor_number', 'email', 'phone', 'booth_location']}
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
            <DeleteConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                isLoading={isDeleting}
                targetName={deleteTarget?.name || ''}
                itemCount={itemCount}
            />
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
