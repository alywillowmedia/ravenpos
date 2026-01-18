import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState, PackageIcon } from '../components/ui/EmptyState';
import { Input, Textarea } from '../components/ui/Input';
import { ConsignorForm } from '../components/consignors/ConsignorForm';
import { VendorCredentials } from '../components/consignors/VendorCredentials';
import { useConsignors } from '../hooks/useConsignors';
import { useInventory } from '../hooks/useInventory';
import { useBoothRentPayments } from '../hooks/useBoothRentPayments';
import { formatCurrency, formatDate } from '../lib/utils';
import type { Consignor, Item, BoothRentPayment } from '../types';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function ConsignorDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { getConsignorById, updateConsignor } = useConsignors();
    const { items, isLoading: itemsLoading } = useInventory(id);
    const {
        payments,
        isLoading: paymentsLoading,
        createPayment,
        deletePayment,
        yearlyTotal,
        paidMonths
    } = useBoothRentPayments(id);

    const [consignor, setConsignor] = useState<Consignor | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentFormData, setPaymentFormData] = useState({
        amount: 0,
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        notes: '',
        paid_at: new Date().toISOString().split('T')[0],
    });
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<BoothRentPayment | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchConsignor = async () => {
            if (!id) return;
            const { data } = await getConsignorById(id);
            setConsignor(data);
            setIsLoading(false);
        };
        fetchConsignor();
    }, [id, getConsignorById]);

    // Pre-fill payment amount when consignor loads
    useEffect(() => {
        if (consignor?.monthly_booth_rent) {
            setPaymentFormData(prev => ({
                ...prev,
                amount: Number(consignor.monthly_booth_rent)
            }));
        }
    }, [consignor]);

    const handleUpdate = async (data: Partial<Consignor>) => {
        if (!id) return { error: 'No ID' };
        const result = await updateConsignor(id, data);
        if (!result.error) {
            setConsignor(result.data);
            setIsEditModalOpen(false);
        }
        return result;
    };

    const handleRecordPayment = async () => {
        if (!id) return;
        setPaymentError(null);
        setIsSubmittingPayment(true);

        const result = await createPayment({
            consignor_id: id,
            amount: paymentFormData.amount,
            period_month: paymentFormData.period_month,
            period_year: paymentFormData.period_year,
            notes: paymentFormData.notes || null,
            paid_at: new Date(paymentFormData.paid_at).toISOString(),
        });

        setIsSubmittingPayment(false);

        if (result.error) {
            setPaymentError(result.error);
        } else {
            setIsPaymentModalOpen(false);
            // Reset form for next entry
            setPaymentFormData(prev => ({
                ...prev,
                notes: '',
                paid_at: new Date().toISOString().split('T')[0],
            }));
        }
    };

    const handleDeletePayment = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deletePayment(deleteTarget.id);
        setIsDeleting(false);
        setDeleteTarget(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    if (!consignor) {
        return (
            <EmptyState
                title="Consignor not found"
                description="The consignor you're looking for doesn't exist."
                action={
                    <Button onClick={() => navigate('/admin/consignors')}>
                        Back to Consignors
                    </Button>
                }
            />
        );
    }

    const itemColumns: Column<Item>[] = [
        {
            key: 'sku',
            header: 'SKU',
            width: '160px',
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
    ];

    const paymentColumns: Column<BoothRentPayment>[] = [
        {
            key: 'period',
            header: 'Period',
            render: (p) => `${MONTH_NAMES[p.period_month - 1]} ${p.period_year}`,
        },
        {
            key: 'amount',
            header: 'Amount',
            width: '120px',
            render: (p) => formatCurrency(Number(p.amount)),
        },
        {
            key: 'paid_at',
            header: 'Date Paid',
            width: '140px',
            render: (p) => formatDate(p.paid_at),
        },
        {
            key: 'notes',
            header: 'Notes',
            render: (p) => p.notes || '—',
        },
        {
            key: 'actions',
            header: '',
            width: '60px',
            render: (p) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(p);
                    }}
                    className="p-1 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                    title="Delete"
                >
                    <TrashIcon />
                </button>
            ),
        },
    ];

    const totalValue = items.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0
    );

    const monthlyRent = Number(consignor.monthly_booth_rent) || 0;
    const currentYear = new Date().getFullYear();

    return (
        <div className="animate-fadeIn">
            <div className="mb-6">
                <Link
                    to="/admin/consignors"
                    className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                >
                    ← Back to Consignors
                </Link>
            </div>

            <Header
                title={consignor.name}
                description={`Consignor ${consignor.consignor_number}`}
                actions={
                    <Button variant="secondary" onClick={() => setIsEditModalOpen(true)}>
                        Edit
                    </Button>
                }
            />

            {/* Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <Card variant="outlined">
                    <CardHeader>
                        <CardTitle className="text-sm text-[var(--color-muted)]">Contact Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p>
                            <strong>Email:</strong> {consignor.email || '—'}
                        </p>
                        <p>
                            <strong>Phone:</strong> {consignor.phone || '—'}
                        </p>
                        <p>
                            <strong>Address:</strong> {consignor.address || '—'}
                        </p>
                        <p>
                            <strong>Booth:</strong> {consignor.booth_location || '—'}
                        </p>
                    </CardContent>
                </Card>

                <Card variant="outlined">
                    <CardHeader>
                        <CardTitle className="text-sm text-[var(--color-muted)]">Account</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p className="flex items-center justify-between">
                            <strong>Status:</strong>
                            <Badge variant={consignor.is_active ? 'success' : 'secondary'}>
                                {consignor.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                        </p>
                        <p>
                            <strong>Commission:</strong> {Math.round(Number(consignor.commission_split) * 100)}%
                        </p>
                        <p>
                            <strong>Monthly Rent:</strong> {monthlyRent > 0 ? formatCurrency(monthlyRent) : 'None'}
                        </p>
                        <p>
                            <strong>Member Since:</strong> {formatDate(consignor.created_at)}
                        </p>
                    </CardContent>
                </Card>

                <Card variant="elevated" className="bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent">
                    <CardHeader>
                        <CardTitle className="text-sm text-[var(--color-muted)]">Inventory Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-3xl font-bold text-[var(--color-foreground)]">
                            {items.length}
                            <span className="text-sm font-normal text-[var(--color-muted)] ml-2">items</span>
                        </p>
                        <p className="text-lg font-medium text-[var(--color-primary)]">
                            {formatCurrency(totalValue)}
                            <span className="text-sm font-normal text-[var(--color-muted)] ml-2">total value</span>
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Notes */}
            {consignor.notes && (
                <Card variant="outlined" className="mb-8">
                    <CardHeader>
                        <CardTitle className="text-sm">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-[var(--color-muted)] whitespace-pre-wrap">
                            {consignor.notes}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Booth Rent Payments Section - Only show if consignor has booth rent */}
            {monthlyRent > 0 && (
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold">Booth Rent Payments</h2>
                            <p className="text-sm text-[var(--color-muted)]">
                                {currentYear} Total: {formatCurrency(yearlyTotal)} / {formatCurrency(monthlyRent * 12)}
                                <span className="ml-2">({paidMonths.length}/12 months)</span>
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setIsPaymentModalOpen(true)}>
                            <PlusIcon /> Record Payment
                        </Button>
                    </div>

                    {payments.length === 0 && !paymentsLoading ? (
                        <Card variant="outlined" padding="md">
                            <EmptyState
                                icon={<DollarIcon />}
                                title="No payments recorded"
                                description="Record booth rent payments to track payment history."
                            />
                        </Card>
                    ) : (
                        <Table
                            data={payments}
                            columns={paymentColumns}
                            keyExtractor={(p) => p.id}
                            isLoading={paymentsLoading}
                            emptyMessage="No payments recorded"
                        />
                    )}
                </div>
            )}

            {/* Vendor Credentials */}
            <VendorCredentials
                consignorId={id!}
                consignorEmail={consignor.email || undefined}
            />

            {/* Inventory */}
            <div className="flex items-center justify-between mb-4 mt-8">
                <h2 className="text-lg font-semibold">Inventory</h2>
                <Link to={`/admin/add-items?consignor=${id}`}>
                    <Button size="sm">Add Items</Button>
                </Link>
            </div>

            {items.length === 0 && !itemsLoading ? (
                <Card variant="outlined" padding="lg">
                    <EmptyState
                        icon={<PackageIcon />}
                        title="No items yet"
                        description={`${consignor.name} doesn't have any items in inventory.`}
                        action={
                            <Link to={`/add-items?consignor=${id}`}>
                                <Button>Add Items</Button>
                            </Link>
                        }
                    />
                </Card>
            ) : (
                <Table
                    data={items}
                    columns={itemColumns}
                    keyExtractor={(item) => item.id}
                    searchable
                    searchPlaceholder="Search items..."
                    searchKeys={['name', 'sku', 'category', 'variant']}
                    isLoading={itemsLoading}
                />
            )}

            {/* Edit Consignor Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edit Consignor"
                size="md"
            >
                <ConsignorForm
                    consignor={consignor}
                    onSubmit={handleUpdate}
                    onCancel={() => setIsEditModalOpen(false)}
                />
            </Modal>

            {/* Record Payment Modal */}
            <Modal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title="Record Booth Rent Payment"
                size="sm"
            >
                <div className="space-y-4">
                    {paymentError && (
                        <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                            {paymentError}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Month</label>
                            <select
                                value={paymentFormData.period_month}
                                onChange={(e) => setPaymentFormData(prev => ({ ...prev, period_month: Number(e.target.value) }))}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
                            >
                                {MONTH_NAMES.map((month, idx) => (
                                    <option key={month} value={idx + 1}>
                                        {month}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Input
                            label="Year"
                            type="number"
                            min="2020"
                            max="2099"
                            value={paymentFormData.period_year}
                            onChange={(e) => setPaymentFormData(prev => ({ ...prev, period_year: Number(e.target.value) }))}
                        />
                    </div>

                    <Input
                        label="Amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentFormData.amount}
                        onChange={(e) => setPaymentFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    />

                    <Input
                        label="Date Paid"
                        type="date"
                        value={paymentFormData.paid_at}
                        onChange={(e) => setPaymentFormData(prev => ({ ...prev, paid_at: e.target.value }))}
                    />

                    <Textarea
                        label="Notes (optional)"
                        value={paymentFormData.notes}
                        onChange={(e) => setPaymentFormData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="e.g., Paid via check #1234"
                        rows={2}
                    />

                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRecordPayment} isLoading={isSubmittingPayment}>
                            Record Payment
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Delete Payment Confirmation Modal */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Payment"
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Are you sure you want to delete the payment for{' '}
                    <strong>{deleteTarget ? `${MONTH_NAMES[deleteTarget.period_month - 1]} ${deleteTarget.period_year}` : ''}</strong>?
                    This action cannot be undone.
                </p>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={handleDeletePayment} isLoading={isDeleting}>
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

function DollarIcon() {
    return (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M9 9.5a2.5 2.5 0 0 1 2.5-2.5h1a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 0 2.5-2.5" />
        </svg>
    );
}
