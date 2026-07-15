import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { useInvoices } from '../hooks/useInvoices';
import { formatCurrency, formatDateTime } from '../lib/utils';
import type { Invoice } from '../types';

const formatInvoiceNumber = (id: string) => id.slice(0, 8).toUpperCase();

export function Invoices() {
    const navigate = useNavigate();
    const { fetchInvoices, isLoading } = useInvoices();
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchInvoices().then(({ data }) => { if (!cancelled) setInvoices(data || []); });
        return () => { cancelled = true; };
    }, [fetchInvoices]);

    const columns = useMemo<Column<Invoice>[]>(() => [
        { key: 'id', header: 'Invoice #', sortable: true, render: (invoice) => <span className="font-mono text-sm">#{formatInvoiceNumber(invoice.id)}</span> },
        { key: 'created_at', header: 'Created', sortable: true, render: (invoice) => formatDateTime(invoice.created_at) },
        { key: 'recipient_name', header: 'Recipient', render: (invoice) => <div><p className="font-medium">{invoice.recipient_name}</p><p className="text-xs capitalize text-[var(--color-muted)]">{invoice.recipient_type}</p></div> },
        { key: 'total', header: 'Total', sortable: true, render: (invoice) => <div><p>{formatCurrency(Number(invoice.total))}</p><p className="text-xs text-[var(--color-muted)]">{formatCurrency(Number(invoice.amount_paid || 0))} paid</p></div> },
        { key: 'status', header: 'Status', sortable: true, render: (invoice) => <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'partially_paid' ? 'info' : 'warning'}>{invoice.status.replace('_', ' ')}</Badge> },
        { key: 'actions', header: 'Actions', render: (invoice) => <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/finances/invoices/${invoice.id}`)}>{invoice.status === 'paid' ? 'View ledger' : 'Review & collect'}</Button> },
    ], [navigate]);

    return <div className="space-y-6"><Header title="Invoices" description="Open each invoice to review its append-only payment ledger and linked payouts." /><Table ariaLabel="Invoices" data={invoices} columns={columns} keyExtractor={(invoice) => invoice.id} searchable searchPlaceholder="Search invoices..." searchKeys={['id', 'recipient_name', 'recipient_email', 'status']} emptyMessage="No invoices found" isLoading={isLoading} /></div>;
}
