import { calculateStripeTerminalProcessingFee } from './cardFees';
import { getConsignorDisplayName, getConsignorPayToName } from './consignors';
import { isConsignorScheduled } from './consignorStatus';
import { type CsvCell, toLocalDateSlug } from './csvExport';
import { supabase } from './supabase';
import type { BoothRentPayment, Consignor, Item, PaymentBreakdownEntry, PaymentMethod, Payout } from '../types';

const SUPABASE_PAGE_SIZE = 1000;

type SupabasePagedQuery<T> = {
    range: (from: number, to: number) => PromiseLike<{
        data: T[] | null;
        error: unknown;
    }>;
};

interface SaleJoin {
    id: string;
    completed_at: string;
    tax_amount: number | string | null;
    subtotal: number | string | null;
    total: number | string | null;
    discount_total?: number | string | null;
    payment_method: PaymentMethod;
    payment_breakdown?: PaymentBreakdownEntry[] | null;
}

interface SaleItemReportRow {
    id: string;
    sale_id: string;
    consignor_id: string;
    sku: string | null;
    name: string;
    price: number | string;
    quantity: number;
    commission_split: number | string;
    discount_amount?: number | string | null;
    consignor_pays_card_fee?: boolean | null;
    sale?: SaleJoin | SaleJoin[] | null;
}

interface SaleItemContextRow {
    id: string;
    sale_id: string;
    price: number | string;
    quantity: number;
    discount_amount?: number | string | null;
}

interface RefundRow {
    sale_id: string;
    items: Array<{ sale_item_id: string; quantity: number }> | null;
}

export interface ConsignorReportTotals {
    salesCount: number;
    itemsSold: number;
    totalSales: number;
    consignorShare: number;
    storeShare: number;
    taxCollected: number;
    creditCardFees: number;
}

export interface CompletedPayoutSaleLine {
    saleItemId: string;
    saleDate: string;
    saleId: string;
    sku: string;
    itemName: string;
    quantity: number;
    refundedQuantity: number;
    unitPrice: number;
    lineTotal: number;
    commissionSplit: number;
    consignorShare: number;
    storeShare: number;
    taxAmount: number;
    creditCardFee: number;
}

export interface CompletedPayoutDeductionLine {
    id: string;
    type: 'booth_rent' | 'marketing' | 'ledger' | 'invoice';
    label: string;
    description: string | null;
    amount: number;
}

export interface CompletedPayoutDetails {
    saleLines: CompletedPayoutSaleLine[];
    deductions: CompletedPayoutDeductionLine[];
}

export interface ConsignorReportData {
    totalsByConsignor: Map<string, ConsignorReportTotals>;
    linesByConsignor: Map<string, CompletedPayoutSaleLine[]>;
    inventoryByConsignor: Map<string, Item[]>;
    payoutsByConsignor: Map<string, Payout[]>;
    boothRentPaymentsByConsignor: Map<string, BoothRentPayment[]>;
}

export interface ConsignorTaxReportOptions {
    startDate: string;
    endDate: string;
    reviewThreshold: number;
    generatedAt?: Date;
}

export interface ConsignorTaxReportSalesTotals {
    salesCount: number;
    itemsSold: number;
    grossSales: number;
    taxCollected: number;
    consignorEarnings: number;
    storeShare: number;
    cardFeesDeducted: number;
}

export interface ConsignorTaxReportPayoutTotals {
    payoutCount: number;
    totalPaid: number;
    grossSales: number;
    taxCollected: number;
    storeShare: number;
    cardFeesDeducted: number;
    boothRentDeductions: number;
    marketingFeeDeductions: number;
    ledgerDeductions: number;
    invoiceDeductions: number;
    totalDeductions: number;
}

export interface ConsignorTaxReportRow {
    consignor: Consignor;
    salesLines: CompletedPayoutSaleLine[];
    payouts: Payout[];
    salesTotals: ConsignorTaxReportSalesTotals;
    payoutTotals: ConsignorTaxReportPayoutTotals;
    earnedLessPaid: number;
    openPayoutEstimate: number;
    lastCoveredPayoutThrough: string | null;
    missingW9: boolean;
    thresholdReview: boolean;
    thresholdBasis: string;
}

export interface ConsignorTaxReport {
    startDate: string;
    endDate: string;
    reviewThreshold: number;
    generatedAt: string;
    rows: ConsignorTaxReportRow[];
    totals: {
        sales: ConsignorTaxReportSalesTotals;
        payouts: ConsignorTaxReportPayoutTotals;
        consignorCount: number;
        reviewCount: number;
        missingW9Count: number;
    };
}

interface SaleFinancialContext {
    orderDiscountRatio: number;
    netSubtotal: number;
}

export type ConsignorsSummaryExportField =
    | 'consignorId'
    | 'name'
    | 'business'
    | 'individual'
    | 'payTo'
    | 'email'
    | 'phone'
    | 'address'
    | 'booth'
    | 'commissionPercent'
    | 'monthlyRent'
    | 'cardFeePolicy'
    | 'w9OnFile'
    | 'dealerDiscountPercent'
    | 'status'
    | 'products'
    | 'unitsOnHand'
    | 'inventoryValue'
    | 'salesCount'
    | 'itemsSold'
    | 'totalSales'
    | 'consignorEarnings'
    | 'storeShare'
    | 'cardFeesDeducted'
    | 'taxCollected'
    | 'payoutCount'
    | 'totalPaid'
    | 'lastPayoutDate'
    | 'memberSince';

export type ConsignorDetailExportSection =
    | 'profile'
    | 'salesSummary'
    | 'inventory'
    | 'salesLineItems'
    | 'payouts'
    | 'boothRentPayments';

export const CONSIGNORS_SUMMARY_EXPORT_FIELD_GROUPS: Array<{
    title: string;
    options: Array<{ key: ConsignorsSummaryExportField; label: string }>;
}> = [
    {
        title: 'Identity',
        options: [
            { key: 'consignorId', label: 'Consignor ID' },
            { key: 'name', label: 'Name' },
            { key: 'business', label: 'Business' },
            { key: 'individual', label: 'Individual' },
            { key: 'payTo', label: 'Pay To' },
            { key: 'memberSince', label: 'Member Since' },
        ],
    },
    {
        title: 'Contact',
        options: [
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'address', label: 'Address' },
            { key: 'booth', label: 'Booth' },
        ],
    },
    {
        title: 'Account',
        options: [
            { key: 'commissionPercent', label: 'Commission %' },
            { key: 'monthlyRent', label: 'Monthly Rent' },
            { key: 'cardFeePolicy', label: 'Card Fee Policy' },
            { key: 'w9OnFile', label: 'W-9 On File' },
            { key: 'dealerDiscountPercent', label: 'Dealer Discount %' },
            { key: 'status', label: 'Status' },
        ],
    },
    {
        title: 'Inventory',
        options: [
            { key: 'products', label: 'Products' },
            { key: 'unitsOnHand', label: 'Units On Hand' },
            { key: 'inventoryValue', label: 'Inventory Value' },
        ],
    },
    {
        title: 'Sales',
        options: [
            { key: 'salesCount', label: 'Sales Count' },
            { key: 'itemsSold', label: 'Items Sold' },
            { key: 'totalSales', label: 'Total Sales' },
            { key: 'consignorEarnings', label: 'Consignor Earnings' },
            { key: 'storeShare', label: 'Store Share' },
            { key: 'cardFeesDeducted', label: 'Card Fees Deducted' },
            { key: 'taxCollected', label: 'Tax Collected' },
        ],
    },
    {
        title: 'Payouts',
        options: [
            { key: 'payoutCount', label: 'Payout Count' },
            { key: 'totalPaid', label: 'Total Paid' },
            { key: 'lastPayoutDate', label: 'Last Payout Date' },
        ],
    },
];

export const DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS = CONSIGNORS_SUMMARY_EXPORT_FIELD_GROUPS
    .flatMap((group) => group.options.map((option) => option.key));

export const CONSIGNOR_DETAIL_EXPORT_SECTION_GROUPS: Array<{
    title: string;
    options: Array<{ key: ConsignorDetailExportSection; label: string }>;
}> = [
    {
        title: 'Report Sections',
        options: [
            { key: 'profile', label: 'Consignor Profile' },
            { key: 'salesSummary', label: 'Sales Summary' },
            { key: 'inventory', label: 'Inventory' },
            { key: 'salesLineItems', label: 'Sales Line Items' },
            { key: 'payouts', label: 'Payouts' },
            { key: 'boothRentPayments', label: 'Booth Rent Payments' },
        ],
    },
];

export const DEFAULT_CONSIGNOR_DETAIL_EXPORT_SECTIONS = CONSIGNOR_DETAIL_EXPORT_SECTION_GROUPS
    .flatMap((group) => group.options.map((option) => option.key));

async function fetchAllRows<T>(createQuery: () => SupabasePagedQuery<T>): Promise<T[]> {
    const rows: T[] = [];

    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
        const to = from + SUPABASE_PAGE_SIZE - 1;
        const { data, error } = await createQuery().range(from, to);

        if (error) throw error;

        const page = data || [];
        rows.push(...page);

        if (page.length < SUPABASE_PAGE_SIZE) break;
    }

    return rows;
}

function roundCurrency(value: number): number {
    return Number(value.toFixed(2));
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function money(value: number | null | undefined): string {
    return Number(value || 0).toFixed(2);
}

function getStatusLabel(consignor: Consignor): string {
    if (!consignor.is_active) return 'Inactive';
    if (isConsignorScheduled(consignor)) return 'Scheduled';
    return 'Active';
}

function getAddress(consignor: Consignor): string {
    return [
        consignor.address,
        consignor.address_line_2,
        [consignor.city, consignor.state, consignor.postal_code].filter(Boolean).join(' '),
        consignor.country,
    ].filter(Boolean).join(', ');
}

function getPersonName(consignor: Consignor): string {
    return [consignor.first_name, consignor.last_name].filter(Boolean).join(' ');
}

function getJoinedSaleData(row: SaleItemReportRow): SaleJoin | null {
    if (!row.sale) return null;
    return Array.isArray(row.sale) ? row.sale[0] || null : row.sale;
}

function getCardTenderAmount(sale: SaleJoin, saleNetSubtotal: number): number {
    if (sale.payment_method === 'split') {
        return (sale.payment_breakdown || [])
            .filter((entry) => entry.method === 'card')
            .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    }

    return sale.payment_method === 'card' ? Number(sale.total || saleNetSubtotal) : 0;
}

function buildSaleFinancialContext(
    rows: SaleItemContextRow[],
    saleDiscountTotals: Map<string, number>
): Map<string, SaleFinancialContext> {
    const rowsBySale = new Map<string, SaleItemContextRow[]>();
    const context = new Map<string, SaleFinancialContext>();

    for (const row of rows) {
        const existing = rowsBySale.get(row.sale_id) || [];
        existing.push(row);
        rowsBySale.set(row.sale_id, existing);
    }

    for (const [saleId, saleRows] of rowsBySale) {
        let subtotalAfterItemDiscounts = 0;
        let totalItemDiscounts = 0;

        for (const row of saleRows) {
            const rawLineTotal = Number(row.price) * Number(row.quantity || 0);
            const itemDiscount = Math.max(0, Math.min(Number(row.discount_amount || 0), rawLineTotal));
            subtotalAfterItemDiscounts += Math.max(0, rawLineTotal - itemDiscount);
            totalItemDiscounts += itemDiscount;
        }

        const saleDiscountTotal = Math.max(0, saleDiscountTotals.get(saleId) || 0);
        const orderDiscountTotal = Math.max(
            0,
            Math.min(saleDiscountTotal - totalItemDiscounts, subtotalAfterItemDiscounts)
        );

        context.set(saleId, {
            orderDiscountRatio: subtotalAfterItemDiscounts > 0 ? orderDiscountTotal / subtotalAfterItemDiscounts : 0,
            netSubtotal: Math.max(0, subtotalAfterItemDiscounts - orderDiscountTotal),
        });
    }

    return context;
}

function getRefundedQuantities(refunds: RefundRow[]): Map<string, number> {
    const refundedItemsMap = new Map<string, number>();

    for (const refund of refunds) {
        for (const item of refund.items || []) {
            const current = refundedItemsMap.get(item.sale_item_id) || 0;
            refundedItemsMap.set(item.sale_item_id, current + Number(item.quantity || 0));
        }
    }

    return refundedItemsMap;
}

function addToMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
    const existing = map.get(key) || [];
    existing.push(value);
    map.set(key, existing);
}

function sumInventoryValue(items: Item[]): number {
    return items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 0)), 0);
}

function sumInventoryUnits(items: Item[]): number {
    return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function emptyTotals(): ConsignorReportTotals {
    return {
        salesCount: 0,
        itemsSold: 0,
        totalSales: 0,
        consignorShare: 0,
        storeShare: 0,
        taxCollected: 0,
        creditCardFees: 0,
    };
}

function safeFilenamePart(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'consignor';
}

function parseReportDate(value: string, endOfDay = false): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const parsed = new Date(year, month - 1, day);
        parsed.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return parsed;
    }

    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return new Date(NaN);
    if (endOfDay) parsed.setHours(23, 59, 59, 999);
    return parsed;
}

function isDateInReportRange(value: string, startDate: string, endDate: string): boolean {
    const target = new Date(value);
    const start = parseReportDate(startDate);
    const end = parseReportDate(endDate, true);

    if (!Number.isFinite(target.getTime())) return false;
    if (Number.isFinite(start.getTime()) && target < start) return false;
    if (Number.isFinite(end.getTime()) && target > end) return false;
    return true;
}

function isDateOnOrBeforeReportEnd(value: string, endDate: string): boolean {
    const target = new Date(value);
    const end = parseReportDate(endDate, true);

    if (!Number.isFinite(target.getTime())) return false;
    if (Number.isFinite(end.getTime()) && target > end) return false;
    return true;
}

function getCoveredThroughDate(payout: Pick<Payout, 'period_end' | 'paid_at'>): Date | null {
    const paidAt = new Date(payout.paid_at);
    const periodEnd = new Date(payout.period_end || payout.paid_at);
    if (Number.isNaN(paidAt.getTime()) && Number.isNaN(periodEnd.getTime())) return null;
    if (Number.isNaN(periodEnd.getTime())) return paidAt;
    if (Number.isNaN(paidAt.getTime())) return periodEnd;

    return periodEnd > paidAt ? paidAt : periodEnd;
}

function getPayoutCoverageWindow(
    payout: Pick<Payout, 'period_start' | 'period_end' | 'paid_at'>
): { start: Date; end: Date } | null {
    const coveredThrough = getCoveredThroughDate(payout);
    if (!coveredThrough || !Number.isFinite(coveredThrough.getTime())) return null;

    const periodStart = new Date(payout.period_start || payout.paid_at);
    const paidAt = new Date(payout.paid_at);
    const start = Number.isFinite(periodStart.getTime()) ? periodStart : paidAt;
    if (!Number.isFinite(start.getTime())) return null;

    return { start, end: coveredThrough };
}

function isSaleCoveredByPayout(
    saleDate: Date,
    payout: Pick<Payout, 'period_start' | 'period_end' | 'paid_at'>
): boolean {
    const coverageWindow = getPayoutCoverageWindow(payout);
    if (!coverageWindow || !Number.isFinite(saleDate.getTime())) return false;

    return saleDate >= coverageWindow.start && saleDate <= coverageWindow.end;
}

function isSaleCoveredByAnyPayout(
    saleDate: Date,
    payouts: Array<Pick<Payout, 'period_start' | 'period_end' | 'paid_at'>>
): boolean {
    return payouts.some((payout) => isSaleCoveredByPayout(saleDate, payout));
}

function getLatestCoveredThroughDate(payouts: Payout[], endDate: string): Date | null {
    return payouts
        .filter((payout) => isDateOnOrBeforeReportEnd(payout.paid_at, endDate))
        .reduce<Date | null>((latest, payout) => {
            const boundaryCandidate = getCoveredThroughDate(payout);
            if (!boundaryCandidate) return latest;
            if (!latest || boundaryCandidate > latest) return boundaryCandidate;
            return latest;
        }, null);
}

function getDeferredBalanceCarryover(payouts: Payout[], endDate: string): number {
    let deferredBalanceOutstanding = 0;
    const payoutTimeline = payouts
        .filter((payout) => isDateOnOrBeforeReportEnd(payout.paid_at, endDate))
        .sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());

    for (const payout of payoutTimeline) {
        if (!payout.is_partial) {
            const isDateRangePayout = payout.notes?.startsWith('[Range Payout:') === true;
            const includesDeferredCarryover = payout.notes?.includes('[Deferred Carryover Included]') === true;
            if (!isDateRangePayout || includesDeferredCarryover) {
                deferredBalanceOutstanding = 0;
            }
            continue;
        }

        const originalDue = Number(
            payout.original_amount_due !== null && payout.original_amount_due !== undefined
                ? payout.original_amount_due
                : payout.amount
        );
        const paid = Number(payout.amount || 0);
        const remaining = Math.max(0, originalDue - paid);
        const disposition = payout.balance_disposition || 'deferred';

        deferredBalanceOutstanding = disposition === 'deferred' ? remaining : 0;
    }

    return roundCurrency(deferredBalanceOutstanding);
}

function getOpenPayoutEstimate(
    salesLines: CompletedPayoutSaleLine[],
    payouts: Payout[],
    endDate: string
): { amount: number; lastCoveredThrough: string | null } {
    const lastCoveredThroughDate = getLatestCoveredThroughDate(payouts, endDate);
    const eligiblePayouts = payouts.filter((payout) => isDateOnOrBeforeReportEnd(payout.paid_at, endDate));
    const deferredCarryover = getDeferredBalanceCarryover(payouts, endDate);
    const openSales = salesLines
        .filter((line) => {
            const saleDate = new Date(line.saleDate);
            return Number.isFinite(saleDate.getTime()) && !isSaleCoveredByAnyPayout(saleDate, eligiblePayouts);
        })
        .reduce((sum, line) => sum + Number(line.consignorShare || 0), 0);

    return {
        amount: roundCurrency(deferredCarryover + openSales),
        lastCoveredThrough: lastCoveredThroughDate ? lastCoveredThroughDate.toISOString() : null,
    };
}

function emptyTaxSalesTotals(): ConsignorTaxReportSalesTotals {
    return {
        salesCount: 0,
        itemsSold: 0,
        grossSales: 0,
        taxCollected: 0,
        consignorEarnings: 0,
        storeShare: 0,
        cardFeesDeducted: 0,
    };
}

function emptyTaxPayoutTotals(): ConsignorTaxReportPayoutTotals {
    return {
        payoutCount: 0,
        totalPaid: 0,
        grossSales: 0,
        taxCollected: 0,
        storeShare: 0,
        cardFeesDeducted: 0,
        boothRentDeductions: 0,
        marketingFeeDeductions: 0,
        ledgerDeductions: 0,
        invoiceDeductions: 0,
        totalDeductions: 0,
    };
}

function addTaxSalesTotals(
    totals: ConsignorTaxReportSalesTotals,
    next: ConsignorTaxReportSalesTotals
): ConsignorTaxReportSalesTotals {
    return {
        salesCount: totals.salesCount + next.salesCount,
        itemsSold: totals.itemsSold + next.itemsSold,
        grossSales: roundCurrency(totals.grossSales + next.grossSales),
        taxCollected: roundCurrency(totals.taxCollected + next.taxCollected),
        consignorEarnings: roundCurrency(totals.consignorEarnings + next.consignorEarnings),
        storeShare: roundCurrency(totals.storeShare + next.storeShare),
        cardFeesDeducted: roundCurrency(totals.cardFeesDeducted + next.cardFeesDeducted),
    };
}

function addTaxPayoutTotals(
    totals: ConsignorTaxReportPayoutTotals,
    next: ConsignorTaxReportPayoutTotals
): ConsignorTaxReportPayoutTotals {
    return {
        payoutCount: totals.payoutCount + next.payoutCount,
        totalPaid: roundCurrency(totals.totalPaid + next.totalPaid),
        grossSales: roundCurrency(totals.grossSales + next.grossSales),
        taxCollected: roundCurrency(totals.taxCollected + next.taxCollected),
        storeShare: roundCurrency(totals.storeShare + next.storeShare),
        cardFeesDeducted: roundCurrency(totals.cardFeesDeducted + next.cardFeesDeducted),
        boothRentDeductions: roundCurrency(totals.boothRentDeductions + next.boothRentDeductions),
        marketingFeeDeductions: roundCurrency(totals.marketingFeeDeductions + next.marketingFeeDeductions),
        ledgerDeductions: roundCurrency(totals.ledgerDeductions + next.ledgerDeductions),
        invoiceDeductions: roundCurrency(totals.invoiceDeductions + next.invoiceDeductions),
        totalDeductions: roundCurrency(totals.totalDeductions + next.totalDeductions),
    };
}

function getSalesTotalsForTaxReport(lines: CompletedPayoutSaleLine[]): ConsignorTaxReportSalesTotals {
    const saleIds = new Set<string>();
    const totals = emptyTaxSalesTotals();

    for (const line of lines) {
        const effectiveQuantity = Math.max(0, Number(line.quantity || 0) - Number(line.refundedQuantity || 0));
        if (effectiveQuantity > 0) saleIds.add(line.saleId);

        totals.itemsSold += effectiveQuantity;
        totals.grossSales += Number(line.lineTotal || 0);
        totals.taxCollected += Number(line.taxAmount || 0);
        totals.consignorEarnings += Number(line.consignorShare || 0);
        totals.storeShare += Number(line.storeShare || 0);
        totals.cardFeesDeducted += Number(line.creditCardFee || 0);
    }

    return {
        salesCount: saleIds.size,
        itemsSold: totals.itemsSold,
        grossSales: roundCurrency(totals.grossSales),
        taxCollected: roundCurrency(totals.taxCollected),
        consignorEarnings: roundCurrency(totals.consignorEarnings),
        storeShare: roundCurrency(totals.storeShare),
        cardFeesDeducted: roundCurrency(totals.cardFeesDeducted),
    };
}

function getPayoutTotalsForTaxReport(payouts: Payout[]): ConsignorTaxReportPayoutTotals {
    const totals = emptyTaxPayoutTotals();

    for (const payout of payouts) {
        totals.payoutCount += 1;
        totals.totalPaid += Number(payout.amount || 0);
        totals.grossSales += Number(payout.gross_sales || 0);
        totals.taxCollected += Number(payout.tax_collected || 0);
        totals.storeShare += Number(payout.store_share || 0);
        totals.cardFeesDeducted += Number(payout.credit_card_fees || 0);
        totals.boothRentDeductions += Number(payout.booth_rent_deduction || 0);
        totals.marketingFeeDeductions += Number(payout.marketing_fee_deduction || 0);
        totals.ledgerDeductions += Number(payout.ledger_deduction || 0);
        totals.invoiceDeductions += Number(payout.invoice_deduction || 0);
    }

    totals.totalDeductions = totals.boothRentDeductions
        + totals.marketingFeeDeductions
        + totals.ledgerDeductions
        + totals.invoiceDeductions;

    return {
        payoutCount: totals.payoutCount,
        totalPaid: roundCurrency(totals.totalPaid),
        grossSales: roundCurrency(totals.grossSales),
        taxCollected: roundCurrency(totals.taxCollected),
        storeShare: roundCurrency(totals.storeShare),
        cardFeesDeducted: roundCurrency(totals.cardFeesDeducted),
        boothRentDeductions: roundCurrency(totals.boothRentDeductions),
        marketingFeeDeductions: roundCurrency(totals.marketingFeeDeductions),
        ledgerDeductions: roundCurrency(totals.ledgerDeductions),
        invoiceDeductions: roundCurrency(totals.invoiceDeductions),
        totalDeductions: roundCurrency(totals.totalDeductions),
    };
}

function getThresholdBasis(
    salesTotals: ConsignorTaxReportSalesTotals,
    payoutTotals: ConsignorTaxReportPayoutTotals,
    reviewThreshold: number
): string {
    const paidMeetsThreshold = payoutTotals.totalPaid >= reviewThreshold;
    const earnedMeetsThreshold = salesTotals.consignorEarnings >= reviewThreshold;

    if (paidMeetsThreshold && earnedMeetsThreshold) return 'Payouts and earnings met review amount';
    if (paidMeetsThreshold) return 'Payouts met review amount';
    if (earnedMeetsThreshold) return 'Earnings met review amount';
    return '';
}

export function getDefaultConsignorTaxReviewThreshold(year: number): number {
    return year >= 2026 ? 2000 : 600;
}

export function buildConsignorTaxReportFromData(
    consignors: Consignor[],
    reportData: ConsignorReportData,
    options: ConsignorTaxReportOptions
): ConsignorTaxReport {
    const rows: ConsignorTaxReportRow[] = [];
    let totalSales = emptyTaxSalesTotals();
    let totalPayouts = emptyTaxPayoutTotals();
    let reviewCount = 0;
    let missingW9Count = 0;

    for (const consignor of consignors) {
        const allPayoutsForConsignor = reportData.payoutsByConsignor.get(consignor.id) || [];
        const salesLines = (reportData.linesByConsignor.get(consignor.id) || [])
            .filter((line) => isDateInReportRange(line.saleDate, options.startDate, options.endDate));
        const payouts = allPayoutsForConsignor
            .filter((payout) => isDateInReportRange(payout.paid_at, options.startDate, options.endDate));
        const salesTotals = getSalesTotalsForTaxReport(salesLines);
        const payoutTotals = getPayoutTotalsForTaxReport(payouts);
        const openPayoutEstimate = getOpenPayoutEstimate(salesLines, allPayoutsForConsignor, options.endDate);
        const thresholdBasis = getThresholdBasis(salesTotals, payoutTotals, options.reviewThreshold);
        const thresholdReview = thresholdBasis.length > 0;
        const missingW9 = !consignor.has_w9_filled_out;

        if (thresholdReview) reviewCount += 1;
        if (missingW9) missingW9Count += 1;
        totalSales = addTaxSalesTotals(totalSales, salesTotals);
        totalPayouts = addTaxPayoutTotals(totalPayouts, payoutTotals);

        rows.push({
            consignor,
            salesLines,
            payouts,
            salesTotals,
            payoutTotals,
            earnedLessPaid: roundCurrency(salesTotals.consignorEarnings - payoutTotals.totalPaid),
            openPayoutEstimate: openPayoutEstimate.amount,
            lastCoveredPayoutThrough: openPayoutEstimate.lastCoveredThrough,
            missingW9,
            thresholdReview,
            thresholdBasis,
        });
    }

    return {
        startDate: options.startDate,
        endDate: options.endDate,
        reviewThreshold: roundCurrency(options.reviewThreshold),
        generatedAt: (options.generatedAt || new Date()).toISOString(),
        rows,
        totals: {
            sales: totalSales,
            payouts: totalPayouts,
            consignorCount: rows.length,
            reviewCount,
            missingW9Count,
        },
    };
}

async function fetchConsignorReportData(
    consignorIds: string[],
    options: { includeInactiveInventory?: boolean } = {}
): Promise<ConsignorReportData> {
    if (consignorIds.length === 0) {
        return {
            totalsByConsignor: new Map(),
            linesByConsignor: new Map(),
            inventoryByConsignor: new Map(),
            payoutsByConsignor: new Map(),
            boothRentPaymentsByConsignor: new Map(),
        };
    }

    const fetchInventoryItems = () => {
        if (options.includeInactiveInventory) {
            return supabase
                .from('items')
                .select('*')
                .in('consignor_id', consignorIds)
                .order('sku');
        }

        return supabase
            .from('items')
            .select(`
                *,
                consignor:consignors!inner(id, is_active)
            `)
            .in('consignor_id', consignorIds)
            .eq('consignor.is_active', true)
            .order('sku');
    };

    const [saleItems, inventoryItems, payouts, boothRentPayments] = await Promise.all([
        fetchAllRows<SaleItemReportRow>(() => supabase
            .from('sale_items')
            .select('id, sale_id, consignor_id, sku, name, price, quantity, commission_split, discount_amount, consignor_pays_card_fee, sale:sales(id, completed_at, tax_amount, subtotal, total, discount_total, payment_method, payment_breakdown)')
            .in('consignor_id', consignorIds)
            .order('id')
        ),
        fetchAllRows<Item>(fetchInventoryItems),
        fetchAllRows<Payout>(() => supabase
            .from('payouts')
            .select('*')
            .in('consignor_id', consignorIds)
            .order('paid_at', { ascending: false })
        ),
        fetchAllRows<BoothRentPayment>(() => supabase
            .from('booth_rent_payments')
            .select('*')
            .in('consignor_id', consignorIds)
            .order('paid_at', { ascending: false })
        ),
    ]);

    const saleIds = Array.from(new Set(saleItems.map((item) => item.sale_id).filter(Boolean)));
    const [saleContextItems, refunds] = saleIds.length > 0
        ? await Promise.all([
            fetchAllRows<SaleItemContextRow>(() => supabase
                .from('sale_items')
                .select('id, sale_id, price, quantity, discount_amount')
                .in('sale_id', saleIds)
                .order('id')
            ),
            fetchAllRows<RefundRow>(() => supabase
                .from('refunds')
                .select('sale_id, items')
                .in('sale_id', saleIds)
                .order('created_at', { ascending: false })
            ),
        ])
        : [[], []];

    const saleFinancialContext = buildSaleFinancialContext(
        saleContextItems,
        new Map(
            saleItems.map((item) => [
                item.sale_id,
                Number(getJoinedSaleData(item)?.discount_total || 0),
            ])
        )
    );
    const refundedItemsMap = getRefundedQuantities(refunds);
    const totalsByConsignor = new Map<string, ConsignorReportTotals>();
    const linesByConsignor = new Map<string, CompletedPayoutSaleLine[]>();
    const inventoryByConsignor = new Map<string, Item[]>();
    const payoutsByConsignor = new Map<string, Payout[]>();
    const boothRentPaymentsByConsignor = new Map<string, BoothRentPayment[]>();
    const saleIdsByConsignor = new Map<string, Set<string>>();

    for (const item of inventoryItems) {
        addToMapArray(inventoryByConsignor, item.consignor_id, item);
    }

    for (const payout of payouts) {
        addToMapArray(payoutsByConsignor, payout.consignor_id, payout);
    }

    for (const payment of boothRentPayments) {
        addToMapArray(boothRentPaymentsByConsignor, payment.consignor_id, payment);
    }

    for (const item of saleItems) {
        const sale = getJoinedSaleData(item);
        if (!sale) continue;

        const rawLineTotal = Number(item.price) * Number(item.quantity || 0);
        const itemDiscount = Math.max(0, Math.min(Number(item.discount_amount || 0), rawLineTotal));
        const lineAfterItemDiscount = Math.max(0, rawLineTotal - itemDiscount);
        const saleContext = saleFinancialContext.get(item.sale_id);
        const orderDiscountRatio = saleContext?.orderDiscountRatio || 0;
        const netLineTotal = lineAfterItemDiscount * (1 - orderDiscountRatio);
        const saleNetSubtotal = saleContext?.netSubtotal || netLineTotal;
        const refundedQuantity = refundedItemsMap.get(item.id) || 0;
        const effectiveQuantity = Math.max(0, Number(item.quantity || 0) - refundedQuantity);
        const effectiveRatio = Number(item.quantity || 0) > 0 ? effectiveQuantity / Number(item.quantity || 0) : 0;
        const effectiveLineTotal = netLineTotal * effectiveRatio;
        const commissionSplit = Number(item.commission_split || 0);
        const cardTenderAmount = getCardTenderAmount(sale, saleNetSubtotal);
        const creditCardFee = cardTenderAmount > 0 && Boolean(item.consignor_pays_card_fee)
            ? (saleNetSubtotal > 0
                ? calculateStripeTerminalProcessingFee(cardTenderAmount) * (netLineTotal / saleNetSubtotal) * effectiveRatio
                : 0)
            : 0;
        const consignorShareBeforeFee = effectiveLineTotal * commissionSplit;
        const consignorShare = consignorShareBeforeFee - creditCardFee;
        const storeShare = effectiveLineTotal - consignorShareBeforeFee;
        const taxAmount = saleNetSubtotal > 0
            ? (netLineTotal / saleNetSubtotal) * Number(sale.tax_amount || 0) * effectiveRatio
            : 0;

        const currentTotals = totalsByConsignor.get(item.consignor_id) || emptyTotals();
        currentTotals.itemsSold += effectiveQuantity;
        currentTotals.totalSales += effectiveLineTotal;
        currentTotals.consignorShare += consignorShare;
        currentTotals.storeShare += storeShare;
        currentTotals.taxCollected += taxAmount;
        currentTotals.creditCardFees += creditCardFee;
        totalsByConsignor.set(item.consignor_id, currentTotals);

        if (effectiveQuantity > 0) {
            const existingSaleIds = saleIdsByConsignor.get(item.consignor_id) || new Set<string>();
            existingSaleIds.add(item.sale_id);
            saleIdsByConsignor.set(item.consignor_id, existingSaleIds);
        }

        addToMapArray(linesByConsignor, item.consignor_id, {
            saleItemId: item.id,
            saleDate: sale.completed_at,
            saleId: item.sale_id,
            sku: item.sku || '',
            itemName: item.name,
            quantity: Number(item.quantity || 0),
            refundedQuantity,
            unitPrice: Number(item.price || 0),
            lineTotal: roundCurrency(effectiveLineTotal),
            commissionSplit,
            consignorShare: roundCurrency(consignorShare),
            storeShare: roundCurrency(storeShare),
            taxAmount: roundCurrency(taxAmount),
            creditCardFee: roundCurrency(creditCardFee),
        });
    }

    for (const [consignorId, saleIdsForConsignor] of saleIdsByConsignor) {
        const currentTotals = totalsByConsignor.get(consignorId) || emptyTotals();
        currentTotals.salesCount = saleIdsForConsignor.size;
        totalsByConsignor.set(consignorId, currentTotals);
    }

    for (const [consignorId, lines] of linesByConsignor) {
        linesByConsignor.set(
            consignorId,
            lines.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
        );
    }

    return {
        totalsByConsignor,
        linesByConsignor,
        inventoryByConsignor,
        payoutsByConsignor,
        boothRentPaymentsByConsignor,
    };
}

export async function loadConsignorTaxReport(options: ConsignorTaxReportOptions): Promise<ConsignorTaxReport> {
    const consignors = await fetchAllRows<Consignor>(() => supabase
        .from('consignors')
        .select('*')
        .order('consignor_number')
    );
    const reportData = await fetchConsignorReportData(consignors.map((consignor) => consignor.id));

    return buildConsignorTaxReportFromData(consignors, reportData, options);
}

export function buildConsignorTaxSummaryFilename(report: Pick<ConsignorTaxReport, 'startDate' | 'endDate'>): string {
    return `consignor-tax-summary-${report.startDate}-to-${report.endDate}-${toLocalDateSlug()}.csv`;
}

export function buildConsignorTaxDetailFilename(report: Pick<ConsignorTaxReport, 'startDate' | 'endDate'>): string {
    return `consignor-tax-detail-${report.startDate}-to-${report.endDate}-${toLocalDateSlug()}.csv`;
}

export function buildConsignorTaxSummaryCsvRows(report: ConsignorTaxReport): CsvCell[][] {
    const rows: CsvCell[][] = [[
        'Period Start',
        'Period End',
        'Consignor ID',
        'Name',
        'Pay To',
        'Business',
        'Individual',
        'Email',
        'Phone',
        'Address',
        'Status',
        'W-9 On File',
        'Sales Count',
        'Items Sold',
        'Gross Sales',
        'Tax Collected',
        'Consignor Earnings',
        'Store Share',
        'Card Fees Deducted',
        'Payout Count',
        'Total Paid',
        'Booth Rent Deductions',
        'Marketing Fee Deductions',
        'Ledger Deductions',
        'Invoice Deductions',
        'Total Deductions',
        'Open Payout Estimate',
        'Last Covered Payout Through',
        'Sale-Date Earnings Less Paid',
        '1099 Review Amount',
        'Review Status',
        'Review Reason',
    ]];

    for (const row of report.rows) {
        rows.push([
            report.startDate,
            report.endDate,
            row.consignor.consignor_number,
            getConsignorDisplayName(row.consignor),
            getConsignorPayToName(row.consignor),
            row.consignor.business_name || '',
            getPersonName(row.consignor),
            row.consignor.email || '',
            row.consignor.phone || '',
            getAddress(row.consignor),
            getStatusLabel(row.consignor),
            row.consignor.has_w9_filled_out ? 'Yes' : 'No',
            row.salesTotals.salesCount,
            row.salesTotals.itemsSold,
            row.salesTotals.grossSales.toFixed(2),
            row.salesTotals.taxCollected.toFixed(2),
            row.salesTotals.consignorEarnings.toFixed(2),
            row.salesTotals.storeShare.toFixed(2),
            row.salesTotals.cardFeesDeducted.toFixed(2),
            row.payoutTotals.payoutCount,
            row.payoutTotals.totalPaid.toFixed(2),
            row.payoutTotals.boothRentDeductions.toFixed(2),
            row.payoutTotals.marketingFeeDeductions.toFixed(2),
            row.payoutTotals.ledgerDeductions.toFixed(2),
            row.payoutTotals.invoiceDeductions.toFixed(2),
            row.payoutTotals.totalDeductions.toFixed(2),
            row.openPayoutEstimate.toFixed(2),
            row.lastCoveredPayoutThrough || '',
            row.earnedLessPaid.toFixed(2),
            report.reviewThreshold.toFixed(2),
            row.thresholdReview ? 'Review' : 'Below review amount',
            row.thresholdBasis,
        ]);
    }

    return rows;
}

export function buildConsignorTaxDetailCsvRows(report: ConsignorTaxReport): CsvCell[][] {
    const rows: CsvCell[][] = [[
        'Record Type',
        'Period Start',
        'Period End',
        'Consignor ID',
        'Name',
        'Date',
        'Reference',
        'SKU',
        'Item',
        'Quantity',
        'Refunded Quantity',
        'Unit Price',
        'Gross Sales',
        'Tax Collected',
        'Commission %',
        'Consignor Earnings',
        'Store Share',
        'Card Fee Deducted',
        'Payout Amount',
        'Booth Rent Deduction',
        'Marketing Fee Deduction',
        'Ledger Deduction',
        'Invoice Deduction',
        'Partial/Carryover Adjustment',
        'Notes',
    ]];

    for (const row of report.rows) {
        for (const line of row.salesLines) {
            rows.push([
                'Sale Line',
                report.startDate,
                report.endDate,
                row.consignor.consignor_number,
                getConsignorDisplayName(row.consignor),
                new Date(line.saleDate).toLocaleString(),
                line.saleId,
                line.sku,
                line.itemName,
                line.quantity,
                line.refundedQuantity,
                line.unitPrice.toFixed(2),
                line.lineTotal.toFixed(2),
                line.taxAmount.toFixed(2),
                (line.commissionSplit * 100).toFixed(2),
                line.consignorShare.toFixed(2),
                line.storeShare.toFixed(2),
                line.creditCardFee.toFixed(2),
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ]);
        }

        for (const payout of row.payouts) {
            rows.push([
                'Payout',
                report.startDate,
                report.endDate,
                row.consignor.consignor_number,
                getConsignorDisplayName(row.consignor),
                new Date(payout.paid_at).toLocaleString(),
                payout.id,
                '',
                '',
                payout.items_sold,
                '',
                '',
                Number(payout.gross_sales || 0).toFixed(2),
                Number(payout.tax_collected || 0).toFixed(2),
                '',
                '',
                Number(payout.store_share || 0).toFixed(2),
                Number(payout.credit_card_fees || 0).toFixed(2),
                Number(payout.amount || 0).toFixed(2),
                Number(payout.booth_rent_deduction || 0).toFixed(2),
                Number(payout.marketing_fee_deduction || 0).toFixed(2),
                Number(payout.ledger_deduction || 0).toFixed(2),
                Number(payout.invoice_deduction || 0).toFixed(2),
                getPayoutCarryoverAdjustment(payout).toFixed(2),
                payout.notes || '',
            ]);
        }

        if (row.salesLines.length === 0 && row.payouts.length === 0) {
            rows.push([
                'No Activity',
                report.startDate,
                report.endDate,
                row.consignor.consignor_number,
                getConsignorDisplayName(row.consignor),
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ]);
        }
    }

    return rows;
}

function formatTaxReportDate(value: string): string {
    const parsed = parseReportDate(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : value;
}

function formatTaxReportDateTime(value: string): string {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function renderMoneyCell(value: number): string {
    return `$${money(value)}`;
}

function getPayoutStructuredDeductions(payout: Payout): number {
    return Number(payout.booth_rent_deduction || 0)
        + Number(payout.marketing_fee_deduction || 0)
        + Number(payout.ledger_deduction || 0)
        + Number(payout.invoice_deduction || 0);
}

function getPayoutExpectedAmountFromSavedFields(payout: Payout): number {
    return roundCurrency(
        Number(payout.gross_sales || 0)
        - Number(payout.store_share || 0)
        - Number(payout.credit_card_fees || 0)
        - getPayoutStructuredDeductions(payout)
    );
}

function getPayoutCarryoverAdjustment(payout: Payout): number {
    return roundCurrency(Number(payout.amount || 0) - getPayoutExpectedAmountFromSavedFields(payout));
}

function renderSignedMoneyCell(value: number): string {
    if (value > 0) return `+${renderMoneyCell(value)}`;
    if (value < 0) return `-${renderMoneyCell(Math.abs(value))}`;
    return renderMoneyCell(0);
}

export function printConsignorTaxStatements(report: ConsignorTaxReport, selectedIds?: string[]): boolean {
    const selectedIdSet = selectedIds && selectedIds.length > 0 ? new Set(selectedIds) : null;
    const rows = selectedIdSet
        ? report.rows.filter((row) => selectedIdSet.has(row.consignor.id))
        : report.rows;

    const statementHtml = rows.map((row) => {
        const saleRows = row.salesLines.map((line) => {
            const effectiveQuantity = Math.max(0, Number(line.quantity || 0) - Number(line.refundedQuantity || 0));
            return `
                <tr>
                    <td>${escapeHtml(formatTaxReportDateTime(line.saleDate))}</td>
                    <td>${escapeHtml(line.sku)}</td>
                    <td>${escapeHtml(line.itemName)}</td>
                    <td class="center">${effectiveQuantity}</td>
                    <td class="right">${renderMoneyCell(line.lineTotal)}</td>
                    <td class="right">${renderMoneyCell(line.consignorShare)}</td>
                    <td class="right">${renderMoneyCell(line.taxAmount)}</td>
                </tr>
            `;
        }).join('');
        const payoutRows = row.payouts.map((payout) => {
            const carryoverAdjustment = getPayoutCarryoverAdjustment(payout);
            return `
                <tr>
                    <td>${escapeHtml(formatTaxReportDateTime(payout.paid_at))}</td>
                    <td>${escapeHtml(payout.id.slice(0, 8).toUpperCase())}</td>
                    <td class="right">${renderMoneyCell(Number(payout.gross_sales || 0))}</td>
                    <td class="right">${renderMoneyCell(Number(payout.store_share || 0))}</td>
                    <td class="right">${renderMoneyCell(Number(payout.credit_card_fees || 0))}</td>
                    <td class="right">${renderMoneyCell(Number(payout.booth_rent_deduction || 0))}</td>
                    <td class="right">${renderMoneyCell(Number(payout.marketing_fee_deduction || 0))}</td>
                    <td class="right">${renderMoneyCell(Number(payout.ledger_deduction || 0) + Number(payout.invoice_deduction || 0))}</td>
                    <td class="right">${renderSignedMoneyCell(carryoverAdjustment)}</td>
                    <td class="right">${renderMoneyCell(Number(payout.amount || 0))}</td>
                </tr>
            `;
        }).join('');

        return `
            <section class="statement">
                <header class="statement-header">
                    <div>
                        <h1>Ravenlia Consignor Tax Statement</h1>
                        <p>${escapeHtml(formatTaxReportDate(report.startDate))} - ${escapeHtml(formatTaxReportDate(report.endDate))}</p>
                    </div>
                    <div class="brand">RavenPOS</div>
                </header>

                <div class="identity">
                    <div>
                        <span class="label">Consignor</span>
                        <strong>${escapeHtml(getConsignorDisplayName(row.consignor))}</strong>
                        <p>${escapeHtml(row.consignor.consignor_number)}</p>
                    </div>
                    <div>
                        <span class="label">Pay To</span>
                        <strong>${escapeHtml(getConsignorPayToName(row.consignor))}</strong>
                        <p>${escapeHtml(getAddress(row.consignor) || 'Address not recorded')}</p>
                    </div>
                    <div>
                        <span class="label">Tax Readiness</span>
                        <strong>${row.consignor.has_w9_filled_out ? 'W-9 on file' : 'Missing W-9'}</strong>
                        <p>${row.thresholdReview ? `1099 review: ${escapeHtml(row.thresholdBasis)}` : 'Below review amount'}</p>
                    </div>
                </div>

                <div class="summary-grid">
                    <div><span class="label">Gross Sales Earned</span><strong>${renderMoneyCell(row.salesTotals.grossSales)}</strong></div>
                    <div><span class="label">Consignor Earnings</span><strong>${renderMoneyCell(row.salesTotals.consignorEarnings)}</strong></div>
                    <div><span class="label">Payouts Paid</span><strong>${renderMoneyCell(row.payoutTotals.totalPaid)}</strong></div>
                    <div><span class="label">Open Payout Estimate</span><strong>${renderMoneyCell(row.openPayoutEstimate)}</strong></div>
                    <div><span class="label">Sales Tax Collected</span><strong>${renderMoneyCell(row.salesTotals.taxCollected)}</strong></div>
                    <div><span class="label">Store Share Retained</span><strong>${renderMoneyCell(row.payoutTotals.storeShare)}</strong></div>
                    <div><span class="label">Deductions From Payouts</span><strong>${renderMoneyCell(row.payoutTotals.totalDeductions)}</strong></div>
                    <div><span class="label">Sale-Date Reconciliation</span><strong>${renderMoneyCell(row.earnedLessPaid)}</strong></div>
                </div>

                <h2>Sales Earned During Period</h2>
                ${row.salesLines.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>SKU</th>
                                <th>Item</th>
                                <th class="center">Qty</th>
                                <th class="right">Gross Sales</th>
                                <th class="right">Earnings</th>
                                <th class="right">Sales Tax</th>
                            </tr>
                        </thead>
                        <tbody>${saleRows}</tbody>
                    </table>
                ` : '<p>No sales were recorded for this consignor during the selected period.</p>'}

                <h2>Payouts Paid During Period</h2>
                ${row.payouts.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Paid At</th>
                                <th>Payout</th>
                                <th class="right">Payout Gross Sales</th>
                                <th class="right">Store Share</th>
                                <th class="right">Card Fees</th>
                                <th class="right">Booth Rent</th>
                                <th class="right">Marketing</th>
                                <th class="right">Ledger/Invoice</th>
                                <th class="right">Partial/Carryover</th>
                                <th class="right">Paid</th>
                            </tr>
                        </thead>
                        <tbody>${payoutRows}</tbody>
                    </table>
                ` : '<p>No payouts were paid to this consignor during the selected period.</p>'}

                <p class="footer">
                    Open payout estimate uses sale earnings not covered by a payout window${row.lastCoveredPayoutThrough ? `; latest covered through ${escapeHtml(formatTaxReportDateTime(row.lastCoveredPayoutThrough))}` : ''}.
                    Sale-date reconciliation compares all sale earnings in the selected period to payouts paid in the selected period, so it can include timing differences and prior deferred carryover.
                    Sales tax is shown separately and is not included as consignor income.
                    Generated ${escapeHtml(formatTaxReportDateTime(report.generatedAt))}.
                </p>
            </section>
        `;
    }).join('');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Consignor Tax Statements</title>
            <style>
                * { box-sizing: border-box; }
                body { color: #111; font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 24px; }
                h1 { font-size: 19px; margin: 0 0 4px; }
                h2 { border-bottom: 1px solid #bbb; font-size: 13px; margin: 20px 0 8px; padding-bottom: 5px; }
                p { margin: 3px 0; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border-bottom: 1px solid #ddd; padding: 5px; text-align: left; vertical-align: top; }
                th { background: #f4f4f4; font-size: 10px; text-transform: uppercase; }
                .statement { break-after: page; page-break-after: always; }
                .statement:last-child { break-after: auto; page-break-after: auto; }
                .statement-header { align-items: flex-start; border-bottom: 2px solid #111; display: flex; justify-content: space-between; margin-bottom: 16px; padding-bottom: 10px; }
                .brand { font-size: 14px; font-weight: bold; text-transform: uppercase; }
                .identity, .summary-grid { display: grid; gap: 8px 14px; grid-template-columns: repeat(3, 1fr); margin: 12px 0; }
                .identity div, .summary-grid div { border: 1px solid #ddd; padding: 8px; }
                .label { color: #666; display: block; font-size: 9px; text-transform: uppercase; }
                .right { text-align: right; }
                .center { text-align: center; }
                .footer { color: #666; font-size: 9px; margin-top: 22px; }
                @media print {
                    body { padding: 0; }
                    @page { margin: 0.5in; }
                }
            </style>
        </head>
        <body>${statementHtml || '<p>No consignor statements selected.</p>'}</body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
    return true;
}

function getJoinedRecord<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] || null : value;
}

export async function loadCompletedPayoutDetails(payout: Payout): Promise<CompletedPayoutDetails> {
    const payoutIdFragment = payout.id.slice(0, 8);
    const [reportData, boothRentPayments, marketingAllocations, ledgerEntries, invoiceDeductions] = await Promise.all([
        fetchConsignorReportData([payout.consignor_id]),
        fetchAllRows<{
            id: string;
            amount: number | string;
            period_month: number;
            period_year: number;
            notes: string | null;
        }>(() => supabase
            .from('booth_rent_payments')
            .select('id, amount, period_month, period_year, notes')
            .eq('consignor_id', payout.consignor_id)
            .ilike('notes', `%${payoutIdFragment}%`)
            .order('period_year')
            .order('period_month')
        ),
        fetchAllRows<{
            id: string;
            amount: number | string;
            marketing_fee: { title: string; description: string | null } | Array<{ title: string; description: string | null }> | null;
        }>(() => supabase
            .from('marketing_fee_allocations')
            .select('id, amount, marketing_fee:marketing_fees(title, description)')
            .eq('deducted_payout_id', payout.id)
            .order('created_at')
        ),
        fetchAllRows<{
            id: string;
            description: string;
            amount: number | string;
        }>(() => supabase
            .from('vendor_ledger_entries')
            .select('id, description, amount')
            .eq('deducted_payout_id', payout.id)
            .order('created_at')
        ),
        fetchAllRows<{
            id: string;
            amount: number | string;
            invoice: { id: string; recipient_name: string; notes: string | null } | Array<{ id: string; recipient_name: string; notes: string | null }> | null;
        }>(() => supabase
            .from('invoice_payout_deductions')
            .select('id, amount, invoice:invoices(id, recipient_name, notes)')
            .eq('payout_id', payout.id)
            .order('created_at')
        ),
    ]);

    const periodStart = new Date(payout.period_start).getTime();
    const periodEnd = new Date(payout.period_end).getTime();
    const saleLines = (reportData.linesByConsignor.get(payout.consignor_id) || []).filter((line) => {
        const saleDate = new Date(line.saleDate).getTime();
        return Number.isFinite(saleDate) && saleDate >= periodStart && saleDate <= periodEnd;
    });

    const deductions: CompletedPayoutDeductionLine[] = [
        ...boothRentPayments.map((payment) => ({
            id: payment.id,
            type: 'booth_rent' as const,
            label: `Booth Rent ${payment.period_month}/${payment.period_year}`,
            description: payment.notes,
            amount: Number(payment.amount || 0),
        })),
        ...marketingAllocations.map((allocation) => {
            const fee = getJoinedRecord(allocation.marketing_fee);
            return {
                id: allocation.id,
                type: 'marketing' as const,
                label: fee?.title || 'Marketing Fee',
                description: fee?.description || null,
                amount: Number(allocation.amount || 0),
            };
        }),
        ...ledgerEntries.map((entry) => ({
            id: entry.id,
            type: 'ledger' as const,
            label: entry.description,
            description: null,
            amount: Number(entry.amount || 0),
        })),
        ...invoiceDeductions.map((deduction) => {
            const invoice = getJoinedRecord(deduction.invoice);
            return {
                id: deduction.id,
                type: 'invoice' as const,
                label: invoice ? `Invoice #${invoice.id.slice(0, 8).toUpperCase()}` : 'Vendor Invoice',
                description: invoice?.notes || invoice?.recipient_name || null,
                amount: Number(deduction.amount || 0),
            };
        }),
    ];

    return { saleLines, deductions };
}

export function buildConsignorsSummaryFilename(): string {
    return `consignors-report-${toLocalDateSlug()}.csv`;
}

export function buildConsignorDetailFilename(consignor: Consignor): string {
    return `consignor-${safeFilenamePart(consignor.consignor_number)}-${safeFilenamePart(getConsignorDisplayName(consignor))}-report-${toLocalDateSlug()}.csv`;
}

interface SummaryFieldContext {
    consignor: Consignor;
    inventory: Item[];
    totals: ConsignorReportTotals;
    payouts: Payout[];
    totalPaid: number;
    lastPayout: Payout | null;
}

const SUMMARY_FIELD_DEFINITIONS: Record<ConsignorsSummaryExportField, {
    header: string;
    getValue: (context: SummaryFieldContext) => CsvCell;
}> = {
    consignorId: {
        header: 'Consignor ID',
        getValue: ({ consignor }) => consignor.consignor_number,
    },
    name: {
        header: 'Name',
        getValue: ({ consignor }) => getConsignorDisplayName(consignor),
    },
    business: {
        header: 'Business',
        getValue: ({ consignor }) => consignor.business_name || '',
    },
    individual: {
        header: 'Individual',
        getValue: ({ consignor }) => getPersonName(consignor),
    },
    payTo: {
        header: 'Pay To',
        getValue: ({ consignor }) => getConsignorPayToName(consignor),
    },
    email: {
        header: 'Email',
        getValue: ({ consignor }) => consignor.email || '',
    },
    phone: {
        header: 'Phone',
        getValue: ({ consignor }) => consignor.phone || '',
    },
    address: {
        header: 'Address',
        getValue: ({ consignor }) => getAddress(consignor),
    },
    booth: {
        header: 'Booth',
        getValue: ({ consignor }) => consignor.booth_location || '',
    },
    commissionPercent: {
        header: 'Commission %',
        getValue: ({ consignor }) => (Number(consignor.commission_split || 0) * 100).toFixed(2),
    },
    monthlyRent: {
        header: 'Monthly Rent',
        getValue: ({ consignor }) => Number(consignor.monthly_booth_rent || 0).toFixed(2),
    },
    cardFeePolicy: {
        header: 'Card Fee Policy',
        getValue: ({ consignor }) => consignor.consignor_pays_card_fee ? 'Consignor pays' : 'Customer pays',
    },
    w9OnFile: {
        header: 'W-9 On File',
        getValue: ({ consignor }) => consignor.has_w9_filled_out ? 'Yes' : 'No',
    },
    dealerDiscountPercent: {
        header: 'Dealer Discount %',
        getValue: ({ consignor }) => Number(consignor.dealer_discount_percent || 0).toFixed(2),
    },
    status: {
        header: 'Status',
        getValue: ({ consignor }) => getStatusLabel(consignor),
    },
    products: {
        header: 'Products',
        getValue: ({ inventory }) => inventory.length,
    },
    unitsOnHand: {
        header: 'Units On Hand',
        getValue: ({ inventory }) => sumInventoryUnits(inventory),
    },
    inventoryValue: {
        header: 'Inventory Value',
        getValue: ({ inventory }) => roundCurrency(sumInventoryValue(inventory)).toFixed(2),
    },
    salesCount: {
        header: 'Sales Count',
        getValue: ({ totals }) => totals.salesCount,
    },
    itemsSold: {
        header: 'Items Sold',
        getValue: ({ totals }) => totals.itemsSold,
    },
    totalSales: {
        header: 'Total Sales',
        getValue: ({ totals }) => roundCurrency(totals.totalSales).toFixed(2),
    },
    consignorEarnings: {
        header: 'Consignor Earnings',
        getValue: ({ totals }) => roundCurrency(totals.consignorShare).toFixed(2),
    },
    storeShare: {
        header: 'Store Share',
        getValue: ({ totals }) => roundCurrency(totals.storeShare).toFixed(2),
    },
    cardFeesDeducted: {
        header: 'Card Fees Deducted',
        getValue: ({ totals }) => roundCurrency(totals.creditCardFees).toFixed(2),
    },
    taxCollected: {
        header: 'Tax Collected',
        getValue: ({ totals }) => roundCurrency(totals.taxCollected).toFixed(2),
    },
    payoutCount: {
        header: 'Payout Count',
        getValue: ({ payouts }) => payouts.length,
    },
    totalPaid: {
        header: 'Total Paid',
        getValue: ({ totalPaid }) => roundCurrency(totalPaid).toFixed(2),
    },
    lastPayoutDate: {
        header: 'Last Payout Date',
        getValue: ({ lastPayout }) => lastPayout ? new Date(lastPayout.paid_at).toLocaleDateString() : '',
    },
    memberSince: {
        header: 'Member Since',
        getValue: ({ consignor }) => new Date(consignor.created_at).toLocaleDateString(),
    },
};

export async function buildConsignorsSummaryCsvRows(
    consignors: Consignor[],
    fields: ConsignorsSummaryExportField[] = DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS
): Promise<CsvCell[][]> {
    const selectedFieldSet = new Set<ConsignorsSummaryExportField>(
        fields.length > 0 ? fields : DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS
    );
    const selectedFields = DEFAULT_CONSIGNORS_SUMMARY_EXPORT_FIELDS.filter((field) => selectedFieldSet.has(field));
    const reportData = await fetchConsignorReportData(consignors.map((consignor) => consignor.id));
    const rows: CsvCell[][] = [
        selectedFields.map((field) => SUMMARY_FIELD_DEFINITIONS[field].header),
    ];

    for (const consignor of consignors) {
        const inventory = reportData.inventoryByConsignor.get(consignor.id) || [];
        const totals = reportData.totalsByConsignor.get(consignor.id) || emptyTotals();
        const payouts = reportData.payoutsByConsignor.get(consignor.id) || [];
        const totalPaid = payouts.reduce((sum, payout) => sum + Number(payout.amount || 0), 0);
        const lastPayout = payouts[0] || null;
        const context: SummaryFieldContext = {
            consignor,
            inventory,
            totals,
            payouts,
            totalPaid,
            lastPayout,
        };

        rows.push(selectedFields.map((field) => SUMMARY_FIELD_DEFINITIONS[field].getValue(context)));
    }

    return rows;
}

function appendBlankRow(rows: CsvCell[][]) {
    if (rows.length > 0) rows.push([]);
}

export async function buildConsignorDetailCsvRows(
    consignor: Consignor,
    sections: ConsignorDetailExportSection[] = DEFAULT_CONSIGNOR_DETAIL_EXPORT_SECTIONS
): Promise<CsvCell[][]> {
    const selectedSections = new Set<ConsignorDetailExportSection>(
        sections.length > 0 ? sections : DEFAULT_CONSIGNOR_DETAIL_EXPORT_SECTIONS
    );
    const reportData = await fetchConsignorReportData([consignor.id], { includeInactiveInventory: true });
    const inventory = reportData.inventoryByConsignor.get(consignor.id) || [];
    const totals = reportData.totalsByConsignor.get(consignor.id) || emptyTotals();
    const saleLines = reportData.linesByConsignor.get(consignor.id) || [];
    const payouts = reportData.payoutsByConsignor.get(consignor.id) || [];
    const boothRentPayments = reportData.boothRentPaymentsByConsignor.get(consignor.id) || [];
    const totalPaid = payouts.reduce((sum, payout) => sum + Number(payout.amount || 0), 0);
    const rows: CsvCell[][] = [];

    if (selectedSections.has('profile')) {
        rows.push(['Consignor Profile']);
        rows.push(['Field', 'Value']);
        rows.push(['Consignor ID', consignor.consignor_number]);
        rows.push(['Name', getConsignorDisplayName(consignor)]);
        rows.push(['Business', consignor.business_name || '']);
        rows.push(['Individual', getPersonName(consignor)]);
        rows.push(['Pay To', getConsignorPayToName(consignor)]);
        rows.push(['Email', consignor.email || '']);
        rows.push(['Phone', consignor.phone || '']);
        rows.push(['Address', getAddress(consignor)]);
        rows.push(['Booth', consignor.booth_location || '']);
        rows.push(['Commission %', (Number(consignor.commission_split || 0) * 100).toFixed(2)]);
        rows.push(['Monthly Rent', Number(consignor.monthly_booth_rent || 0).toFixed(2)]);
        rows.push(['Card Fee Policy', consignor.consignor_pays_card_fee ? 'Consignor pays' : 'Customer pays']);
        rows.push(['W-9 On File', consignor.has_w9_filled_out ? 'Yes' : 'No']);
        rows.push(['Dealer Discount %', Number(consignor.dealer_discount_percent || 0).toFixed(2)]);
        rows.push(['Status', getStatusLabel(consignor)]);
        rows.push(['Member Since', new Date(consignor.created_at).toLocaleDateString()]);
    }

    if (selectedSections.has('salesSummary')) {
        appendBlankRow(rows);
        rows.push(['Sales Summary']);
        rows.push(['Metric', 'Value']);
        rows.push(['Sales Count', totals.salesCount]);
        rows.push(['Items Sold', totals.itemsSold]);
        rows.push(['Total Sales', roundCurrency(totals.totalSales).toFixed(2)]);
        rows.push(['Consignor Earnings', roundCurrency(totals.consignorShare).toFixed(2)]);
        rows.push(['Store Share', roundCurrency(totals.storeShare).toFixed(2)]);
        rows.push(['Card Fees Deducted', roundCurrency(totals.creditCardFees).toFixed(2)]);
        rows.push(['Tax Collected', roundCurrency(totals.taxCollected).toFixed(2)]);
        rows.push(['Payout Count', payouts.length]);
        rows.push(['Total Paid', roundCurrency(totalPaid).toFixed(2)]);
        rows.push(['Products', inventory.length]);
        rows.push(['Units On Hand', sumInventoryUnits(inventory)]);
        rows.push(['Inventory Value', roundCurrency(sumInventoryValue(inventory)).toFixed(2)]);
    }

    if (selectedSections.has('inventory')) {
        appendBlankRow(rows);
        rows.push(['Inventory']);
        rows.push(['SKU', 'Item Name', 'Variant', 'Category', 'Quantity', 'Unlabeled Quantity', 'Unit Price', 'Inventory Value', 'Listed', 'Public Browse', 'Created At']);
        for (const item of inventory) {
            rows.push([
                item.sku,
                item.name,
                item.variant_summary || '',
                item.category || '',
                Number(item.quantity || 0),
                Number(item.qty_unlabeled || 0),
                Number(item.price || 0).toFixed(2),
                roundCurrency(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2),
                item.is_listed ? 'Yes' : 'No',
                item.show_in_public_browse ? 'Yes' : 'No',
                new Date(item.created_at).toLocaleDateString(),
            ]);
        }
    }

    if (selectedSections.has('salesLineItems')) {
        appendBlankRow(rows);
        rows.push(['Sales Line Items']);
        rows.push(['Sale Date', 'Receipt #', 'Sale ID', 'SKU', 'Item Name', 'Quantity Sold', 'Refunded Quantity', 'Unit Price', 'Net Line Total', 'Commission %', 'Consignor Earnings', 'Store Share', 'Card Fee Deducted', 'Tax Collected']);
        for (const line of saleLines) {
            rows.push([
                new Date(line.saleDate).toLocaleString(),
                line.saleId.slice(0, 8),
                line.saleId,
                line.sku,
                line.itemName,
                line.quantity,
                line.refundedQuantity,
                line.unitPrice.toFixed(2),
                line.lineTotal.toFixed(2),
                (line.commissionSplit * 100).toFixed(2),
                line.consignorShare.toFixed(2),
                line.storeShare.toFixed(2),
                line.creditCardFee.toFixed(2),
                line.taxAmount.toFixed(2),
            ]);
        }
    }

    if (selectedSections.has('payouts')) {
        appendBlankRow(rows);
        rows.push(['Payouts']);
        rows.push(['Paid At', 'Amount', 'Period Start', 'Period End', 'Sales Count', 'Items Sold', 'Gross Sales', 'Store Share', 'Card Fees', 'Booth Rent Deduction', 'Marketing Fee Deduction', 'Ledger Deduction', 'Invoice Deduction', 'Notes']);
        for (const payout of payouts) {
            rows.push([
                new Date(payout.paid_at).toLocaleDateString(),
                Number(payout.amount || 0).toFixed(2),
                payout.period_start ? new Date(payout.period_start).toLocaleDateString() : '',
                payout.period_end ? new Date(payout.period_end).toLocaleDateString() : '',
                payout.sales_count,
                payout.items_sold,
                Number(payout.gross_sales || 0).toFixed(2),
                Number(payout.store_share || 0).toFixed(2),
                Number(payout.credit_card_fees || 0).toFixed(2),
                Number(payout.booth_rent_deduction || 0).toFixed(2),
                Number(payout.marketing_fee_deduction || 0).toFixed(2),
                Number(payout.ledger_deduction || 0).toFixed(2),
                Number(payout.invoice_deduction || 0).toFixed(2),
                payout.notes || '',
            ]);
        }
    }

    if (selectedSections.has('boothRentPayments')) {
        appendBlankRow(rows);
        rows.push(['Booth Rent Payments']);
        rows.push(['Period', 'Amount', 'Date Paid', 'Notes']);
        for (const payment of boothRentPayments) {
            rows.push([
                `${payment.period_year}-${String(payment.period_month).padStart(2, '0')}`,
                Number(payment.amount || 0).toFixed(2),
                new Date(payment.paid_at).toLocaleDateString(),
                payment.notes || '',
            ]);
        }
    }

    return rows;
}
