import { describe, expect, it } from 'vitest';
import { buildPayoutStatementReportHtml } from '../../src/lib/completedPayoutReport';
import type { PayoutStatementData } from '../../src/types/payouts';

const statement = {
    payout: {
        id: 'eaf44172-aaaa-bbbb-cccc-123456789abc',
        consignor_id: 'vendor-1',
        amount: 9.99,
        status: 'paid',
        paid_at: '2026-07-17T12:00:00Z',
        payment_method: 'check',
        payment_reference: '2065',
        payment_date: '2026-07-17',
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        sales_count: 1,
        items_sold: 1,
        gross_sales: 14.99,
        tax_collected: 0,
        store_share: 3,
        credit_card_fees: 0,
        invoice_deduction: 2,
        original_amount_due: 11.99,
        is_partial: false,
        partial_reason: null,
        notes: null,
    },
    vendor: {
        id: 'vendor-1',
        consignor_number: 'KAR',
        name: 'Karen Higgins',
        business_name: 'Karen & Co',
        pay_to_name: 'Karen <Higgins>',
    },
    allocations: [{
        id: 'allocation-1',
        payout_id: 'eaf44172-aaaa-bbbb-cccc-123456789abc',
        sale_id: 'sale-1',
        sale_item_id: 'sale-item-1',
        consignor_id: 'vendor-1',
        sale_timestamp: '2026-05-02T12:00:00Z',
        sku: 'KAR-2603-011',
        item_name: '1940 Ford Pickup',
        quantity: 1,
        refunded_quantity: 0,
        unit_price: 14.99,
        gross_line_amount: 14.99,
        item_discount: 0,
        allocated_order_discount: 0,
        net_line_amount: 14.99,
        commission_percentage: 80,
        vendor_earnings_before_fees: 11.99,
        allocated_card_fee: 0,
        final_vendor_cut: 11.99,
        amount_settled: 11.99,
        remaining_amount_after: 0,
        created_at: '2026-07-17T12:00:00Z',
    }],
    adjustments: [{
        id: 'adjustment-1',
        payout_id: 'eaf44172-aaaa-bbbb-cccc-123456789abc',
        consignor_id: 'vendor-1',
        adjustment_type: 'invoice_deduction',
        amount: -2,
        description: 'Invoice #1001',
        source_table: 'invoices',
        source_reference: 'invoice-1',
        metadata: {},
        created_at: '2026-07-17T12:00:00Z',
    }],
    invoice_payments: [],
    is_exact: true,
} as unknown as PayoutStatementData;

describe('buildPayoutStatementReportHtml', () => {
    it('renders the defined completed payout report from immutable statement data', () => {
        const html = buildPayoutStatementReportHtml(statement);

        expect(html).toContain('Completed Vendor Payout Report');
        expect(html).toContain('Karen &amp; Co');
        expect(html).toContain('Pay To: Karen &lt;Higgins&gt;');
        expect(html).toContain('1940 Ford Pickup');
        expect(html).toContain('KAR-2603-011');
        expect(html).toContain('80.00%');
        expect(html).toContain('Invoice #1001');
        expect(html).toContain('Recorded Payout');
        expect(html).toContain('$9.99');
    });

    it('does not include admin page chrome in the printable document', () => {
        const html = buildPayoutStatementReportHtml(statement);

        expect(html).not.toContain('Admin navigation');
        expect(html).not.toContain('Go to…');
        expect(html).not.toContain('Void');
    });
});
