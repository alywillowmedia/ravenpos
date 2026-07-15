import { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Table, type Column } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Select } from '../components/ui/Select';
import { useInvoices } from '../hooks/useInvoices';
import { useCustomers } from '../hooks/useCustomers';
import { useConsignors } from '../hooks/useConsignors';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { getConsignorDisplayName } from '../lib/consignors';
import { createInvoiceEmailDataFromItems } from '../lib/invoice';
import { printInvoice } from '../lib/printInvoice';
import { InvoiceDeliveryModal } from '../components/invoice/InvoiceDeliveryModal';
import { useToast } from '../contexts/ToastContext';
import type { Invoice, InvoiceItem, InvoiceRecipientType } from '../types';

const formatInvoiceNumber = (invoiceId: string) => invoiceId.slice(0, 8).toUpperCase();

const getInvoiceStatusLabel = (invoice: Invoice) => {
    if (invoice.status === 'paid') return 'Paid';
    if (invoice.status === 'partially_paid') return 'Partially Paid';
    return 'Unpaid';
};

const getInvoiceStatusVariant = (invoice: Invoice): 'success' | 'info' | 'warning' => {
    if (invoice.status === 'paid') return 'success';
    if (invoice.status === 'partially_paid') return 'info';
    return 'warning';
};

const getInvoiceBalanceDue = (invoice: Invoice) =>
    Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0));

export function Invoices() {
    const {
        fetchInvoices,
        fetchInvoiceItems,
        updateInvoiceRecipient,
        updateInvoiceStatus,
        applyInvoicePayment,
        isLoading,
    } = useInvoices();
    const { customers, isLoading: isLoadingCustomers } = useCustomers();
    const { consignors, isLoading: isLoadingConsignors } = useConsignors();
    const toast = useToast();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
    const [collectingInvoice, setCollectingInvoice] = useState<Invoice | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isApplyingPayment, setIsApplyingPayment] = useState(false);
    const [recipientEditorInvoice, setRecipientEditorInvoice] = useState<Invoice | null>(null);
    const [recipientType, setRecipientType] = useState<InvoiceRecipientType>('customer');
    const [recipientId, setRecipientId] = useState('');
    const [recipientError, setRecipientError] = useState<string | null>(null);
    const [isUpdatingRecipient, setIsUpdatingRecipient] = useState(false);

    const loadInvoices = async () => {
        const { data } = await fetchInvoices();
        setInvoices(data || []);
    };

    useEffect(() => {
        loadInvoices();
    }, []);

    const handleViewDetails = async (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setPaymentAmount('');
        setPaymentError(null);
        setIsDetailsOpen(true);
        setIsLoadingDetails(true);
        const { data } = await fetchInvoiceItems(invoice.id);
        setSelectedItems(data || []);
        setIsLoadingDetails(false);
    };

    const handleTogglePaid = async (invoice: Invoice) => {
        const nextStatus = invoice.status === 'paid' ? 'unpaid' : 'paid';
        const { data } = await updateInvoiceStatus(invoice.id, nextStatus);
        if (data) {
            setInvoices((prev) => prev.map((item) => (item.id === data.id ? data : item)));
            if (selectedInvoice?.id === data.id) {
                setSelectedInvoice(data);
            }
            if (collectingInvoice?.id === data.id) {
                setCollectingInvoice(data);
            }
        }
    };

    const handlePrintInvoice = () => {
        if (!selectedInvoice || isLoadingDetails) return;

        const result = printInvoice(selectedInvoice, selectedItems);
        if (result.success) {
            toast.success('Print dialog opened', `Invoice #${formatInvoiceNumber(selectedInvoice.id)} is ready to print.`);
        } else {
            toast.error('Unable to print invoice', result.error || 'Please try again.');
        }
    };

    const openCollectPayment = (invoice: Invoice) => {
        const balanceDue = getInvoiceBalanceDue(invoice);
        setCollectingInvoice(invoice);
        setPaymentAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
        setPaymentError(null);
    };

    const closeCollectPayment = () => {
        setCollectingInvoice(null);
        setPaymentAmount('');
        setPaymentError(null);
    };

    const handleApplyPayment = async () => {
        if (!collectingInvoice || isApplyingPayment) return;

        const amount = Number(paymentAmount);
        const balanceDue = getInvoiceBalanceDue(collectingInvoice);
        if (!Number.isFinite(amount) || amount <= 0) {
            setPaymentError('Enter a payment amount greater than 0.');
            return;
        }
        if (amount > balanceDue) {
            setPaymentError(`Payment cannot exceed the remaining balance of ${formatCurrency(balanceDue)}.`);
            return;
        }

        setIsApplyingPayment(true);
        setPaymentError(null);
        const { data, error } = await applyInvoicePayment(collectingInvoice.id, amount);
        if (data) {
            setInvoices((prev) => prev.map((item) => (item.id === data.id ? data : item)));
            if (selectedInvoice?.id === data.id) {
                setSelectedInvoice(data);
            }
            closeCollectPayment();
        } else {
            setPaymentError(error || 'Failed to apply payment.');
        }
        setIsApplyingPayment(false);
    };

    const openRecipientEditor = (invoice: Invoice) => {
        setRecipientEditorInvoice(invoice);
        setRecipientType(invoice.recipient_type);
        setRecipientId(invoice.recipient_type === 'customer'
            ? invoice.customer_id || ''
            : invoice.consignor_id || '');
        setRecipientError(null);
    };

    const closeRecipientEditor = () => {
        setRecipientEditorInvoice(null);
        setRecipientId('');
        setRecipientError(null);
    };

    const handleUpdateRecipient = async () => {
        if (!recipientEditorInvoice || !recipientId || isUpdatingRecipient) return;

        const recipient = recipientType === 'customer'
            ? customers.find((customer) => customer.id === recipientId)
            : consignors.find((consignor) => consignor.id === recipientId);

        if (!recipient) {
            setRecipientError(`Select a valid ${recipientType}.`);
            return;
        }

        setIsUpdatingRecipient(true);
        setRecipientError(null);
        const recipientName = recipientType === 'customer'
            ? recipient.name
            : getConsignorDisplayName(recipient);
        const { data, error } = await updateInvoiceRecipient(recipientEditorInvoice.id, {
            recipientType,
            recipientId,
            recipientName,
            recipientEmail: recipient.email,
        });

        if (data) {
            setInvoices((prev) => prev.map((invoice) => (invoice.id === data.id ? data : invoice)));
            if (selectedInvoice?.id === data.id) {
                setSelectedInvoice(data);
            }
            if (collectingInvoice?.id === data.id) {
                setCollectingInvoice(data);
            }
            closeRecipientEditor();
            toast.success('Invoice recipient updated', `${recipientName} is now assigned to this invoice.`);
        } else {
            setRecipientError(error || 'Failed to update invoice recipient.');
        }
        setIsUpdatingRecipient(false);
    };

    const recipientOptions = recipientType === 'customer'
        ? customers.map((customer) => ({
            value: customer.id,
            label: `${customer.name}${customer.email ? ` - ${customer.email}` : ''}`,
        }))
        : consignors.map((consignor) => ({
            value: consignor.id,
            label: `${consignor.consignor_number} - ${getConsignorDisplayName(consignor)}${consignor.is_active ? '' : ' (Inactive)'}`,
        }));

    const columns: Column<Invoice>[] = useMemo(() => [
        {
            key: 'id',
            header: 'Invoice #',
            sortable: true,
            render: (invoice) => (
                <span className="font-mono text-sm">#{formatInvoiceNumber(invoice.id)}</span>
            ),
        },
        {
            key: 'created_at',
            header: 'Created',
            sortable: true,
            render: (invoice) => formatDateTime(invoice.created_at),
        },
        {
            key: 'recipient_name',
            header: 'Recipient',
            render: (invoice) => (
                <div>
                    <p className="font-medium">{invoice.recipient_name}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                        {invoice.recipient_type === 'vendor' ? 'Vendor' : 'Customer'}
                    </p>
                </div>
            ),
        },
        {
            key: 'total',
            header: 'Total',
            sortable: true,
            render: (invoice) => (
                <div className="text-right sm:text-left">
                    <p>{formatCurrency(Number(invoice.total))}</p>
                    {Number(invoice.amount_paid || 0) > 0 && (
                        <p className="text-xs text-[var(--color-muted)]">
                            {formatCurrency(Number(invoice.amount_paid || 0))} paid
                        </p>
                    )}
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            sortable: true,
            render: (invoice) => (
                <Badge variant={getInvoiceStatusVariant(invoice)}>
                    {getInvoiceStatusLabel(invoice)}
                </Badge>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (invoice) => (
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleViewDetails(invoice)}>
                        View
                    </Button>
                    <Button
                        size="sm"
                        variant={invoice.status === 'paid' ? 'secondary' : 'success'}
                        onClick={() => invoice.status === 'paid' ? handleTogglePaid(invoice) : openCollectPayment(invoice)}
                    >
                        {invoice.status === 'paid' ? 'Mark Unpaid' : 'Collect Payment'}
                    </Button>
                </div>
            ),
        },
    ], [selectedInvoice]);

    const invoiceEmailData = selectedInvoice
        ? createInvoiceEmailDataFromItems(selectedInvoice, selectedItems)
        : null;

    return (
        <div className="space-y-6">
            <Header title="Invoices" />

            <Table
                ariaLabel="Invoices"
                data={invoices}
                columns={columns}
                keyExtractor={(invoice) => invoice.id}
                searchable
                searchPlaceholder="Search invoices..."
                searchKeys={['id', 'recipient_name', 'recipient_email', 'status']}
                emptyMessage="No invoices found"
                isLoading={isLoading}
            />

            <Modal
                isOpen={isDetailsOpen}
                onClose={() => {
                    setIsDetailsOpen(false);
                    setPaymentAmount('');
                    setPaymentError(null);
                }}
                title="Invoice Details"
                size="lg"
            >
                {!selectedInvoice ? null : (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm text-[var(--color-muted)]">Invoice #</p>
                                    <p className="font-mono text-lg font-semibold">#{formatInvoiceNumber(selectedInvoice.id)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-[var(--color-muted)]">Recipient</p>
                                    <p className="text-lg font-semibold">{selectedInvoice.recipient_name}</p>
                                    <p className="text-xs text-[var(--color-muted)]">
                                        {selectedInvoice.recipient_type === 'vendor' ? 'Vendor' : 'Customer'}
                                    </p>
                                </div>
                            </div>
                            <Badge variant={getInvoiceStatusVariant(selectedInvoice)}>
                                {getInvoiceStatusLabel(selectedInvoice)}
                            </Badge>
                        </div>

                        <div className="rounded-lg border border-[var(--color-border)]">
                            <div className="p-3 border-b border-[var(--color-border)] text-sm font-medium">Items</div>
                            {isLoadingDetails ? (
                                <div className="p-4 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                                    <LoadingSpinner size={16} />
                                    Loading items...
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--color-border)]">
                                    {selectedItems.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-3">
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    {item.quantity} × {formatCurrency(Number(item.price))}
                                                </p>
                                            </div>
                                            <div className="font-medium">{formatCurrency(Number(item.line_total))}</div>
                                        </div>
                                    ))}
                                    {selectedItems.length === 0 && (
                                        <div className="p-4 text-sm text-[var(--color-muted)]">No items found.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                <span>{formatCurrency(Number(selectedInvoice.subtotal))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)]">Tax</span>
                                <span>{formatCurrency(Number(selectedInvoice.tax_amount))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)]">Amount Paid</span>
                                <span>{formatCurrency(Number(selectedInvoice.amount_paid || 0))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)]">Balance Due</span>
                                <span>{formatCurrency(getInvoiceBalanceDue(selectedInvoice))}</span>
                            </div>
                            <div className="flex justify-between text-base font-semibold pt-2 border-t border-dashed border-[var(--color-border)]">
                                <span>Total</span>
                                <span>{formatCurrency(Number(selectedInvoice.total))}</span>
                            </div>
                            <p className="text-xs text-[var(--color-muted)] pt-2">
                                Please call us to pay with a card, or stop by in person to pay in person.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => openRecipientEditor(selectedInvoice)}>
                                Change Recipient
                            </Button>
                            <Button variant="secondary" onClick={() => setIsDeliveryOpen(true)}>
                                Email Invoice
                            </Button>
                            <Button variant="secondary" onClick={handlePrintInvoice} disabled={isLoadingDetails}>
                                Print Invoice
                            </Button>
                            <Button
                                variant={selectedInvoice.status === 'paid' ? 'secondary' : 'success'}
                                onClick={() => selectedInvoice.status === 'paid'
                                    ? handleTogglePaid(selectedInvoice)
                                    : openCollectPayment(selectedInvoice)}
                            >
                                {selectedInvoice.status === 'paid' ? 'Mark Unpaid' : 'Collect Payment'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={!!collectingInvoice}
                onClose={closeCollectPayment}
                title="Collect Payment"
                size="md"
            >
                {collectingInvoice && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm text-[var(--color-muted)]">Invoice #</p>
                                    <p className="font-mono text-lg font-semibold">
                                        #{formatInvoiceNumber(collectingInvoice.id)}
                                    </p>
                                </div>
                                <Badge variant={getInvoiceStatusVariant(collectingInvoice)}>
                                    {getInvoiceStatusLabel(collectingInvoice)}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-sm text-[var(--color-muted)]">Recipient</p>
                                <p className="font-medium">{collectingInvoice.recipient_name}</p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)]">Total</span>
                                <span>{formatCurrency(Number(collectingInvoice.total))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)]">Amount Paid</span>
                                <span>{formatCurrency(Number(collectingInvoice.amount_paid || 0))}</span>
                            </div>
                            <div className="flex justify-between text-base font-semibold pt-2 border-t border-dashed border-[var(--color-border)]">
                                <span>Balance Due</span>
                                <span>{formatCurrency(getInvoiceBalanceDue(collectingInvoice))}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium">Payment Amount</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">$</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        max={getInvoiceBalanceDue(collectingInvoice)}
                                        step="0.01"
                                        value={paymentAmount}
                                        onChange={(event) => setPaymentAmount(event.target.value)}
                                        placeholder={getInvoiceBalanceDue(collectingInvoice).toFixed(2)}
                                        className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={() => setPaymentAmount(getInvoiceBalanceDue(collectingInvoice).toFixed(2))}
                                >
                                    Full Balance
                                </Button>
                            </div>
                            {paymentError && (
                                <p className="text-xs text-[var(--color-danger)]">{paymentError}</p>
                            )}
                        </div>

                        <ModalFooter>
                            <Button variant="secondary" onClick={closeCollectPayment} disabled={isApplyingPayment}>
                                Cancel
                            </Button>
                            <Button
                                variant="success"
                                onClick={handleApplyPayment}
                                disabled={isApplyingPayment || !paymentAmount}
                            >
                                {isApplyingPayment ? 'Collecting...' : 'Collect Payment'}
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={!!recipientEditorInvoice}
                onClose={closeRecipientEditor}
                title="Change Invoice Recipient"
                description="Choose the customer or vendor responsible for this invoice."
                size="md"
            >
                {recipientEditorInvoice && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Recipient Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['customer', 'vendor'] as InvoiceRecipientType[]).map((type) => (
                                    <Button
                                        key={type}
                                        type="button"
                                        variant={recipientType === type ? 'primary' : 'secondary'}
                                        onClick={() => {
                                            setRecipientType(type);
                                            setRecipientId('');
                                            setRecipientError(null);
                                        }}
                                    >
                                        {type === 'customer' ? 'Customer' : 'Vendor'}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <Select
                            label={recipientType === 'customer' ? 'Customer' : 'Vendor'}
                            value={recipientId}
                            onChange={(event) => {
                                setRecipientId(event.target.value);
                                setRecipientError(null);
                            }}
                            options={recipientOptions}
                            placeholder={`Select a ${recipientType}...`}
                            disabled={recipientType === 'customer' ? isLoadingCustomers : isLoadingConsignors}
                            error={recipientError || undefined}
                        />

                        <ModalFooter>
                            <Button variant="secondary" onClick={closeRecipientEditor} disabled={isUpdatingRecipient}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleUpdateRecipient}
                                isLoading={isUpdatingRecipient}
                                disabled={!recipientId}
                            >
                                Save Recipient
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            <InvoiceDeliveryModal
                isOpen={isDeliveryOpen}
                onClose={() => setIsDeliveryOpen(false)}
                invoice={invoiceEmailData}
                recipientEmail={selectedInvoice?.recipient_email || null}
                recipientName={selectedInvoice?.recipient_name || null}
                onPrint={() => selectedInvoice
                    ? printInvoice(selectedInvoice, selectedItems)
                    : { success: false, error: 'Invoice details are unavailable.' }}
            />
        </div>
    );
}
