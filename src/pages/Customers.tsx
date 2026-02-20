import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useCustomers } from '../hooks/useCustomers';
import { formatCurrency, formatDate } from '../lib/utils';
import type { Customer, CustomerInput, PaymentMethod } from '../types';

interface OrderHistoryItem {
    id: string;
    completed_at: string;
    subtotal: number;
    tax_amount: number;
    total: number;
    payment_method: PaymentMethod;
    check_number?: string | null;
    cash_tendered: number | null;
    change_given: number | null;
    refund_status: 'partial' | 'full' | null;
    discount_total: number | null;
    sale_items: {
        id: string;
        name: string;
        sku: string;
        price: number;
        quantity: number;
        discount_amount?: number | null;
    }[];
}

export function Customers() {
    const { customers, isLoading, createCustomer, updateCustomer, deleteCustomer, getCustomerOrderHistory, addStoreCredit } = useCustomers();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Customer | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
    const [creditTarget, setCreditTarget] = useState<Customer | null>(null);
    const [viewOrdersCustomer, setViewOrdersCustomer] = useState<Customer | null>(null);
    const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<OrderHistoryItem | null>(null);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [orderHistoryError, setOrderHistoryError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isApplyingCredit, setIsApplyingCredit] = useState(false);
    const [creditAmount, setCreditAmount] = useState('');
    const [creditError, setCreditError] = useState<string | null>(null);
    const [formData, setFormData] = useState<CustomerInput>({
        name: '',
        email: null,
        phone: null,
        notes: null,
    });

    const resetForm = () => {
        setFormData({ name: '', email: null, phone: null, notes: null });
    };

    const handleAdd = async () => {
        if (!formData.name.trim()) return;
        const { error } = await createCustomer(formData);
        if (!error) {
            setIsAddModalOpen(false);
            resetForm();
        }
    };

    const handleEdit = async () => {
        if (!editTarget || !formData.name.trim()) return;
        const { error } = await updateCustomer(editTarget.id, formData);
        if (!error) {
            setEditTarget(null);
            resetForm();
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deleteCustomer(deleteTarget.id);
        setIsDeleting(false);
        setDeleteTarget(null);
    };

    const handleAddCredit = async () => {
        if (!creditTarget) return;
        const amount = Number(creditAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setCreditError('Enter a valid amount greater than 0');
            return;
        }

        setCreditError(null);
        setIsApplyingCredit(true);
        const { error } = await addStoreCredit(creditTarget.id, amount);
        setIsApplyingCredit(false);

        if (error) {
            setCreditError(error);
            return;
        }

        setCreditTarget(null);
        setCreditAmount('');
    };

    const loadOrdersForCustomer = async (customerId: string) => {
        setIsLoadingOrders(true);
        setOrderHistoryError(null);
        const { data, error } = await getCustomerOrderHistory(customerId);
        if (error) {
            setOrderHistoryError(error);
            setOrderHistory([]);
            setIsLoadingOrders(false);
            return;
        }
        setOrderHistory(data as OrderHistoryItem[]);
        setIsLoadingOrders(false);
    };

    const handleViewOrders = async (customer: Customer) => {
        setViewOrdersCustomer(customer);
        setSelectedOrder(null);
        await loadOrdersForCustomer(customer.id);
    };

    const openEditModal = (customer: Customer) => {
        setFormData({
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            notes: customer.notes,
        });
        setEditTarget(customer);
    };

    const columns: Column<Customer>[] = [
        {
            key: 'name',
            header: 'Name',
            sortable: true,
            render: (c) => (
                <p className="font-medium text-[var(--color-foreground)]">{c.name}</p>
            ),
        },
        {
            key: 'phone',
            header: 'Phone',
            render: (c) => (
                <span className="text-sm">{c.phone || <span className="text-[var(--color-muted)]">—</span>}</span>
            ),
        },
        {
            key: 'email',
            header: 'Email',
            render: (c) => (
                <span className="text-sm">{c.email || <span className="text-[var(--color-muted)]">—</span>}</span>
            ),
        },
        {
            key: 'store_credit',
            header: 'Store Credit',
            width: '120px',
            sortable: true,
            render: (c) => (
                <span className="text-sm font-medium text-[var(--color-success)]">
                    {formatCurrency(Number(c.store_credit || 0))}
                </span>
            ),
        },
        {
            key: 'created_at',
            header: 'Added',
            width: '120px',
            sortable: true,
            render: (c) => (
                <span className="text-sm text-[var(--color-muted)]">{formatDate(c.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            header: '',
            width: '140px',
            render: (c) => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setCreditTarget(c);
                            setCreditAmount('');
                            setCreditError(null);
                        }}
                        className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-success)] transition-colors"
                        title="Add Store Credit"
                    >
                        <CreditIcon />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleViewOrders(c);
                        }}
                        className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
                        title="View Orders"
                    >
                        <ReceiptIcon />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(c);
                        }}
                        className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                        title="Edit"
                    >
                        <EditIcon />
                    </button>
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
                </div>
            ),
        },
    ];

    const totalSpent = orderHistory.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = orderHistory.length;

    return (
        <div className="animate-fadeIn">
            <Header
                title="Customers"
                description="Manage customer accounts and view order history."
                actions={
                    <Button onClick={() => setIsAddModalOpen(true)}>
                        <PlusIcon />
                        Add Customer
                    </Button>
                }
            />

            {customers.length === 0 && !isLoading ? (
                <EmptyState
                    icon={<CustomersIcon />}
                    title="No customers yet"
                    description="Customers are created when you assign them to a sale at checkout."
                    action={
                        <Button onClick={() => setIsAddModalOpen(true)}>
                            <PlusIcon />
                            Add Customer
                        </Button>
                    }
                />
            ) : (
                <Table
                    data={customers}
                    columns={columns}
                    keyExtractor={(c) => c.id}
                    searchable
                    searchPlaceholder="Search customers..."
                    searchKeys={['name', 'email', 'phone']}
                    onRowClick={openEditModal}
                    isLoading={isLoading}
                    emptyMessage="No customers found"
                />
            )}

            {/* Add Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => { setIsAddModalOpen(false); resetForm(); }}
                title="Add Customer"
                size="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Name *"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Customer name"
                    />
                    <Input
                        label="Phone"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value || null })}
                        placeholder="(555) 123-4567"
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value || null })}
                        placeholder="customer@example.com"
                    />
                    <Input
                        label="Notes"
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value || null })}
                        placeholder="Optional notes..."
                    />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => { setIsAddModalOpen(false); resetForm(); }}>
                        Cancel
                    </Button>
                    <Button onClick={handleAdd} disabled={!formData.name.trim()}>
                        Add Customer
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={!!editTarget}
                onClose={() => { setEditTarget(null); resetForm(); }}
                title="Edit Customer"
                size="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Name *"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Customer name"
                    />
                    <Input
                        label="Phone"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value || null })}
                        placeholder="(555) 123-4567"
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value || null })}
                        placeholder="customer@example.com"
                    />
                    <Input
                        label="Notes"
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value || null })}
                        placeholder="Optional notes..."
                    />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => { setEditTarget(null); resetForm(); }}>
                        Cancel
                    </Button>
                    <Button onClick={handleEdit} disabled={!formData.name.trim()}>
                        Save Changes
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Customer"
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? Their order history will be preserved but unlinked. This action cannot be undone.
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

            {/* Add Store Credit Modal */}
            <Modal
                isOpen={!!creditTarget}
                onClose={() => { setCreditTarget(null); setCreditAmount(''); setCreditError(null); }}
                title={`Add Store Credit - ${creditTarget?.name || ''}`}
                size="sm"
            >
                <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-[var(--color-surface)]">
                        <p className="text-xs text-[var(--color-muted)]">Current Balance</p>
                        <p className="text-xl font-semibold text-[var(--color-success)]">
                            {formatCurrency(Number(creditTarget?.store_credit || 0))}
                        </p>
                    </div>
                    <Input
                        label="Credit Amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        placeholder="0.00"
                    />
                    {creditError && (
                        <p className="text-sm text-[var(--color-danger)]">{creditError}</p>
                    )}
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => { setCreditTarget(null); setCreditAmount(''); setCreditError(null); }}>
                        Cancel
                    </Button>
                    <Button onClick={handleAddCredit} isLoading={isApplyingCredit}>
                        Add Credit
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Order History Modal */}
            <Modal
                isOpen={!!viewOrdersCustomer}
                onClose={() => {
                    setViewOrdersCustomer(null);
                    setOrderHistory([]);
                    setSelectedOrder(null);
                    setOrderHistoryError(null);
                }}
                title={`Order History - ${viewOrdersCustomer?.name}`}
                size="lg"
            >
                {isLoadingOrders ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                    </div>
                ) : orderHistoryError ? (
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--color-danger)]">{orderHistoryError}</p>
                        {viewOrdersCustomer && (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => loadOrdersForCustomer(viewOrdersCustomer.id)}
                            >
                                Refresh Orders
                            </Button>
                        )}
                    </div>
                ) : orderHistory.length === 0 ? (
                    <div className="text-center py-8 text-[var(--color-muted)]">
                        <p>No orders yet</p>
                    </div>
                ) : selectedOrder ? (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs text-[var(--color-muted)]">Receipt #</p>
                                <p className="font-mono font-semibold">{selectedOrder.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-[var(--color-muted)]">Date</p>
                                <p className="text-sm">{new Date(selectedOrder.completed_at).toLocaleString()}</p>
                            </div>
                        </div>

                        {(selectedOrder.refund_status === 'partial' || selectedOrder.refund_status === 'full') && (
                            <div className="rounded-lg bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/30 p-3">
                                <p className="text-sm font-medium">
                                    {selectedOrder.refund_status === 'full' ? 'Fully refunded' : 'Partially refunded'}
                                </p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-sm font-semibold mb-2">Items</h4>
                            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-[var(--color-surface)]">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-medium">Item</th>
                                            <th className="text-center px-3 py-2 font-medium">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium">Unit</th>
                                            <th className="text-right px-3 py-2 font-medium">Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedOrder.sale_items.map((item) => {
                                            const lineDiscount = Number(item.discount_amount || 0);
                                            const lineTotal = Number(item.price) * item.quantity - lineDiscount;
                                            return (
                                                <tr key={item.id} className="border-t border-[var(--color-border)]">
                                                    <td className="px-3 py-2">
                                                        <p>{item.name}</p>
                                                        <p className="text-xs text-[var(--color-muted)] font-mono">{item.sku}</p>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">{item.quantity}</td>
                                                    <td className="px-3 py-2 text-right">{formatCurrency(Number(item.price))}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        {formatCurrency(lineTotal)}
                                                        {lineDiscount > 0 && (
                                                            <p className="text-xs text-[var(--color-muted)]">(-{formatCurrency(lineDiscount)} discount)</p>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-lg bg-[var(--color-surface)] p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                <span>{formatCurrency(selectedOrder.subtotal)}</span>
                            </div>
                            {(selectedOrder.discount_total || 0) > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--color-muted)]">Discounts</span>
                                    <span>-{formatCurrency(selectedOrder.discount_total || 0)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Tax</span>
                                <span>{formatCurrency(selectedOrder.tax_amount)}</span>
                            </div>
                            <div className="flex justify-between font-semibold pt-2 border-t border-[var(--color-border)]">
                                <span>Total</span>
                                <span>{formatCurrency(selectedOrder.total)}</span>
                            </div>
                        </div>

                        <div className="rounded-lg border border-[var(--color-border)] p-4">
                            <p className="text-xs text-[var(--color-muted)] mb-1">Payment</p>
                            <p className="font-medium">
                                {selectedOrder.payment_method === 'cash'
                                    ? 'Cash'
                                    : selectedOrder.payment_method === 'check'
                                        ? 'Check'
                                        : 'Card'}
                            </p>
                            {selectedOrder.payment_method === 'cash' && (
                                <p className="text-sm text-[var(--color-muted)] mt-1">
                                    Tendered: {formatCurrency(selectedOrder.cash_tendered || 0)}
                                    {' • '}
                                    Change: {formatCurrency(selectedOrder.change_given || 0)}
                                </p>
                            )}
                            {selectedOrder.payment_method === 'check' && (
                                <p className="text-sm text-[var(--color-muted)] mt-1">
                                    Check #: {selectedOrder.check_number || 'N/A'}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {viewOrdersCustomer && (
                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => loadOrdersForCustomer(viewOrdersCustomer.id)}
                                >
                                    Refresh Orders
                                </Button>
                            </div>
                        )}

                        {/* Summary */}
                        <div className="flex gap-4 p-4 bg-[var(--color-surface)] rounded-lg">
                            <div className="flex-1 text-center">
                                <p className="text-xs text-[var(--color-muted)] uppercase">Total Orders</p>
                                <p className="text-xl font-bold">{totalOrders}</p>
                            </div>
                            <div className="flex-1 text-center">
                                <p className="text-xs text-[var(--color-muted)] uppercase">Total Spent</p>
                                <p className="text-xl font-bold text-[var(--color-primary)]">{formatCurrency(totalSpent)}</p>
                            </div>
                        </div>

                        {/* Orders List */}
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {orderHistory.map((order) => (
                                <div key={order.id} className="border border-[var(--color-border)] rounded-lg p-4">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <button
                                                onClick={() => setSelectedOrder(order)}
                                                className="font-mono text-xs text-[var(--color-primary)] hover:underline"
                                                title="View full receipt"
                                            >
                                                #{order.id.slice(0, 8)}
                                            </button>
                                            <p className="text-sm">
                                                {new Date(order.completed_at).toLocaleDateString()} at{' '}
                                                {new Date(order.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <p className="font-semibold">{formatCurrency(order.total)}</p>
                                    </div>
                                    <div className="space-y-1">
                                        {order.sale_items.map((item) => (
                                            <div key={item.id} className="flex justify-between text-sm text-[var(--color-muted)]">
                                                <span>{item.quantity}x {item.name}</span>
                                                <span>{formatCurrency(item.price * item.quantity)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <ModalFooter>
                    {selectedOrder ? (
                        <Button variant="ghost" onClick={() => setSelectedOrder(null)}>
                            Back to Orders
                        </Button>
                    ) : null}
                    <Button variant="secondary" onClick={() => {
                        setViewOrdersCustomer(null);
                        setOrderHistory([]);
                        setSelectedOrder(null);
                        setOrderHistoryError(null);
                    }}>
                        {selectedOrder ? 'Close Receipt' : 'Close'}
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

function EditIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    );
}

function ReceiptIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

function CreditIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
            <path d="M7 15h.01M11 15h2" />
        </svg>
    );
}

function CustomersIcon() {
    return (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}
