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
 * and net sales splits by each item's commission split into
 *   Net sales = Vendors + Store + Vendor-paid card fees + Not split
 * where Vendors is already net of the card fee a vendor pays (so that fee is
 * added back as its own row) and Not split is whatever the item splits do not
 * reach: items of inactive vendors, refunds that are not tied to an item,
 * rounding. Not split is measured, never forced: it is shown whenever it is
 * not zero, so the rows always add up to Collected without hiding anything.
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
    /** Estimated shares from each item's commission split (payoutBasisTotals). */
    payout: { consignorShare: number; storeShare: number; consignorCardFees: number };
    transactionCount: number;
    itemsSold: number;
    topCategory: string | null;
}

export interface SummaryLine {
    key: string;
    label: string;
    amount: number;
    /** Shown with a minus sign when nonzero. */
    deduct?: boolean;
    muted?: boolean;
}

export interface SalesSummary {
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
        drawer: { expected: number; notes: SummaryLine[] };
    };
    split: {
        rows: SummaryLine[];
        total: number;
        notSplit: number;
        sumsToCollected: boolean;
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
            ? 'Collected is more than received. A sale may be missing a payment, or a payment is recorded on the wrong type.'
            : 'Received is more than collected. A payment may be counted twice, or a sale is missing from this range.';

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
        balanced,
        difference,
        hint,
        drawer: {
            expected: roundMoney(metrics.expectedCashFromSales),
            notes: [
                { key: 'dealerCashOut', label: 'Dealer cash out', amount: roundMoney(metrics.dealerCashPurchases) },
                { key: 'giftCardsSoldForCash', label: 'Gift cards sold for cash', amount: roundMoney(metrics.giftCardSalesCash) },
                { key: 'offlineUnsynced', label: 'Offline unsynced', amount: roundMoney(metrics.offlineUnsyncedCashSales) },
            ].filter((note) => !isZeroAmount(note.amount)),
        },
    };

    // Who gets what
    const netCents = toCents(metrics.netSales);
    const vendorCents = toCents(payout.consignorShare);
    const storeCents = toCents(payout.storeShare);
    const vendorFeeCents = toCents(payout.consignorCardFees);
    const notSplitCents = netCents - vendorCents - storeCents - vendorFeeCents;
    const taxCents = toCents(metrics.salesTax);
    const cardFeeCents = toCents(metrics.creditCardFeesCharged);
    const giftCents = toCents(metrics.giftCertificatesSold);

    const splitRows: SummaryLine[] = [
        { key: 'vendors', label: 'Vendors', amount: fromCents(vendorCents) },
        { key: 'store', label: 'Store', amount: fromCents(storeCents) },
    ];
    if (vendorFeeCents !== 0) {
        splitRows.push({ key: 'vendorCardFees', label: 'Card fees withheld from vendors', amount: fromCents(vendorFeeCents) });
    }
    splitRows.push(
        { key: 'salesTax', label: 'Sales tax, owed to the state', amount: fromCents(taxCents) },
        { key: 'cardFees', label: 'Card fees, to the processor', amount: fromCents(cardFeeCents) }
    );
    if (giftCents !== 0) {
        splitRows.push({ key: 'giftCardsSold', label: 'Gift cards sold', amount: fromCents(giftCents) });
    }
    if (notSplitCents !== 0) {
        splitRows.push({ key: 'notSplit', label: 'Not split', amount: fromCents(notSplitCents), muted: true });
    }
    const totalCents = toCents(metrics.totalCollected);
    const rowsCents = splitRows.reduce((sum, row) => sum + toCents(row.amount), 0);

    const split: SalesSummary['split'] = {
        rows: splitRows,
        total: fromCents(totalCents),
        notSplit: fromCents(notSplitCents),
        sumsToCollected: rowsCents === totalCents,
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

    return { headline, balance, split, books };
}

// ---------------------------------------------------------------------------
// CSV and print

type Books = SalesSummary['books'];

interface BooksReportInput {
    books: Books;
    rangeLabel: string;
    consignorLabel: string;
}

type CsvCell = string | { amount: string };

function csvCell(cell: CsvCell): string {
    // Amounts are plain numbers. Text that starts with = + - @ would be read
    // as a formula by spreadsheets, so it gets a leading apostrophe.
    if (typeof cell !== 'string') return cell.amount;
    const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvAmount(line: { amount: number; deduct?: boolean }): CsvCell {
    const amount = line.deduct && !isZeroAmount(line.amount) ? -line.amount : line.amount;
    return { amount: roundMoney(amount).toFixed(2) };
}

export function booksCsv({ books, rangeLabel, consignorLabel }: BooksReportInput): string {
    const rows: CsvCell[][] = [
        ['Sales summary for the books'],
        ['Date range', rangeLabel],
        ['Vendor', consignorLabel],
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

export function buildBooksReportHtml({ books, rangeLabel, consignorLabel }: BooksReportInput): string {
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
    <div class="meta">Date range: ${escapeHtml(rangeLabel)} &middot; Vendor: ${escapeHtml(consignorLabel)}</div>
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
        ? `${start.number}-${end.number} ${end.period}`
        : `${start.number} ${start.period}-${end.number} ${end.period}`;
}

export function busiestSlot(
    data: { hourlyBreakdown: SlotBucket[]; weekdayBreakdown: SlotBucket[] } | null | undefined
): BusiestSlot | null {
    if (!data) return null;
    const day = pickBusiest(data.weekdayBreakdown);
    const hour = pickBusiest(data.hourlyBreakdown);
    if (!day || !hour) return null;
    const range = hourRange(hour.index);
    return { weekday: day.bucket.label, hourRange: range, text: `${day.bucket.label}, ${range}` };
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
