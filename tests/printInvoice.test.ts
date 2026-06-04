import { describe, expect, it } from 'vitest';
import type { Invoice, InvoiceItem } from '../src/types';
import { buildInvoicePrintHtml } from '../src/lib/printInvoice';

const invoice: Invoice = {
    id: '12345678-abcd-efgh-ijkl-123456789012',
    recipient_type: 'customer',
    customer_id: 'customer-1',
    consignor_id: null,
    recipient_name: 'Alex & Morgan',
    recipient_email: 'alex@example.com',
    status: 'partially_paid',
    subtotal: 100,
    tax_amount: 6,
    total: 106,
    amount_paid: 25,
    notes: 'Please call <today>.',
    paid_at: null,
    created_at: '2026-06-04T12:00:00.000Z',
    updated_at: '2026-06-04T12:00:00.000Z',
};

const items: InvoiceItem[] = [{
    id: 'item-1',
    invoice_id: invoice.id,
    item_id: 'inventory-item-1',
    consignor_id: 'vendor-1',
    sku: 'SKU<&>',
    name: 'Table <script>alert("x")</script>',
    price: 50,
    quantity: 2,
    line_total: 100,
    is_custom: false,
    created_at: '2026-06-04T12:00:00.000Z',
}];

describe('buildInvoicePrintHtml', () => {
    it('includes invoice status, payment totals, and line items', () => {
        const html = buildInvoicePrintHtml(invoice, items);

        expect(html).toContain('Partially Paid');
        expect(html).toContain('Amount Paid');
        expect(html).toContain('$25.00');
        expect(html).toContain('Balance Due');
        expect(html).toContain('$81.00');
        expect(html).toContain('SKU: SKU&lt;&amp;&gt;');
    });

    it('escapes recipient, item, and note text before printing', () => {
        const html = buildInvoicePrintHtml(invoice, items);

        expect(html).toContain('Alex &amp; Morgan');
        expect(html).toContain('Table &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
        expect(html).toContain('Please call &lt;today&gt;.');
        expect(html).not.toContain('<script>alert("x")</script>');
    });

    it('supports invoice items captured by the POS creation flow', () => {
        const html = buildInvoicePrintHtml(invoice, [{
            name: 'Custom item',
            quantity: 1,
            price: 12.5,
            lineTotal: 12.5,
        }]);

        expect(html).toContain('Custom item');
        expect(html).toContain('$12.50');
    });
});
