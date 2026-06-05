import { describe, expect, it } from 'vitest';
import {
    buildConsignorTaxDetailCsvRows,
    buildConsignorTaxReportFromData,
    buildConsignorTaxSummaryCsvRows,
    getDefaultConsignorTaxReviewThreshold,
    type CompletedPayoutSaleLine,
    type ConsignorReportData,
} from '../../src/lib/consignorReports';
import type { Consignor, Payout } from '../../src/types';

function buildConsignor(overrides: Partial<Consignor> = {}): Consignor {
    return {
        id: 'consignor-1',
        consignor_number: 'C001',
        name: 'Willow Goods',
        first_name: 'Aly',
        last_name: 'Willow',
        business_name: 'Willow Goods LLC',
        pay_to_type: 'business',
        has_w9_filled_out: true,
        booth_location: 'A1',
        booth_square_feet: null,
        booth_cost_per_square_foot: null,
        email: 'aly@example.com',
        phone: '555-0100',
        address: '100 Main St',
        address_line_2: null,
        city: 'Lancaster',
        state: 'PA',
        postal_code: '17603',
        country: 'US',
        notes: null,
        commission_split: 0.6,
        consignor_pays_card_fee: true,
        dealer_discount_percent: 0,
        monthly_booth_rent: 0,
        scheduled_active_date: null,
        is_active: true,
        storefront_display_name: null,
        storefront_slug: null,
        storefront_description: null,
        storefront_logo_url: null,
        storefront_header_image_url: null,
        storefront_show_items: true,
        storefront_images_only: false,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function buildSaleLine(overrides: Partial<CompletedPayoutSaleLine> = {}): CompletedPayoutSaleLine {
    return {
        saleItemId: 'sale-item-1',
        saleDate: '2025-03-15T15:00:00.000Z',
        saleId: 'sale-1',
        sku: 'C001-001',
        itemName: 'Vintage Jacket',
        quantity: 2,
        refundedQuantity: 1,
        unitPrice: 50,
        lineTotal: 85,
        commissionSplit: 0.6,
        consignorShare: 50,
        storeShare: 34,
        taxAmount: 5.1,
        creditCardFee: 1,
        ...overrides,
    };
}

function buildPayout(overrides: Partial<Payout> = {}): Payout {
    return {
        id: 'payout-1',
        consignor_id: 'consignor-1',
        amount: 45,
        period_start: '2025-03-01T00:00:00.000Z',
        period_end: '2025-03-31T23:59:59.000Z',
        sales_count: 1,
        items_sold: 1,
        gross_sales: 85,
        tax_collected: 5.1,
        store_share: 34,
        credit_card_fees: 1,
        booth_rent_deduction: 3,
        marketing_fee_deduction: 2,
        ledger_deduction: 4,
        invoice_deduction: 1,
        notes: 'March payout',
        paid_at: '2025-04-01T12:00:00.000Z',
        created_at: '2025-04-01T12:00:00.000Z',
        original_amount_due: 55,
        is_partial: true,
        partial_reason: 'Held balance',
        balance_disposition: 'deferred',
        ...overrides,
    };
}

function buildReportData(overrides: Partial<ConsignorReportData> = {}): ConsignorReportData {
    return {
        totalsByConsignor: new Map(),
        linesByConsignor: new Map(),
        inventoryByConsignor: new Map(),
        payoutsByConsignor: new Map(),
        boothRentPaymentsByConsignor: new Map(),
        ...overrides,
    };
}

describe('consignor tax reports', () => {
    it('includes all consignors while filtering sales by sale date and payouts by paid date', () => {
        const activeConsignor = buildConsignor();
        const inactiveNoActivityConsignor = buildConsignor({
            id: 'consignor-2',
            consignor_number: 'C002',
            name: 'No Activity Vendor',
            business_name: null,
            has_w9_filled_out: false,
            is_active: false,
        });
        const report = buildConsignorTaxReportFromData(
            [activeConsignor, inactiveNoActivityConsignor],
            buildReportData({
                linesByConsignor: new Map([
                    [
                        activeConsignor.id,
                        [
                            buildSaleLine(),
                            buildSaleLine({
                                saleItemId: 'sale-item-outside',
                                saleDate: '2024-12-31T23:00:00.000Z',
                                saleId: 'sale-outside',
                                lineTotal: 100,
                                consignorShare: 60,
                            }),
                        ],
                    ],
                ]),
                payoutsByConsignor: new Map([
                    [
                        activeConsignor.id,
                        [
                            buildPayout(),
                            buildPayout({
                                id: 'payout-outside',
                                amount: 999,
                                paid_at: '2026-01-02T00:00:00.000Z',
                            }),
                        ],
                    ],
                ]),
            }),
            {
                startDate: '2025-01-01',
                endDate: '2025-12-31',
                reviewThreshold: 50,
                generatedAt: new Date('2026-01-15T00:00:00.000Z'),
            }
        );

        expect(report.rows).toHaveLength(2);
        expect(report.totals.consignorCount).toBe(2);
        expect(report.totals.missingW9Count).toBe(1);
        expect(report.totals.reviewCount).toBe(1);

        const activeRow = report.rows[0];
        expect(activeRow.salesTotals.salesCount).toBe(1);
        expect(activeRow.salesTotals.itemsSold).toBe(1);
        expect(activeRow.salesTotals.grossSales).toBe(85);
        expect(activeRow.salesTotals.consignorEarnings).toBe(50);
        expect(activeRow.salesTotals.cardFeesDeducted).toBe(1);
        expect(activeRow.payoutTotals.payoutCount).toBe(1);
        expect(activeRow.payoutTotals.totalPaid).toBe(45);
        expect(activeRow.payoutTotals.totalDeductions).toBe(10);
        expect(activeRow.earnedLessPaid).toBe(5);
        expect(activeRow.thresholdReview).toBe(true);
        expect(activeRow.thresholdBasis).toBe('Earnings met review amount');

        const inactiveRow = report.rows[1];
        expect(inactiveRow.missingW9).toBe(true);
        expect(inactiveRow.salesTotals.grossSales).toBe(0);
        expect(inactiveRow.payoutTotals.totalPaid).toBe(0);
    });

    it('exports summary and detail rows for accountant reconciliation', () => {
        const consignor = buildConsignor();
        const report = buildConsignorTaxReportFromData(
            [consignor],
            buildReportData({
                linesByConsignor: new Map([[consignor.id, [buildSaleLine()]]]),
                payoutsByConsignor: new Map([[consignor.id, [buildPayout()]]]),
            }),
            {
                startDate: '2025-01-01',
                endDate: '2025-12-31',
                reviewThreshold: getDefaultConsignorTaxReviewThreshold(2025),
                generatedAt: new Date('2026-01-15T00:00:00.000Z'),
            }
        );

        const summaryRows = buildConsignorTaxSummaryCsvRows(report);
        const detailRows = buildConsignorTaxDetailCsvRows(report);

        expect(summaryRows[0]).toContain('Consignor Earnings');
        expect(summaryRows[1]).toContain('Willow Goods LLC');
        expect(summaryRows[1]).toContain('50.00');
        expect(summaryRows[1]).toContain('45.00');
        expect(detailRows).toHaveLength(3);
        expect(detailRows[1][0]).toBe('Sale Line');
        expect(detailRows[2][0]).toBe('Payout');
    });

    it('uses the configured year defaults for review thresholds', () => {
        expect(getDefaultConsignorTaxReviewThreshold(2025)).toBe(600);
        expect(getDefaultConsignorTaxReviewThreshold(2026)).toBe(2000);
    });
});
