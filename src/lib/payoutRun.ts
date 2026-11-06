import { formatCurrency, formatDate } from './utils';
import type { SplitBarProps } from '../components/ui/SplitBar';
import type { PayoutRunRow } from '../types/payouts';

export type RunFilter = 'all' | 'ready' | 'draft' | 'accruing' | 'paid_up';

export interface RunTotals {
    ready: { count: number; total: number };
    accruing: { count: number; total: number };
    drafts: { count: number; total: number };
    run: { vendors: number; payable: number; boothRent: number; invoicesAndFees: number };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PENDING_LABELS: Record<string, string> = {
    booth_rent: 'Booth rent',
    marketing_fee: 'Marketing fee',
    manual_ledger: 'Ledger charge',
    refund_reversal: 'Refund',
};

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

export function localDateString(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Last day of the previous calendar month. */
export function defaultThroughDate(today: Date): string {
    return localDateString(new Date(today.getFullYear(), today.getMonth(), 0));
}

function parseParts(value: string): { year: number; month: number; day: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const check = new Date(year, month - 1, day);
    if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
    return { year, month, day };
}

export function parseThrough(value: string | null, today: Date): string {
    const fallback = defaultThroughDate(today);
    if (!value || !parseParts(value)) return fallback;
    return value > localDateString(today) ? fallback : value;
}

export function formatDay(date: string): string {
    const parts = parseParts(date.slice(0, 10));
    if (!parts) return date;
    return `${MONTHS[parts.month - 1].slice(0, 3)} ${parts.day}`;
}

export function monthName(date: string): string {
    const parts = parseParts(date.slice(0, 10));
    return parts ? MONTHS[parts.month - 1] : date;
}

export function shortId(id: string): string {
    return id.slice(0, 8).toUpperCase();
}

export function statusLine(row: PayoutRunRow): string | null {
    if (row.status === 'draft' && row.draft_id) {
        const through = row.draft_through ? ` · through ${formatDay(row.draft_through)}` : '';
        return `Draft #${shortId(row.draft_id)}${through}`;
    }
    if (!row.is_active) return 'Inactive';
    if (row.pending_count > 0) {
        const label = row.pending_count === 1 && row.pending_type ? PENDING_LABELS[row.pending_type] : undefined;
        return label
            ? `${label} ${formatCurrency(row.pending_total)} still owed`
            : `${formatCurrency(row.pending_total)} in deductions still owed`;
    }
    if (row.status === 'accruing') return `${formatCurrency(row.threshold_remaining)} to go`;
    return null;
}

export function filterRows(rows: PayoutRunRow[], filter: { search: string; status: RunFilter }): PayoutRunRow[] {
    const needle = filter.search.trim().toLowerCase();
    return rows.filter((row) => {
        if (filter.status !== 'all' && row.status !== filter.status) return false;
        if (!needle) return true;
        return [row.name, row.business_name, row.pay_to_name, row.consignor_number]
            .some((field) => field?.toLowerCase().includes(needle));
    });
}

export function readyToPrepare(rows: PayoutRunRow[]): PayoutRunRow[] {
    return rows.filter((row) => row.status === 'ready');
}

function sum(rows: PayoutRunRow[], pick: (row: PayoutRunRow) => number): number {
    return Math.round(rows.reduce((total, row) => total + pick(row), 0) * 100) / 100;
}

export function runTotals(rows: PayoutRunRow[]): RunTotals {
    const ready = rows.filter((row) => row.status === 'ready');
    const accruing = rows.filter((row) => row.status === 'accruing');
    const drafts = rows.filter((row) => row.status === 'draft');
    const inRun = [...ready, ...drafts];
    const readyTotal = sum(ready, (row) => row.payable);
    const draftTotal = sum(drafts, (row) => row.paying_now);
    return {
        ready: { count: ready.length, total: readyTotal },
        accruing: { count: accruing.length, total: sum(accruing, (row) => row.payable) },
        drafts: { count: drafts.length, total: draftTotal },
        run: {
            vendors: inRun.length,
            payable: Math.round((readyTotal + draftTotal) * 100) / 100,
            boothRent: sum(inRun, (row) => row.booth_rent),
            invoicesAndFees: sum(inRun, (row) => row.invoices_applied + row.other_deductions),
        },
    };
}

export function splitBarParts(totals: RunTotals): SplitBarProps['parts'] | null {
    const { payable, boothRent, invoicesAndFees } = totals.run;
    if (payable + boothRent + invoicesAndFees <= 0) return null;
    return [
        { label: 'Payable', value: payable, display: formatCurrency(payable), tone: 1 },
        { label: 'Booth rent', value: boothRent, display: formatCurrency(boothRent), tone: 2 },
        { label: 'Invoices and fees', value: invoicesAndFees, display: formatCurrency(invoicesAndFees), tone: 3 },
    ];
}

export function payRunTotal(rows: PayoutRunRow[], selectedIds: Set<string>): { count: number; total: number } {
    const selected = rows.filter((row) => selectedIds.has(row.consignor_id));
    return { count: selected.length, total: sum(selected, (row) => row.paying_now) };
}

/** "All months" (empty value) followed by the last 24 months, newest first. */
export function historyMonthOptions(today: Date): Array<{ value: string; label: string }> {
    const options = [{ value: '', label: 'All months' }];
    for (let offset = 0; offset < 24; offset += 1) {
        const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
        options.push({
            value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
            label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
        });
    }
    return options;
}

/** Headline for a prepare run: what was created and what already had a draft. */
export function prepareSummary(created: number, skipped: number): string {
    const drafts = (count: number) => (count === 1 ? 'draft' : 'drafts');
    const skippedText = skipped === 1 ? '1 already had a draft' : `${skipped} already had drafts`;
    if (created > 0) {
        const head = `${created} ${drafts(created)} prepared`;
        return skipped > 0 ? `${head}, ${skippedText}` : head;
    }
    return skipped > 0 ? `No new drafts, ${skippedText}` : 'No drafts prepared';
}

/** Date a payout is shown under: its payment date (a plain date), else when it was paid. */
export function formatPayoutDate(row: { payment_date: string | null; paid_at: string | null }): string {
    if (row.payment_date) {
        const parts = parseParts(row.payment_date.slice(0, 10));
        return parts ? `${MONTHS[parts.month - 1].slice(0, 3)} ${parts.day}, ${parts.year}` : row.payment_date;
    }
    return row.paid_at ? formatDate(row.paid_at) : '—';
}
