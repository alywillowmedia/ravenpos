import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState, UsersIcon } from '../components/ui/EmptyState';
import { ConsignorForm } from '../components/consignors/ConsignorForm';
import { ConsignorExportOptionsModal } from '../components/consignors/ConsignorExportOptionsModal';
import { DeleteConfirmationModal } from '../components/ui/DeleteConfirmationModal';
import { useConsignors } from '../hooks/useConsignors';
import { isConsignorScheduled } from '../lib/consignorStatus';
import { getConsignorDisplayName, getConsignorPayToName } from '../lib/consignors';
import { downloadCsv } from '../lib/csvExport';
import {
    CONSIGNORS_SUMMARY_EXPORT_FIELD_GROUPS,
    DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS,
    buildConsignorsSummaryCsvRows,
    buildConsignorsSummaryFilename,
    type ConsignorsSummaryExportField,
} from '../lib/consignorReports';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import type { Consignor, ConsignorInput } from '../types';

export function Consignors() {
    const navigate = useNavigate();
    const toast = useToast();
    const { consignors, isLoading, error, createConsignor, deleteConsignor } = useConsignors();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddConsignorDirty, setIsAddConsignorDirty] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Consignor | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [itemCount, setItemCount] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [selectedExportFields, setSelectedExportFields] = useState<ConsignorsSummaryExportField[]>(
        DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS
    );

    // Fetch item count when deactivateTarget changes
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
            setIsAddConsignorDirty(false);
        }
        return { error };
    };

    const openAddConsignorModal = () => {
        setIsAddConsignorDirty(false);
        setIsAddModalOpen(true);
    };

    const closeAddConsignorModal = () => {
        if (isAddConsignorDirty && !window.confirm('Close this form and discard unsaved changes?')) {
            return;
        }
        setIsAddModalOpen(false);
        setIsAddConsignorDirty(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleteError(null);
        setIsDeleting(true);
        const { error: deleteErrorMessage } = await deleteConsignor(deleteTarget.id);
        setIsDeleting(false);

        if (deleteErrorMessage) {
            setDeleteError(deleteErrorMessage);
            return;
        }

        setDeleteTarget(null);
    };

    const handleExportConsignorsCsv = async () => {
        if (consignors.length === 0 || selectedExportFields.length === 0) return;

        setIsExporting(true);
        try {
            const rows = await buildConsignorsSummaryCsvRows(consignors, selectedExportFields);
            downloadCsv(buildConsignorsSummaryFilename(), rows);
            setIsExportModalOpen(false);
            toast.success('Consignor report exported', `${consignors.length} consignor${consignors.length === 1 ? '' : 's'} included.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Please try again.';
            toast.error('Unable to export consignors', message);
        } finally {
            setIsExporting(false);
        }
    };

    const toggleExportField = (field: ConsignorsSummaryExportField) => {
        setSelectedExportFields((current) =>
            current.includes(field)
                ? current.filter((selectedField) => selectedField !== field)
                : [...current, field]
        );
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
                        setDeleteError(null);
                        setDeleteTarget(c);
                    }}
                    className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                    title="Deactivate"
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
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setIsExportModalOpen(true)}
                            disabled={isLoading || consignors.length === 0}
                        >
                            <DownloadIcon />
                            Export CSV
                        </Button>
                        <Button onClick={openAddConsignorModal}>
                            <PlusIcon />
                            Add Consignor
                        </Button>
                    </>
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
                        <Button onClick={openAddConsignorModal}>
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
                onClose={closeAddConsignorModal}
                title="Add Consignor"
                description="Enter the consignor's details below."
                size="md"
                closeOnOverlayClick={false}
                closeOnEscape={false}
                showCloseButton
            >
                <div onChangeCapture={() => setIsAddConsignorDirty(true)}>
                    <ConsignorForm
                        onSubmit={handleAddConsignor}
                        onCancel={closeAddConsignorModal}
                    />
                </div>
            </Modal>

            {/* Deactivate Confirmation Modal */}
            <DeleteConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                }}
                onConfirm={handleDelete}
                isLoading={isDeleting}
                targetName={deleteTarget?.name || ''}
                itemCount={itemCount}
                description={deleteError || undefined}
                title="Deactivate Vendor"
                warningLabel="Records will be preserved"
                warningIntro={`Deactivating ${deleteTarget?.name || 'this vendor'} will:`}
                consequences={[
                    'Mark their vendor profile inactive',
                    `Keep all ${itemCount} inventory item${itemCount !== 1 ? 's' : ''}, sales history, payouts, invoices, and ledger records intact`,
                    'Leave vendor portal login unchanged unless you remove it separately',
                ]}
                confirmActionLabel="Deactivate"
                confirmButtonLabel="Deactivate Vendor"
            />

            <ConsignorExportOptionsModal
                isOpen={isExportModalOpen}
                title="Export Consignors"
                description="Choose which fields to include in the consignor CSV report."
                groups={CONSIGNORS_SUMMARY_EXPORT_FIELD_GROUPS}
                selectedOptions={selectedExportFields}
                isExporting={isExporting}
                onToggle={toggleExportField}
                onSelectAll={() => setSelectedExportFields(DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS)}
                onClear={() => setSelectedExportFields([])}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExportConsignorsCsv}
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

function DownloadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
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
