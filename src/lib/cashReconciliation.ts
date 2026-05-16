interface CashSaleLike {
    cash_tendered?: number | string | null;
    change_given?: number | string | null;
    total?: number | string | null;
    payment_breakdown?: PaymentBreakdownLike[] | null;
}

interface PaymentBreakdownLike {
    method?: string | null;
    amount?: number | string | null;
    tendered?: number | string | null;
    change?: number | string | null;
}

function toSafeNumber(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function toCurrencyCents(value: number | string | null | undefined): number {
    return Math.round(toSafeNumber(value) * 100);
}

export function fromCurrencyCents(cents: number): number {
    return cents / 100;
}

export function getNetCashSaleCents(sale: CashSaleLike): number {
    const cashBreakdown = sale.payment_breakdown?.find((entry) => entry.method === 'cash');
    if (cashBreakdown) {
        return toCurrencyCents(cashBreakdown.amount);
    }

    const tendered = toCurrencyCents(sale.cash_tendered);
    const change = toCurrencyCents(sale.change_given);
    const total = toCurrencyCents(sale.total);
    return tendered > 0 ? (tendered - change) : total;
}

export function sumCashSalesNetCents(sales: CashSaleLike[]): number {
    return sales.reduce((sum, sale) => sum + getNetCashSaleCents(sale), 0);
}

export function getPaymentBreakdownAmountCents(
    sale: { payment_breakdown?: PaymentBreakdownLike[] | null },
    method: 'cash' | 'card' | 'check'
): number {
    return (sale.payment_breakdown || [])
        .filter((entry) => entry.method === method)
        .reduce((sum, entry) => sum + toCurrencyCents(entry.amount), 0);
}

export function getExpectedCashFromSalesCents(input: {
    cashSalesNetCents: number;
    cashRefundsCents: number;
    dealerCashPurchasesCents: number;
    offlineUnsyncedCashSalesCents?: number;
}): number {
    return input.cashSalesNetCents
        - input.cashRefundsCents
        - input.dealerCashPurchasesCents
        + (input.offlineUnsyncedCashSalesCents || 0);
}

export function getCountedDrawerCents(
    denominations: ReadonlyArray<{ key: string; value: number }>,
    denominationCounts: Record<string, string>
): number {
    return denominations.reduce((sum, denomination) => {
        const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
        return sum + (quantity * toCurrencyCents(denomination.value));
    }, 0);
}
