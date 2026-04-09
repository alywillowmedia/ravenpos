import { fromCurrencyCents, getNetCashSaleCents, toCurrencyCents } from './cashReconciliation';

type PaymentMethod = 'cash' | 'card' | 'check';

interface SaleLike {
    subtotal?: number | string | null;
    tax_amount?: number | string | null;
    total?: number | string | null;
    discount_total?: number | string | null;
    card_fee_amount?: number | string | null;
    store_credit_used?: number | string | null;
    payment_method?: PaymentMethod | string | null;
    cash_tendered?: number | string | null;
    change_given?: number | string | null;
}

interface RefundLike {
    refund_amount?: number | string | null;
    payment_method?: PaymentMethod | string | null;
}

interface GiftCardLike {
    original_amount?: number | string | null;
}

export interface TillAccountabilityMetrics {
    grossProductSales: number;
    discounts: number;
    returns: number;
    allowances: number;
    netSales: number;
    salesTax: number;
    creditCardFeesCharged: number;
    giftCertificatesSold: number;
    totalCollected: number;
    cashInDrawer: number;
    checksInHand: number;
    creditCardsBatchTotal: number;
    storeCreditRedeemed: number;
    totalReceived: number;
    difference: number;
    cashSalesNet: number;
    cashRefunds: number;
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
    const returnsCents = input.refunds.reduce(
        (sum, refund) => sum + toCurrencyCents(refund.refund_amount || 0),
        0
    );
    const allowancesCents = toCurrencyCents(input.allowances || 0);
    const netSalesCents = grossProductSalesCents - discountsCents - returnsCents - allowancesCents;

    const salesTaxCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.tax_amount || 0),
        0
    );
    const creditCardFeesChargedCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.card_fee_amount || 0),
        0
    );
    const giftCertificatesSoldCents = input.giftCardsSold.reduce(
        (sum, giftCard) => sum + toCurrencyCents(giftCard.original_amount || 0),
        0
    );
    const totalCollectedCents =
        netSalesCents
        + salesTaxCents
        + creditCardFeesChargedCents
        + giftCertificatesSoldCents;

    const cashSalesNetCents = input.sales
        .filter((sale) => sale.payment_method === 'cash')
        .reduce((sum, sale) => sum + getNetCashSaleCents(sale), 0);
    const cashRefundsCents = input.refunds
        .filter((refund) => refund.payment_method === 'cash')
        .reduce((sum, refund) => sum + toCurrencyCents(refund.refund_amount || 0), 0);

    const checkSalesNetCents = input.sales
        .filter((sale) => sale.payment_method === 'check')
        .reduce((sum, sale) => sum + toCurrencyCents(sale.total || 0), 0);
    const checkRefundsCents = input.refunds
        .filter((refund) => refund.payment_method === 'check')
        .reduce((sum, refund) => sum + toCurrencyCents(refund.refund_amount || 0), 0);

    const cardSalesNetCents = input.sales
        .filter((sale) => sale.payment_method === 'card')
        .reduce((sum, sale) => sum + toCurrencyCents(sale.total || 0), 0);
    const cardRefundsCents = input.refunds
        .filter((refund) => refund.payment_method === 'card')
        .reduce((sum, refund) => sum + toCurrencyCents(refund.refund_amount || 0), 0);

    const storeCreditRedeemedCents = input.sales.reduce(
        (sum, sale) => sum + toCurrencyCents(sale.store_credit_used || 0),
        0
    );

    const offlineUnsyncedCashSalesCents = toCurrencyCents(input.offlineUnsyncedCashSales || 0);
    const dealerCashPurchasesCents = toCurrencyCents(input.dealerCashPurchases || 0);

    const cashInDrawerCents = cashSalesNetCents - cashRefundsCents + offlineUnsyncedCashSalesCents;
    const checksInHandCents = checkSalesNetCents - checkRefundsCents;
    const creditCardsBatchTotalCents = cardSalesNetCents - cardRefundsCents;
    const totalReceivedCents =
        cashInDrawerCents
        + checksInHandCents
        + creditCardsBatchTotalCents
        + storeCreditRedeemedCents;

    const expectedCashFromSalesCents = cashInDrawerCents - dealerCashPurchasesCents;
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
        totalReceived: fromCurrencyCents(totalReceivedCents),
        difference: fromCurrencyCents(differenceCents),
        cashSalesNet: fromCurrencyCents(cashSalesNetCents),
        cashRefunds: fromCurrencyCents(cashRefundsCents),
        expectedCashFromSales: fromCurrencyCents(expectedCashFromSalesCents),
        dealerCashPurchases: fromCurrencyCents(dealerCashPurchasesCents),
        offlineUnsyncedCashSales: fromCurrencyCents(offlineUnsyncedCashSalesCents),
    };
}
