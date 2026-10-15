import type { TenderMethod } from '../types';
import {
    fromCurrencyCents,
    getExpectedCashFromSalesCents,
    getRefundTenderAmountCents,
    getSaleTenderAmountCents,
    toCurrencyCents,
} from './cashReconciliation';

interface PaymentBreakdownLike {
    method?: string | null;
    amount?: number | string | null;
    tendered?: number | string | null;
    change?: number | string | null;
}

interface SaleLike {
    subtotal?: number | string | null;
    tax_amount?: number | string | null;
    total?: number | string | null;
    discount_total?: number | string | null;
    card_fee_amount?: number | string | null;
    store_credit_used?: number | string | null;
    gift_card_used?: number | string | null;
    payment_method?: string | null;
    cash_tendered?: number | string | null;
    change_given?: number | string | null;
    payment_breakdown?: PaymentBreakdownLike[] | null;
}

interface RefundSaleLike {
    total?: number | string | null;
    tax_amount?: number | string | null;
    card_fee_amount?: number | string | null;
}

interface RefundLike {
    refund_amount?: number | string | null;
    payment_method?: string | null;
    payment_breakdown?: PaymentBreakdownLike[] | null;
    // The refunded sale, used to split the refund into merchandise, tax and card fee.
    sale?: RefundSaleLike | RefundSaleLike[] | null;
}

interface GiftCardLike {
    original_amount?: number | string | null;
    purchase_payment_method?: string | null;
}

export interface TillAccountabilityMetrics {
    grossProductSales: number;
    discounts: number;
    /** Merchandise portion of refunds (tax and card fee refunded are taken off those lines). */
    returns: number;
    allowances: number;
    netSales: number;
    /** Tax on sales less tax refunded. */
    salesTax: number;
    /** Card fees on sales less card fees refunded. */
    creditCardFeesCharged: number;
    giftCertificatesSold: number;
    totalCollected: number;
    /** Cash tenders less cash refunds, plus gift cards sold for cash. */
    cashInDrawer: number;
    checksInHand: number;
    /** Card tenders less card refunds, plus gift cards sold by card. */
    creditCardsBatchTotal: number;
    /** Store credit redeemed on sales less store credit given back on refunds. Not cash. */
    storeCreditRedeemed: number;
    /** Gift card balances redeemed on sales less balances given back on refunds. Not cash. */
    giftCardRedeemed: number;
    totalReceived: number;
    difference: number;
    cashSalesNet: number;
    cashRefunds: number;
    giftCardSalesCash: number;
    giftCardSalesCard: number;
    refundedTax: number;
    refundedCardFees: number;
    expectedCashFromSales: number;
    dealerCashPurchases: number;
    offlineUnsyncedCashSales: number;
}

interface CalculateTillAccountabilityInput {
    sales: SaleLike[];
    refunds: RefundLike[];
    giftCardsSold: GiftCardLike[];
    dealerCashPurchases?: number;
    offlineUnsyncedCashSales?: number;
    allowances?: number;
}

function sumSaleTenderCents(sales: SaleLike[], method: TenderMethod): number {
    return sales.reduce((sum, sale) => sum + getSaleTenderAmountCents(sale, method), 0);
}

function sumRefundTenderCents(refunds: RefundLike[], method: TenderMethod): number {
    return refunds.reduce((sum, refund) => sum + getRefundTenderAmountCents(refund, method), 0);
}

/**
 * Refund amounts are a share of the sale total, so they include tax and card
 * fee. Split each refund the same way its sale was made up; without the sale
 * the whole refund is treated as merchandise.
 */
function splitRefundCents(refund: RefundLike): { merchandiseCents: number; taxCents: number; cardFeeCents: number } {
    const refundCents = toCurrencyCents(refund.refund_amount || 0);
    const sale = Array.isArray(refund.sale) ? refund.sale[0] : refund.sale;
    const saleTotalCents = toCurrencyCents(sale?.total || 0);

    if (!sale || saleTotalCents <= 0 || refundCents <= 0) {
        return { merchandiseCents: refundCents, taxCents: 0, cardFeeCents: 0 };
    }

    const saleTaxCents = Math.max(0, toCurrencyCents(sale.tax_amount || 0));
    const saleCardFeeCents = Math.max(0, toCurrencyCents(sale.card_fee_amount || 0));
    const taxCents = Math.min(refundCents, Math.round((refundCents * saleTaxCents) / saleTotalCents));
    const cardFeeCents = Math.min(
        refundCents - taxCents,
        Math.round((refundCents * saleCardFeeCents) / saleTotalCents)
    );

    return { merchandiseCents: refundCents - taxCents - cardFeeCents, taxCents, cardFeeCents };
}

export function calculateTillAccountabilityMetrics(
    input: CalculateTillAccountabilityInput
): TillAccountabilityMetrics {
    const grossProductSalesCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.subtotal || 0),
        0
    );
    const discountsCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.discount_total || 0),
        0
    );

    const refundSplits = input.refunds.map(splitRefundCents);
    const returnsCents = refundSplits.reduce((sum, split) => sum + split.merchandiseCents, 0);
    const refundedTaxCents = refundSplits.reduce((sum, split) => sum + split.taxCents, 0);
    const refundedCardFeesCents = refundSplits.reduce((sum, split) => sum + split.cardFeeCents, 0);

    const allowancesCents = toCurrencyCents(input.allowances || 0);
    const netSalesCents = grossProductSalesCents - discountsCents - returnsCents - allowancesCents;

    const salesTaxCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.tax_amount || 0),
        0
    ) - refundedTaxCents;
    const creditCardFeesChargedCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.card_fee_amount || 0),
        0
    ) - refundedCardFeesCents;
    const giftCertificatesSoldCents = input.giftCardsSold.reduce(
        (sum, giftCard) => sum + toCurrencyCents(giftCard.original_amount || 0),
        0
    );
    const totalCollectedCents =
        netSalesCents
        + salesTaxCents
        + creditCardFeesChargedCents
        + giftCertificatesSoldCents;

    // Gift card sales are not sales rows: the money comes in through the
    // drawer (cash) or the card batch (card) when the card is sold.
    const giftCardSalesCashCents = input.giftCardsSold
        .filter((giftCard) => giftCard.purchase_payment_method === 'cash')
        .reduce((sum, giftCard) => sum + toCurrencyCents(giftCard.original_amount || 0), 0);
    const giftCardSalesCardCents = input.giftCardsSold
        .filter((giftCard) => giftCard.purchase_payment_method === 'card')
        .reduce((sum, giftCard) => sum + toCurrencyCents(giftCard.original_amount || 0), 0);

    // Every bucket comes from the tender entries; sales.total also includes
    // store credit and gift card redemptions, which are not money received.
    const cashSalesNetCents = sumSaleTenderCents(input.sales, 'cash');
    const cashRefundsCents = sumRefundTenderCents(input.refunds, 'cash');
    const checkSalesNetCents = sumSaleTenderCents(input.sales, 'check');
    const checkRefundsCents = sumRefundTenderCents(input.refunds, 'check');
    const cardSalesNetCents = sumSaleTenderCents(input.sales, 'card');
    const cardRefundsCents = sumRefundTenderCents(input.refunds, 'card');
    const storeCreditRedeemedCents = sumSaleTenderCents(input.sales, 'store_credit')
        - sumRefundTenderCents(input.refunds, 'store_credit');
    const giftCardRedeemedCents = sumSaleTenderCents(input.sales, 'gift_card')
        - sumRefundTenderCents(input.refunds, 'gift_card');

    const offlineUnsyncedCashSalesCents = toCurrencyCents(input.offlineUnsyncedCashSales || 0);
    const dealerCashPurchasesCents = toCurrencyCents(input.dealerCashPurchases || 0);

    const cashInDrawerCents = cashSalesNetCents - cashRefundsCents + giftCardSalesCashCents;
    const checksInHandCents = checkSalesNetCents - checkRefundsCents;
    const creditCardsBatchTotalCents = cardSalesNetCents - cardRefundsCents + giftCardSalesCardCents;
    const totalReceivedCents =
        cashInDrawerCents
        + checksInHandCents
        + creditCardsBatchTotalCents
        + storeCreditRedeemedCents
        + giftCardRedeemedCents;

    // Offline sales that have not synced are not in `sales`, so they only
    // affect the drawer expectation, not Collected vs Received.
    const expectedCashFromSalesCents = getExpectedCashFromSalesCents({
        cashSalesNetCents,
        cashRefundsCents,
        dealerCashPurchasesCents,
        giftCardCashSalesCents: giftCardSalesCashCents,
        offlineUnsyncedCashSalesCents,
    });
    const differenceCents = totalCollectedCents - totalReceivedCents;

    return {
        grossProductSales: fromCurrencyCents(grossProductSalesCents),
        discounts: fromCurrencyCents(discountsCents),
        returns: fromCurrencyCents(returnsCents),
        allowances: fromCurrencyCents(allowancesCents),
        netSales: fromCurrencyCents(netSalesCents),
        salesTax: fromCurrencyCents(salesTaxCents),
        creditCardFeesCharged: fromCurrencyCents(creditCardFeesChargedCents),
        giftCertificatesSold: fromCurrencyCents(giftCertificatesSoldCents),
        totalCollected: fromCurrencyCents(totalCollectedCents),
        cashInDrawer: fromCurrencyCents(cashInDrawerCents),
        checksInHand: fromCurrencyCents(checksInHandCents),
        creditCardsBatchTotal: fromCurrencyCents(creditCardsBatchTotalCents),
        storeCreditRedeemed: fromCurrencyCents(storeCreditRedeemedCents),
        giftCardRedeemed: fromCurrencyCents(giftCardRedeemedCents),
        totalReceived: fromCurrencyCents(totalReceivedCents),
        difference: fromCurrencyCents(differenceCents),
        cashSalesNet: fromCurrencyCents(cashSalesNetCents),
        cashRefunds: fromCurrencyCents(cashRefundsCents),
        giftCardSalesCash: fromCurrencyCents(giftCardSalesCashCents),
        giftCardSalesCard: fromCurrencyCents(giftCardSalesCardCents),
        refundedTax: fromCurrencyCents(refundedTaxCents),
        refundedCardFees: fromCurrencyCents(refundedCardFeesCents),
        expectedCashFromSales: fromCurrencyCents(expectedCashFromSalesCents),
        dealerCashPurchases: fromCurrencyCents(dealerCashPurchasesCents),
        offlineUnsyncedCashSales: fromCurrencyCents(offlineUnsyncedCashSalesCents),
    };
}
