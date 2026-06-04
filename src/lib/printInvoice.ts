import type { Invoice, InvoiceItem } from '../types';

type PrintableInvoiceItem = Pick<InvoiceItem, 'name' | 'quantity' | 'price'> & {
    sku?: string | null;
    line_total?: number;
    lineTotal?: number;
};

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(Number(value || 0));
}

function formatInvoiceNumber(invoiceId: string): string {
    return invoiceId.slice(0, 8).toUpperCase();
}

function getStatusLabel(invoice: Invoice): string {
    if (invoice.status === 'paid') return 'Paid';
    if (invoice.status === 'partially_paid') return 'Partially Paid';
    return 'Unpaid';
}

export function buildInvoicePrintHtml(invoice: Invoice, items: PrintableInvoiceItem[]): string {
    const invoiceNumber = formatInvoiceNumber(invoice.id);
    const amountPaid = Number(invoice.amount_paid || 0);
    const total = Number(invoice.total || 0);
    const balanceDue = Math.max(0, total - amountPaid);
    const statusLabel = getStatusLabel(invoice);
    const itemRows = items.map((item) => `
        <tr>
            <td>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.sku ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>` : ''}
            </td>
            <td class="center">${Number(item.quantity)}</td>
            <td class="right">${formatCurrency(Number(item.price))}</td>
            <td class="right">${formatCurrency(Number(item.line_total ?? item.lineTotal ?? 0))}</td>
        </tr>
    `).join('');

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Invoice #${escapeHtml(invoiceNumber)} - Ravenlia</title>
    <style>
        * { box-sizing: border-box; }
        body { color: #17202a; font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 36px; }
        h1, p { margin: 0; }
        .header { align-items: flex-start; display: flex; justify-content: space-between; margin-bottom: 36px; }
        .brand { font-size: 25px; font-weight: 800; letter-spacing: 0.14em; }
        .tagline { color: #667085; font-size: 10px; margin-top: 5px; }
        .invoice-title { font-size: 28px; font-weight: 700; letter-spacing: 0.05em; text-align: right; }
        .invoice-number { color: #667085; font-family: 'Courier New', monospace; margin-top: 5px; text-align: right; }
        .status { border: 1px solid #98a2b3; border-radius: 999px; display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; margin-top: 10px; padding: 4px 9px; text-transform: uppercase; }
        .meta { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; margin-bottom: 28px; }
        .meta-card { border-top: 2px solid #17202a; padding-top: 9px; }
        .label { color: #667085; display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 5px; text-transform: uppercase; }
        .recipient { font-size: 16px; font-weight: 700; }
        .recipient-detail { color: #667085; margin-top: 4px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #f2f4f7; color: #475467; font-size: 9px; letter-spacing: 0.06em; padding: 8px; text-align: left; text-transform: uppercase; }
        td { border-bottom: 1px solid #e4e7ec; padding: 10px 8px; vertical-align: top; }
        .right { text-align: right; }
        .center { text-align: center; }
        .muted { color: #667085; font-size: 10px; margin-top: 3px; }
        .summary { margin-left: auto; margin-top: 22px; width: 280px; }
        .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .summary-row.total { border-top: 2px solid #17202a; font-size: 15px; font-weight: 700; margin-top: 5px; padding-top: 9px; }
        .summary-row.balance { font-size: 14px; font-weight: 700; }
        .note { background: #f8fafc; border: 1px solid #e4e7ec; margin-top: 28px; padding: 12px; white-space: pre-wrap; }
        .payment-note { border-top: 1px solid #e4e7ec; color: #475467; margin-top: 28px; padding-top: 14px; }
        .footer { color: #98a2b3; font-size: 9px; margin-top: 36px; text-align: center; }
        @media print {
            body { padding: 0; }
            @page { margin: 0.55in; size: letter; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="brand">RAVENLIA</div>
            <div class="tagline">From the hands of artisans to the heart of community.</div>
        </div>
        <div>
            <h1 class="invoice-title">INVOICE</h1>
            <p class="invoice-number">#${escapeHtml(invoiceNumber)}</p>
            <div class="right"><span class="status">${escapeHtml(statusLabel)}</span></div>
        </div>
    </div>

    <div class="meta">
        <div class="meta-card">
            <span class="label">Bill To</span>
            <p class="recipient">${escapeHtml(invoice.recipient_name)}</p>
            <p class="recipient-detail">${invoice.recipient_type === 'vendor' ? 'Vendor' : 'Customer'}</p>
            ${invoice.recipient_email ? `<p class="recipient-detail">${escapeHtml(invoice.recipient_email)}</p>` : ''}
        </div>
        <div class="meta-card">
            <span class="label">Invoice Details</span>
            <p><strong>Issued:</strong> ${escapeHtml(new Date(invoice.created_at).toLocaleDateString())}</p>
            ${invoice.paid_at ? `<p class="recipient-detail"><strong>Paid:</strong> ${escapeHtml(new Date(invoice.paid_at).toLocaleDateString())}</p>` : ''}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th class="center">Qty</th>
                <th class="right">Unit Price</th>
                <th class="right">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows || '<tr><td colspan="4" class="muted">No items found.</td></tr>'}
        </tbody>
    </table>

    <div class="summary">
        <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(Number(invoice.subtotal))}</span></div>
        <div class="summary-row"><span>Tax</span><span>${formatCurrency(Number(invoice.tax_amount))}</span></div>
        <div class="summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
        <div class="summary-row"><span>Amount Paid</span><span>${formatCurrency(amountPaid)}</span></div>
        <div class="summary-row balance"><span>Balance Due</span><span>${formatCurrency(balanceDue)}</span></div>
    </div>

    ${invoice.notes ? `<div class="note"><span class="label">Notes</span>${escapeHtml(invoice.notes)}</div>` : ''}

    <p class="payment-note">
        ${balanceDue > 0
        ? 'Please call us to pay with a card, or stop by in person to pay in person.'
        : 'This invoice has been paid in full. Thank you!'}
    </p>
    <p class="footer">Ravenlia.com</p>
</body>
</html>`;
}

export function printInvoice(invoice: Invoice, items: PrintableInvoiceItem[]): { success: boolean; error?: string } {
    try {
        const printWindow = window.open('', '_blank', 'width=900,height=760');
        if (!printWindow) {
            return { success: false, error: 'Unable to open the print window. Please allow popups and try again.' };
        }

        printWindow.document.write(buildInvoicePrintHtml(invoice, items));
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
        };
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unable to print invoice',
        };
    }
}
