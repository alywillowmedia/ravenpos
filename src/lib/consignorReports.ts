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

interface ConsignorReportTotals {
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

interface ConsignorReportData {
    totalsByConsignor: Map<string, ConsignorReportTotals>;
    linesByConsignor: Map<string, CompletedPayoutSaleLine[]>;
    inventoryByConsignor: Map<string, Item[]>;
    payoutsByConsignor: Map<string, Payout[]>;
    boothRentPaymentsByConsignor: Map<string, BoothRentPayment[]>;
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

async function fetchConsignorReportData(consignorIds: string[]): Promise<ConsignorReportData> {
    if (consignorIds.length === 0) {
        return {
            totalsByConsignor: new Map(),
            linesByConsignor: new Map(),
            inventoryByConsignor: new Map(),
            payoutsByConsignor: new Map(),
            boothRentPaymentsByConsignor: new Map(),
        };
    }

    const [saleItems, inventoryItems, payouts, boothRentPayments] = await Promise.all([
        fetchAllRows<SaleItemReportRow>(() => supabase
            .from('sale_items')
            .select('id, sale_id, consignor_id, sku, name, price, quantity, commission_split, discount_amount, consignor_pays_card_fee, sale:sales(id, completed_at, tax_amount, subtotal, total, discount_total, payment_method, payment_breakdown)')
            .in('consignor_id', consignorIds)
            .order('id')
        ),
        fetchAllRows<Item>(() => supabase
            .from('items')
            .select('*')
            .in('consignor_id', consignorIds)
            .order('sku')
        ),
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
    const reportData = await fetchConsignorReportData([consignor.id]);
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
