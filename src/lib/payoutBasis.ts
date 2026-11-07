import { calculateStripeTerminalProcessingFee } from './cardFees';
import { getSaleTenderAmount, type SaleTenderSource } from './tenders';
import { splitRefundCents } from './tillAccountability';

/**
 * The estimated vendor and store shares of a set of sales, from each item's
 * commission split. It was inline in Sales.tsx; it lives here so it can be
 * tested against `calculateTillAccountabilityMetrics` on the same data.
 *
 * This is an estimate, not the payout ledger. get_payout_sale_financials
 * rounds differently: it floors each line's share of a discount or fee and
 * hands the leftover cents to the largest remainders, where this uses a
 * running total, so single lines can differ by a cent. The server also floors a
 * vendor's cut at 0 per line, which this does not. Actual payouts are on
 * Vendor payouts.
 *
 * Everything is accumulated in whole cents per line:
 * - the net lines of one sale are rounded cumulatively, so they add up to the
 *   sale's subtotal less its discounts to the cent;
 * - a line is split into vendor and store with the vendor part rounded, so
 *   vendor + store + vendor-paid card fee is always exactly the line.
 */

export interface PayoutBasisItem {
    id: string;
    price?: number | string | null;
    quantity?: number | string | null;
    discount_amount?: number | string | null;
    commission_split?: number | string | null;
    consignor_pays_card_fee?: boolean | null;
    consignor_id?: string | null;
    consignor?: { is_active?: boolean | null } | null;
}

export interface PayoutBasisSale extends SaleTenderSource {
    id: string;
    items: PayoutBasisItem[];
    discount_total?: number | string | null;
}

export interface PayoutBasisRefund {
    sale_id?: string | null;
    refund_amount?: number | string | null;
    items?: unknown;
    sale?: Parameters<typeof splitRefundCents>[0]['sale'];
}

export interface PayoutBasisTotals {
    /** Vendors' estimated share, net of the card fees vendors pay. */
    consignorShare: number;
    storeShare: number;
    /** Card fees taken out of vendors' shares. */
    consignorCardFees: number;
    /** Net lines of items whose vendor is inactive (in neither share). */
    inactiveVendorLines: number;
    /** With a vendor filter: that vendor's share, and everyone else's (they add up to consignorShare). */
    selectedVendorShare: number;
    otherVendorsShare: number;
}

function num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function cents(value: number): number {
    return Math.round(value * 100);
}

export function calculatePayoutBasis(input: {
    sales: PayoutBasisSale[];
    refunds: PayoutBasisRefund[];
    vendorId?: string | null;
}): PayoutBasisTotals {
    const refundedQuantity = new Map<string, number>();
    for (const refund of input.refunds) {
        const items = refund.items as Array<{ sale_item_id: string; quantity: number }> | null | undefined;
        for (const item of items || []) {
            refundedQuantity.set(item.sale_item_id, (refundedQuantity.get(item.sale_item_id) || 0) + num(item.quantity));
        }
    }

    let vendorCents = 0;
    let storeCents = 0;
    let feeCents = 0;
    let inactiveCents = 0;
    let selectedCents = 0;

    for (const sale of input.sales) {
        if (sale.items.length === 0) continue;

        let subtotalAfterItemDiscounts = 0;
        let totalItemDiscounts = 0;
        for (const item of sale.items) {
            const raw = num(item.price) * num(item.quantity);
            const itemDiscount = Math.max(0, Math.min(num(item.discount_amount), raw));
            subtotalAfterItemDiscounts += Math.max(0, raw - itemDiscount);
            totalItemDiscounts += itemDiscount;
        }
        const orderDiscount = Math.max(
            0,
            Math.min(Math.max(0, num(sale.discount_total)) - totalItemDiscounts, subtotalAfterItemDiscounts)
        );
        const orderDiscountRatio = subtotalAfterItemDiscounts > 0 ? orderDiscount / subtotalAfterItemDiscounts : 0;
        const saleNetSubtotal = Math.max(0, subtotalAfterItemDiscounts - orderDiscount);

        // Card-fee basis is the card tender in the payment breakdown. The server
        // does the same for 'split' sales, but for payment_method 'card' it uses
        // the whole sale total even when the breakdown has several entries, so
        // a card sale part-paid with store credit can differ from the ledger.
        // Cash, check, store credit and gift card carry no fee.
        const cardTender = getSaleTenderAmount(sale, 'card');
        const saleFee = cardTender > 0 ? calculateStripeTerminalProcessingFee(cardTender) : 0;

        let runningFloat = 0;
        let runningCents = 0;
        for (const item of sale.items) {
            const raw = num(item.price) * num(item.quantity);
            const itemDiscount = Math.max(0, Math.min(num(item.discount_amount), raw));
            const netLine = Math.max(0, raw - itemDiscount) * (1 - orderDiscountRatio);

            runningFloat += netLine;
            const lineCents = cents(runningFloat) - runningCents;
            runningCents += lineCents;

            const quantity = num(item.quantity);
            const effectiveRatio = quantity > 0 ? Math.max(0, quantity - (refundedQuantity.get(item.id) || 0)) / quantity : 0;
            const effectiveLineCents = Math.round(lineCents * effectiveRatio);

            if (item.consignor?.is_active === false) {
                inactiveCents += effectiveLineCents;
                continue;
            }

            const itemFee = cardTender > 0 && item.consignor_pays_card_fee && saleNetSubtotal > 0
                ? saleFee * (netLine / saleNetSubtotal)
                : 0;
            const itemFeeCents = Math.round(cents(itemFee) * effectiveRatio);
            const vendorPartCents = Math.round(effectiveLineCents * num(item.commission_split));

            const vendorNet = vendorPartCents - itemFeeCents;
            vendorCents += vendorNet;
            storeCents += effectiveLineCents - vendorPartCents;
            feeCents += itemFeeCents;
            if (input.vendorId && item.consignor_id === input.vendorId) selectedCents += vendorNet;
        }
    }

    return {
        consignorShare: (vendorCents + 0) / 100,
        storeShare: (storeCents + 0) / 100,
        consignorCardFees: (feeCents + 0) / 100,
        inactiveVendorLines: (inactiveCents + 0) / 100,
        selectedVendorShare: input.vendorId ? (selectedCents + 0) / 100 : 0,
        otherVendorsShare: input.vendorId ? (vendorCents - selectedCents + 0) / 100 : 0,
    };
}

/**
 * Merchandise value of refunds in range whose sale is not in range (a sale
 * from before the range, or no sale at all). They lower net sales but no
 * in-range line, so they get their own row in Who gets what.
 */
export function returnsOfEarlierSales(refunds: PayoutBasisRefund[], sales: Array<{ id: string }>): number {
    const saleIds = new Set(sales.map((sale) => sale.id));
    const total = refunds
        .filter((refund) => !refund.sale_id || !saleIds.has(refund.sale_id))
        .reduce((sum, refund) => sum + splitRefundCents(refund).merchandiseCents, 0);
    return (total + 0) / 100;
}

/** With a vendor filter the sales are whole sales that include the vendor, so only refunds of those sales belong. */
export function refundsOfSales<T extends { sale_id?: string | null }>(refunds: T[], sales: Array<{ id: string }>): T[] {
    const saleIds = new Set(sales.map((sale) => sale.id));
    return refunds.filter((refund) => !!refund.sale_id && saleIds.has(refund.sale_id));
}
