import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAllRowsMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/supabasePaging', () => ({ fetchAllRows: fetchAllRowsMock }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: rpcMock } }));

import {
    getCashTenderCents,
    getNetCashSaleCents,
    getPaymentBreakdownAmountCents,
    getRefundTenderAmountCents,
    getSaleTenderAmountCents,
} from '../../src/lib/cashReconciliation';
import { loadConsignorTaxReport } from '../../src/lib/consignorReports';
import { calculateTillAccountabilityMetrics } from '../../src/lib/tillAccountability';

// $100 of merchandise + $7 tax = $107, paid $50 store credit + $57 card.
const creditAndCardSale = {
    subtotal: 100,
    tax_amount: 7,
    total: 107,
    store_credit_used: 50,
    payment_method: 'split',
    payment_breakdown: [
        { method: 'store_credit', amount: 50, consignor_id: null },
        { method: 'card', amount: 57, card_last4: '4242' },
    ],
};

describe('cash reconciliation tenders', () => {
    it('never treats a store-credit-only sale as cash', () => {
        const sale = {
            total: 40,
            payment_method: 'store_credit',
            payment_breakdown: [{ method: 'store_credit', amount: 40 }],
        };

        expect(getNetCashSaleCents(sale)).toBe(0);
        expect(getSaleTenderAmountCents(sale, 'store_credit')).toBe(4000);
        expect(getSaleTenderAmountCents(sale, 'cash')).toBe(0);
    });

    it('reads older sales without a breakdown as one tender for the whole total', () => {
        const legacyCash = { total: 18, payment_method: 'cash', cash_tendered: 20, change_given: 2 };
        const legacyCard = { total: 18, payment_method: 'card' };

        expect(getNetCashSaleCents(legacyCash)).toBe(1800);
        expect(getCashTenderCents(legacyCash)).toEqual({ netCents: 1800, tenderedCents: 2000, changeCents: 200 });
        expect(getNetCashSaleCents(legacyCard)).toBe(0);
        expect(getSaleTenderAmountCents(legacyCard, 'card')).toBe(1800);
    });

    it('takes tendered and change from the cash entry of a mixed sale', () => {
        const sale = {
            total: 60,
            payment_method: 'split',
            payment_breakdown: [
                { method: 'gift_card', amount: 25, gift_card_id: 'gc-1', code_last4: '4F2A' },
                { method: 'cash', amount: 35, tendered: 40, change: 5 },
            ],
        };

        expect(getCashTenderCents(sale)).toEqual({ netCents: 3500, tenderedCents: 4000, changeCents: 500 });
        expect(getPaymentBreakdownAmountCents(sale, 'gift_card')).toBe(2500);
    });

    it('counts only the cash portion of a refund as cash out', () => {
        const splitRefund = {
            refund_amount: 30,
            payment_method: 'split',
            payment_breakdown: [
                { method: 'store_credit', amount: 12 },
                { method: 'cash', amount: 18 },
            ],
        };

        expect(getRefundTenderAmountCents(splitRefund, 'cash')).toBe(1800);
        expect(getRefundTenderAmountCents(splitRefund, 'store_credit')).toBe(1200);
        expect(getRefundTenderAmountCents({ refund_amount: 9, payment_method: 'cash' }, 'cash')).toBe(900);
        expect(getRefundTenderAmountCents({ refund_amount: 9, payment_method: 'card' }, 'cash')).toBe(0);
    });
});

describe('till accountability with store credit and gift cards', () => {
    it('keeps store credit out of cash and card and balances collected against received', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [creditAndCardSale],
            refunds: [],
            giftCardsSold: [],
        });

        expect(metrics.cashInDrawer).toBe(0);
        expect(metrics.creditCardsBatchTotal).toBe(57);
        expect(metrics.storeCreditRedeemed).toBe(50);
        expect(metrics.totalCollected).toBe(107);
        expect(metrics.totalReceived).toBe(107);
        expect(metrics.difference).toBe(0);
        expect(metrics.expectedCashFromSales).toBe(0);
    });

    it('counts gift card redemptions as received but not as drawer cash', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [{
                subtotal: 50,
                tax_amount: 0,
                total: 50,
                gift_card_used: 30,
                payment_method: 'split',
                payment_breakdown: [
                    { method: 'gift_card', amount: 30, gift_card_id: 'gc-1', code_last4: '9AB1' },
                    { method: 'cash', amount: 20, tendered: 20, change: 0 },
                ],
            }],
            refunds: [],
            giftCardsSold: [],
        });

        expect(metrics.giftCardRedeemed).toBe(30);
        expect(metrics.cashInDrawer).toBe(20);
        expect(metrics.expectedCashFromSales).toBe(20);
        expect(metrics.totalReceived).toBe(50);
        expect(metrics.difference).toBe(0);
    });

    it('puts gift cards sold for cash in the drawer and card ones in the card batch', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [],
            refunds: [],
            giftCardsSold: [
                { original_amount: 25, purchase_payment_method: 'cash' },
                { original_amount: 40, purchase_payment_method: 'card' },
            ],
            dealerCashPurchases: 5,
        });

        expect(metrics.giftCertificatesSold).toBe(65);
        expect(metrics.giftCardSalesCash).toBe(25);
        expect(metrics.giftCardSalesCard).toBe(40);
        expect(metrics.cashInDrawer).toBe(25);
        expect(metrics.creditCardsBatchTotal).toBe(40);
        expect(metrics.expectedCashFromSales).toBe(20);
        expect(metrics.difference).toBe(0);
    });

    it('takes refunded tax off sales tax instead of net sales', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [{
                subtotal: 100,
                tax_amount: 7,
                total: 107,
                payment_method: 'cash',
                payment_breakdown: [{ method: 'cash', amount: 107, tendered: 110, change: 3 }],
            }],
            refunds: [{
                refund_amount: 53.5,
                payment_method: 'cash',
                payment_breakdown: [{ method: 'cash', amount: 53.5 }],
                sale: { total: 107, tax_amount: 7, card_fee_amount: 0 },
            }],
            giftCardsSold: [],
        });

        expect(metrics.returns).toBe(50);
        expect(metrics.refundedTax).toBe(3.5);
        expect(metrics.netSales).toBe(50);
        expect(metrics.salesTax).toBe(3.5);
        expect(metrics.cashRefunds).toBe(53.5);
        expect(metrics.cashInDrawer).toBe(53.5);
        expect(metrics.totalCollected).toBe(53.5);
        expect(metrics.difference).toBe(0);
    });

    it('returns store credit to the credit bucket on a refund, not to cash', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [creditAndCardSale],
            refunds: [{
                refund_amount: 107,
                payment_method: 'split',
                payment_breakdown: [
                    { method: 'store_credit', amount: 50 },
                    { method: 'card', amount: 57 },
                ],
                sale: { total: 107, tax_amount: 7 },
            }],
            giftCardsSold: [],
        });

        expect(metrics.storeCreditRedeemed).toBe(0);
        expect(metrics.creditCardsBatchTotal).toBe(0);
        expect(metrics.cashRefunds).toBe(0);
        expect(metrics.totalCollected).toBe(0);
        expect(metrics.difference).toBe(0);
    });

    it('adds unsynced offline cash to expected drawer cash only', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [],
            refunds: [],
            giftCardsSold: [],
            offlineUnsyncedCashSales: 12,
        });

        expect(metrics.expectedCashFromSales).toBe(12);
        expect(metrics.totalReceived).toBe(0);
        expect(metrics.difference).toBe(0);
    });
});

describe('vendor card-fee basis', () => {
    beforeEach(() => {
        fetchAllRowsMock.mockReset();
        rpcMock.mockReset();
    });

    it('charges the vendor card fee only on the card tender', async () => {
        const consignor = { id: 'vendor-1', consignor_number: 'V1', name: 'Vendor', has_w9_filled_out: true };
        const sale = (id: string, fields: Record<string, unknown>) => ({
            id,
            completed_at: '2026-03-15T15:00:00.000Z',
            subtotal: 100,
            tax_amount: 7,
            discount_total: 0,
            ...fields,
        });
        const saleItem = (saleId: string, saleFields: Record<string, unknown>) => ({
            id: `item-${saleId}`,
            sale_id: saleId,
            consignor_id: 'vendor-1',
            sku: `SKU-${saleId}`,
            name: 'Lamp',
            price: 100,
            quantity: 1,
            commission_split: 0.6,
            discount_amount: 0,
            consignor_pays_card_fee: true,
            sale: sale(saleId, saleFields),
        });
        const saleItems = [
            saleItem('cash', {
                total: 107,
                payment_method: 'cash',
                payment_breakdown: [{ method: 'cash', amount: 107 }],
            }),
            saleItem('credit', {
                total: 107,
                payment_method: 'store_credit',
                payment_breakdown: [{ method: 'store_credit', amount: 107 }],
            }),
            // Pre-migration shape of a fully credit-paid sale.
            saleItem('legacy-credit', { total: 0, payment_method: 'card', payment_breakdown: null }),
            saleItem('split', {
                total: 107,
                payment_method: 'split',
                payment_breakdown: [
                    { method: 'store_credit', amount: 57 },
                    { method: 'card', amount: 50 },
                ],
            }),
            saleItem('card', {
                total: 107,
                payment_method: 'card',
                payment_breakdown: [{ method: 'card', amount: 107 }],
            }),
        ];

        fetchAllRowsMock
            .mockResolvedValueOnce([consignor]) // consignors
            .mockResolvedValueOnce(saleItems) // sale items with sales
            .mockResolvedValueOnce([]) // inventory
            .mockResolvedValueOnce([]) // payouts
            .mockResolvedValueOnce([]) // booth rent payments
            .mockResolvedValueOnce(saleItems.map((item) => ({
                id: item.id,
                sale_id: item.sale_id,
                price: item.price,
                quantity: item.quantity,
                discount_amount: 0,
            }))) // sale context
            .mockResolvedValueOnce([]); // refunds
        rpcMock.mockResolvedValue({ data: [], error: null });

        const report = await loadConsignorTaxReport({
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            reviewThreshold: 2000,
        });
        const feeBySale = new Map(report.rows[0].salesLines.map((line) => [line.saleId, line.creditCardFee]));

        expect(feeBySale.get('cash')).toBe(0);
        expect(feeBySale.get('credit')).toBe(0);
        expect(feeBySale.get('legacy-credit')).toBe(0);
        expect(feeBySale.get('split')).toBe(1.4); // 2.7% of $50 + $0.05
        expect(feeBySale.get('card')).toBe(2.94); // 2.7% of $107 + $0.05
    });
});
