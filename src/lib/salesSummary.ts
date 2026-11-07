import type { TillAccountabilityMetrics } from './tillAccountability';
import { splitRefundCents } from './tillAccountability';
import { formatCurrency } from './utils';

/**
 * Pure builders for the Sales history summary. Nothing here touches the
 * network or the DOM; Sales.tsx passes the figures in and the components
 * only draw what comes back.
 *
 * Who gets what. Every dollar collected is one of:
 *   Collected = Net sales + Sales tax + Card fees charged + Gift cards sold
 * and net sales is made of the in-range item lines less returns of sales from
 * before the range:
 *   Net sales = Vendors + Store + Vendor-paid card fees   (active vendors' lines)
 *             + Inactive vendors' items
 *             - Returns of earlier sales
 *             + Not split
 * Vendors is already net of the card fee a vendor pays, so that fee is added
 * back as its own row. Each known cause has its own row. Not split is only
 * what is left over (refunds whose amount does not match the returned
 * quantity, bad data, rounding), so it is a check on the data and never a
 * plug for known differences.
 */

export type SummaryMetrics = Pick<
    TillAccountabilityMetrics,
    | 'grossProductSales'
    | 'discounts'
    | 'returns'
    | 'allowances'
    | 'netSales'
    | 'salesTax'
    | 'creditCardFeesCharged'
    | 'giftCertificatesSold'
    | 'totalCollected'
    | 'cashInDrawer'
    | 'checksInHand'
    | 'creditCardsBatchTotal'
    | 'storeCreditRedeemed'
    | 'giftCardRedeemed'
    | 'totalReceived'
    | 'expectedCashFromSales'
    | 'dealerCashPurchases'
    | 'giftCardSalesCash'
    | 'offlineUnsyncedCashSales'
>;

export interface SalesSummaryInput {
    metrics: SummaryMetrics;
    /** Estimated shares from each item's commission split (calculatePayoutBasis). */
    payout: {
        consignorShare: number;
        storeShare: number;
        consignorCardFees: number;
        inactiveVendorLines?: number;
        selectedVendorShare?: number;
        otherVendorsShare?: number;
    };
    /** Merchandise of in-range refunds whose sale is not in range (returnsOfEarlierSales). */
    earlierReturns?: number;
    transactionCount: number;
    itemsSold: number;
    topCategory: string | null;
    /** Set when the page is filtered to one vendor. Totals then cover whole sales that include them. */
    vendor?: { label: string } | null;
    isLoading?: boolean;
}

export interface SummaryLine {
    key: string;
    label: string;
    amount: number;
    /** Shown with a minus sign when nonzero. */
    deduct?: boolean;
    muted?: boolean;
    /** A warning, not an error: amber, never red. */
    tone?: 'warning';
}

export interface DrawerNote {
    key: string;
    amount: number;
    /** Ready to show, with its sign. */
    text: string;
}

export interface SalesSummary {
    loading: boolean;
    vendorNote: string | null;
    headline: {
        netSales: number;
        storeKeeps: number;
        storeKeepsPercent: number;
        transactionCount: number;
        averageSale: number;
        itemsSold: number;
        topCategory: string | null;
    };
    balance: {
        rows: SummaryLine[];
        received: number;
        collected: number;
        balanced: boolean;
        /** Absolute gap between collected and received. */
        difference: number;
        hint: string | null;
        drawer: { expected: number; notes: DrawerNote[] };
    };
    split: {
        rows: SummaryLine[];
        total: number;
        notSplit: number;
        /** Set when Not split is more than two cents. */
        hint: string | null;
        footnote: string;
    };
    books: {
        left: { lines: SummaryLine[]; total: { label: string; amount: number } };
        right: { lines: SummaryLine[]; total: { label: string; amount: number } };
    };
}

export const SPLIT_FOOTNOTE =
    "Vendor figure is an estimate from each item's split. Actual payouts are on Vendor payouts.";

const HALF_CENT = 0.005;

function toCents(value: number | string | null | undefined): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function fromCents(cents: number): number {
    // `+ 0` turns -0 into 0 so a zero can never print as "-$0.00".
    return cents / 100 + 0;
}

/** Round to the cent and never return -0. */
export function roundMoney(value: number | null | undefined): number {
    return fromCents(toCents(value));
}

export function isZeroAmount(value: number | null | undefined): boolean {
    return Math.abs(Number(value) || 0) < HALF_CENT;
}

function drawerNotes(metrics: SummaryMetrics): DrawerNote[] {
    const dealer = roundMoney(metrics.dealerCashPurchases);
    const gifts = roundMoney(metrics.giftCardSalesCash);
    const offline = roundMoney(metrics.offlineUnsyncedCashSales);
    const notes: DrawerNote[] = [];
    if (!isZeroAmount(dealer)) notes.push({ key: 'dealerCashOut', amount: dealer, text: `Dealer cash out \u2212${formatCurrency(dealer)}` });
    // Gift cards sold for cash are already inside the Cash row.
    if (!isZeroAmount(gifts)) notes.push({ key: 'giftCardsSoldForCash', amount: gifts, text: `Includes ${formatCurrency(gifts)} gift cards sold for cash` });
    if (!isZeroAmount(offline)) notes.push({ key: 'offlineUnsynced', amount: offline, text: `Offline unsynced +${formatCurrency(offline)}` });
    return notes;
}

export function vendorScopeNote(label: string): string {
    return `Sales that include ${label}. Totals cover whole sales.`;
}

export function buildSalesSummary(input: SalesSummaryInput): SalesSummary {
    const { metrics, payout } = input;

    const netSales = roundMoney(metrics.netSales);
    const storeKeeps = roundMoney(payout.storeShare);
    const transactionCount = Math.max(0, Math.round(input.transactionCount || 0));

    const headline = {
        netSales,
        storeKeeps,
        storeKeepsPercent: netSales > 0 ? Math.round((storeKeeps / netSales) * 1000) / 10 + 0 : 0,
        transactionCount,
        averageSale: transactionCount > 0 ? roundMoney(netSales / transactionCount) : 0,
        itemsSold: Math.max(0, Math.round(input.itemsSold || 0)),
        topCategory: input.topCategory || null,
    };

    // Does it balance
    const collectedRaw = Number(metrics.totalCollected) || 0;
    const receivedRaw = Number(metrics.totalReceived) || 0;
    const gap = collectedRaw - receivedRaw;
    const balanced = Math.abs(gap) < HALF_CENT;
    const difference = balanced ? 0 : roundMoney(Math.abs(gap));
    const hint = balanced
        ? null
        : gap > 0
            ? 'Collected is above received. Look for a gift card sold with no payment method.'
            : 'Received is above collected. Look for a refund with no recorded tender.';

    const balance: SalesSummary['balance'] = {
        rows: [
            { key: 'cash', label: 'Cash', amount: roundMoney(metrics.cashInDrawer) },
            { key: 'card', label: 'Card batch', amount: roundMoney(metrics.creditCardsBatchTotal) },
            { key: 'storeCredit', label: 'Store credit used', amount: roundMoney(metrics.storeCreditRedeemed) },
            { key: 'giftCards', label: 'Gift cards used', amount: roundMoney(metrics.giftCardRedeemed) },
            { key: 'checks', label: 'Checks', amount: roundMoney(metrics.checksInHand) },
        ],
        received: roundMoney(metrics.totalReceived),
        collected: roundMoney(metrics.totalCollected),
        balanced: balanced && !input.isLoading,
        difference,
        hint,
        drawer: {
            expected: roundMoney(metrics.expectedCashFromSales),
            notes: drawerNotes(metrics),
        },
    };

    // Who gets what
    const netCents = toCents(metrics.netSales);
    const vendorCents = toCents(payout.consignorShare);
    const storeCents = toCents(payout.storeShare);
    const vendorFeeCents = toCents(payout.consignorCardFees);
    const inactiveCents = toCents(payout.inactiveVendorLines);
    const earlierReturnsCents = toCents(input.earlierReturns);
    const notSplitCents = netCents - (vendorCents + storeCents + vendorFeeCents + inactiveCents - earlierReturnsCents);
    const taxCents = toCents(metrics.salesTax);
    const cardFeeCents = toCents(metrics.creditCardFeesCharged);
    const giftCents = toCents(metrics.giftCertificatesSold);

    const splitRows: SummaryLine[] = [];
    if (input.vendor) {
        splitRows.push({ key: 'vendor', label: input.vendor.label, amount: roundMoney(payout.selectedVendorShare) });
        if (toCents(payout.otherVendorsShare) !== 0) {
            splitRows.push({ key: 'otherVendors', label: 'Other vendors in the same sales', amount: roundMoney(payout.otherVendorsShare) });
        }
    } else {
        splitRows.push({ key: 'vendors', label: 'Vendors', amount: fromCents(vendorCents) });
    }
    splitRows.push({ key: 'store', label: 'Store', amount: fromCents(storeCents) });
    if (vendorFeeCents !== 0) {
        splitRows.push({ key: 'vendorCardFees', label: 'Card fees paid by vendors, to the processor', amount: fromCents(vendorFeeCents) });
    }
    if (inactiveCents !== 0) {
        splitRows.push({ key: 'inactiveVendors', label: "Inactive vendors' items", amount: fromCents(inactiveCents) });
    }
    if (earlierReturnsCents !== 0) {
        splitRows.push({ key: 'earlierReturns', label: 'Returns of earlier sales', amount: fromCents(-earlierReturnsCents) });
    }
    splitRows.push(
        { key: 'salesTax', label: 'Sales tax, owed to the state', amount: fromCents(taxCents) },
        { key: 'cardFees', label: 'Card fees, to the processor', amount: fromCents(cardFeeCents) }
    );
    if (giftCents !== 0) {
        splitRows.push({ key: 'giftCardsSold', label: 'Gift cards sold', amount: fromCents(giftCents) });
    }
    const remainder = Math.abs(notSplitCents);
    if (notSplitCents !== 0) {
        splitRows.push({
            key: 'notSplit',
            label: remainder <= 1 ? 'Rounding' : 'Not split',
            amount: fromCents(notSplitCents),
            muted: remainder <= 2,
            tone: remainder > 2 ? 'warning' : undefined,
        });
    }

    const split: SalesSummary['split'] = {
        rows: splitRows,
        total: fromCents(toCents(metrics.totalCollected)),
        notSplit: fromCents(notSplitCents),
        hint: remainder > 2
            ? 'Part of the sales is not accounted for by the item splits. Check refunds whose amount does not match the items returned.'
            : null,
        footnote: SPLIT_FOOTNOTE,
    };

    // For the books
    const books: SalesSummary['books'] = {
        left: {
            lines: [
                { key: 'grossProductSales', label: 'Gross product sales', amount: roundMoney(metrics.grossProductSales) },
                { key: 'discounts', label: 'Discounts', amount: roundMoney(metrics.discounts), deduct: true },
                { key: 'returns', label: 'Returns', amount: roundMoney(metrics.returns), deduct: true },
                { key: 'allowances', label: 'Allowances', amount: roundMoney(metrics.allowances), deduct: true },
            ],
            total: { label: 'Net sales', amount: netSales },
        },
        right: {
            lines: [
                { key: 'netSales', label: 'Net sales', amount: netSales },
                { key: 'salesTax', label: 'Sales tax', amount: roundMoney(metrics.salesTax) },
                { key: 'cardFees', label: 'Card fees charged', amount: roundMoney(metrics.creditCardFeesCharged) },
                { key: 'giftCardsSold', label: 'Gift cards sold', amount: roundMoney(metrics.giftCertificatesSold) },
            ],
            total: { label: 'Total collected', amount: roundMoney(metrics.totalCollected) },
        },
    };

    return {
        loading: Boolean(input.isLoading),
        vendorNote: input.vendor ? vendorScopeNote(input.vendor.label) : null,
        headline,
        balance,
        split,
        books,
    };
}

// ---------------------------------------------------------------------------
// CSV and print

type Books = SalesSummary['books'];

interface BooksReportInput {
    books: Books;
    rangeLabel: string;
    consignorLabel: string;
    /** Printed under the header when the page is filtered to one vendor. */
    scopeNote?: string | null;
}

type CsvCell = string | number;

function csvCell(cell: CsvCell): string {
    // Amounts are plain numbers. Text that starts with = + - @ would be read
    // as a formula by spreadsheets, so it gets a leading apostrophe.
    if (typeof cell === 'number') return roundMoney(cell).toFixed(2);
    const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvAmount(line: { amount: number; deduct?: boolean }): number {
    return line.deduct && !isZeroAmount(line.amount) ? -line.amount : line.amount;
}

export function booksCsv({ books, rangeLabel, consignorLabel, scopeNote }: BooksReportInput): string {
    const rows: CsvCell[][] = [
        ['Sales summary for the books'],
        ['Date range', rangeLabel],
        ['Vendor', consignorLabel],
        ...(scopeNote ? [['Note', scopeNote]] : []),
        [],
        ['What was sold', 'Amount'],
        ...books.left.lines.map((line) => [line.label, csvAmount(line)]),
        [books.left.total.label, csvAmount(books.left.total)],
        [],
        ['What was collected', 'Amount'],
        ...books.right.lines.map((line) => [line.label, csvAmount(line)]),
        [books.right.total.label, csvAmount(books.right.total)],
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function booksFilename(rangeLabel: string, consignorLabel: string): string {
    const parts = ['sales-summary', slug(rangeLabel), slug(consignorLabel)].filter(Boolean);
    return `${parts.join('-')}.csv`;
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function printAmount(line: SummaryLine): string {
    const text = formatCurrency(line.amount);
    return line.deduct && !isZeroAmount(line.amount) ? `-${text}` : text;
}

export function buildBooksReportHtml({ books, rangeLabel, consignorLabel, scopeNote }: BooksReportInput): string {
    const column = (title: string, lines: SummaryLine[], total: { label: string; amount: number }) => `
        <div class="col">
            <h2>${escapeHtml(title)}</h2>
            ${lines.map((line) => `<div class="row"><span>${escapeHtml(line.label)}</span><span>${escapeHtml(printAmount(line))}</span></div>`).join('')}
            <div class="row total"><span>${escapeHtml(total.label)}</span><span>${escapeHtml(formatCurrency(total.amount))}</span></div>
        </div>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Sales summary for the books</title>
    <style>
        body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1f1d1a; margin: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 0 0 8px; }
        .meta { color: #6b665f; font-size: 12px; margin-bottom: 24px; }
        .cols { display: flex; gap: 40px; }
        .col { flex: 1; }
        .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; font-variant-numeric: tabular-nums; }
        .total { border-top: 1px solid #1f1d1a; margin-top: 6px; font-weight: 600; }
    </style>
</head>
<body>
    <h1>Sales summary for the books</h1>
    <div class="meta">Date range: ${escapeHtml(rangeLabel)} &middot; Vendor: ${escapeHtml(consignorLabel)}${scopeNote ? `<br />${escapeHtml(scopeNote)}` : ''}</div>
    <div class="cols">
        ${column('What was sold', books.left.lines, books.left.total)}
        ${column('What was collected', books.right.lines, books.right.total)}
    </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Trend card

interface SlotBucket {
    label: string;
    count: number;
    amount: number;
}

export interface BusiestSlot {
    weekday: string;
    hourRange: string;
    text: string;
}

function pickBusiest(buckets: SlotBucket[]): { bucket: SlotBucket; index: number } | null {
    let best: { bucket: SlotBucket; index: number } | null = null;
    buckets.forEach((bucket, index) => {
        if (!(bucket.count > 0)) return;
        // Most sales wins, then the larger take; a full tie keeps the earlier slot.
        if (!best || bucket.count > best.bucket.count || (bucket.count === best.bucket.count && bucket.amount > best.bucket.amount)) {
            best = { bucket, index };
        }
    });
    return best;
}

function hourLabel(hour: number): { number: number; period: 'AM' | 'PM' } {
    const wrapped = ((hour % 24) + 24) % 24;
    return { number: wrapped % 12 === 0 ? 12 : wrapped % 12, period: wrapped < 12 ? 'AM' : 'PM' };
}

function hourRange(hour: number): string {
    const start = hourLabel(hour);
    const end = hourLabel(hour + 1);
    return start.period === end.period
        ? `${start.number}\u2013${end.number} ${end.period}`
        : `${start.number} ${start.period}\u2013${end.number} ${end.period}`;
}

export function busiestSlot(
    data: { hourlyBreakdown: SlotBucket[]; weekdayBreakdown: SlotBucket[] } | null | undefined
): BusiestSlot | null {
    if (!data) return null;
    const day = pickBusiest(data.weekdayBreakdown);
    const hour = pickBusiest(data.hourlyBreakdown);
    if (!day || !hour) return null;
    const range = hourRange(hour.index);
    return { weekday: day.bucket.label, hourRange: range, text: `Busiest day ${day.bucket.label} \u00b7 busiest hour ${range}` };
}

/** The category with the most items sold, or null when nothing sold. */
export function topCategoryByItems<T extends { category: string; count: number }>(data: T[]): string | null {
    let best: T | null = null;
    for (const row of data) {
        if (row.count > 0 && (!best || row.count > best.count)) best = row;
    }
    return best ? best.category : null;
}

export function topCategories<T extends { category: string; amount: number }>(data: T[], limit = 5): T[] {
    return data
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
}

interface DailySaleLike {
    completed_at: string;
    subtotal?: number | string | null;
    discount_total?: number | string | null;
}

interface RefundSaleShape {
    total?: number | string | null;
    tax_amount?: number | string | null;
    card_fee_amount?: number | string | null;
}

interface DailyRefundLike {
    created_at: string;
    refund_amount?: number | string | null;
    sale?: RefundSaleShape | RefundSaleShape[] | null;
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Net sales per local day: product sales less discounts, less the merchandise
 * part of returns on the day they were made. Adds up to the headline Net sales.
 */
export function dailyNetSales(input: {
    sales: DailySaleLike[];
    refunds: DailyRefundLike[];
    start?: Date | null;
    end?: Date | null;
}): Array<{ date: string; amount: number; count: number }> {
    const totals = new Map<string, { cents: number; count: number }>();
    const stamps: number[] = [];

    const bucket = (key: string) => {
        let entry = totals.get(key);
        if (!entry) {
            entry = { cents: 0, count: 0 };
            totals.set(key, entry);
        }
        return entry;
    };

    for (const sale of input.sales) {
        const when = new Date(sale.completed_at);
        if (Number.isNaN(when.getTime())) continue;
        stamps.push(when.getTime());
        const entry = bucket(dayKey(when));
        entry.cents += toCents(sale.subtotal) - toCents(sale.discount_total);
        entry.count += 1;
    }
    for (const refund of input.refunds) {
        const when = new Date(refund.created_at);
        if (Number.isNaN(when.getTime())) continue;
        stamps.push(when.getTime());
        bucket(dayKey(when)).cents -= splitRefundCents(refund).merchandiseCents;
    }

    const first = input.start ?? (stamps.length ? new Date(Math.min(...stamps)) : null);
    const last = input.end ?? (stamps.length ? new Date(Math.max(...stamps)) : null);
    if (!first || !last) return [];

    const rows: Array<{ date: string; amount: number; count: number }> = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    const stop = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    while (cursor <= stop) {
        const entry = totals.get(dayKey(cursor));
        rows.push({
            date: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            amount: fromCents(entry?.cents ?? 0),
            count: entry?.count ?? 0,
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
}
