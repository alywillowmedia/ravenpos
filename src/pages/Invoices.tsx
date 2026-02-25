import { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Table, type Column } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useInvoices } from '../hooks/useInvoices';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { createInvoiceEmailDataFromItems } from '../lib/invoice';
import { InvoiceDeliveryModal } from '../components/invoice/InvoiceDeliveryModal';
import type { Invoice, InvoiceItem } from '../types';

export function Invoices() {
    const { fetchInvoices, fetchInvoiceItems, updateInvoiceStatus, isLoading } = useInvoices();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);

    const loadInvoices = async () => {
        const { data } = await fetchInvoices();
        setInvoices(data || []);
    };

    useEffect(() => {
        loadInvoices();
    }, []);

    const handleViewDetails = async (invoice: Invoice) => {
        setSelectedInvoice(invoice);
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
        }
    };

    const columns: Column<Invoice>[] = useMemo(() => [
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
            render: (invoice) => formatCurrency(Number(invoice.total)),
        },
        {
            key: 'status',
            header: 'Status',
            sortable: true,
            render: (invoice) => (
                <Badge variant={invoice.status === 'paid' ? 'success' : 'warning'}>
                    {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
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
                        onClick={() => handleTogglePaid(invoice)}
                    >
                        {invoice.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
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
                data={invoices}
                columns={columns}
                keyExtractor={(invoice) => invoice.id}
                searchable
                searchPlaceholder="Search invoices..."
                searchKeys={['recipient_name', 'recipient_email', 'status']}
                emptyMessage="No invoices found"
                isLoading={isLoading}
            />

            <Modal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                title="Invoice Details"
                size="lg"
            >
                {!selectedInvoice ? null : (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm text-[var(--color-muted)]">Recipient</p>
                                <p className="text-lg font-semibold">{selectedInvoice.recipient_name}</p>
                                <p className="text-xs text-[var(--color-muted)]">
                                    {selectedInvoice.recipient_type === 'vendor' ? 'Vendor' : 'Customer'}
                                </p>
                            </div>
                            <Badge variant={selectedInvoice.status === 'paid' ? 'success' : 'warning'}>
                                {selectedInvoice.status === 'paid' ? 'Paid' : 'Unpaid'}
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
                            <div className="flex justify-between text-base font-semibold pt-2 border-t border-dashed border-[var(--color-border)]">
                                <span>Total</span>
                                <span>{formatCurrency(Number(selectedInvoice.total))}</span>
                            </div>
                            <p className="text-xs text-[var(--color-muted)] pt-2">
                                Please call us to pay with a card, or stop by in person to pay in person.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => setIsDeliveryOpen(true)}>
                                Email Invoice
                            </Button>
                            <Button
                                variant={selectedInvoice.status === 'paid' ? 'secondary' : 'success'}
                                onClick={() => handleTogglePaid(selectedInvoice)}
                            >
                                {selectedInvoice.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <InvoiceDeliveryModal
                isOpen={isDeliveryOpen}
                onClose={() => setIsDeliveryOpen(false)}
                invoice={invoiceEmailData}
                recipientEmail={selectedInvoice?.recipient_email || null}
                recipientName={selectedInvoice?.recipient_name || null}
            />
        </div>
    );
}
