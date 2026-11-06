import { formatCurrency, formatDate } from './utils';
import type { SplitBarProps } from '../components/ui/SplitBar';
import type { PayoutRunRow } from '../types/payouts';
import { describeFinalizeError, storeDate, validatePayment } from './payoutDraft';

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

/** "Oct 31" for a payment timestamp, read in store time rather than UTC. */
export function formatLastPaid(timestamp: string): string {
    const day = storeDate(timestamp);
    return day ? formatDay(day) : timestamp;
}

/** Resolves with `fallback` if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => resolve(fallback), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
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

/** Paying something below the vendor's minimum needs a reason (same rule as the Mark paid dialog). */
export function payRunReasonRequired(row: PayoutRunRow): boolean {
    return row.paying_now > 0 && row.payable_before_invoices < row.threshold;
}

export interface PayRunEntry {
    row: PayoutRunRow;
    selected: boolean;
    reference: string;
    reason: string;
}

/** True when the run cannot start: nothing ticked, or a ticked row fails the payment rules. */
export function payRunBlocked(rows: PayRunEntry[], method: string, date: string): boolean {
    const selected = rows.filter((entry) => entry.selected);
    if (selected.length === 0) return true;
    return selected.some((entry) => Object.keys(validatePayment({
        method,
        date,
        reference: entry.reference,
        amount: entry.row.paying_now,
        reasonRequired: payRunReasonRequired(entry.row),
        reason: entry.reason,
    })).length > 0);
}

export type PayRunPhase = 'idle' | 'paying' | 'paid' | 'failed' | 'already_paid' | 'removed' | 'unconfirmed';
export type PayRunEmail = 'sent' | 'failed' | 'skipped' | 'no_email';

export interface PayRunRowState {
    phase: PayRunPhase;
    error?: string;
    email?: PayRunEmail;
}

export interface PayRunJob {
    /** Row key (the vendor id). */
    id: string;
    payoutId: string;
    amount: number;
    reference: string | null;
    date: string;
    sendEmail: boolean;
}

export interface StoredPayout {
    status: 'draft' | 'paid' | 'voided';
    amount: number;
    reference: string | null;
    date: string | null;
}

export interface PayRunDeps {
    /** Finalizes the payout. Rejects if it could not be paid. */
    pay: (job: PayRunJob) => Promise<void>;
    /** Reads the stored payout; null when it no longer exists. Rejects if the read fails. */
    checkStatus: (job: PayRunJob) => Promise<StoredPayout | null>;
    /** Emails the statement. Never rejects in practice; a rejection counts as a failed email. */
    sendEmail: (job: PayRunJob) => Promise<PayRunEmail>;
    onRowState: (id: string, state: PayRunRowState) => void;
}

const SETTLED: PayRunPhase[] = ['paid', 'already_paid', 'removed', 'unconfirmed'];

/** Rows in these states are never sent again, until the page is reloaded. */
export function isPayRunSettled(phase: PayRunPhase): boolean {
    return SETTLED.includes(phase);
}

function sameText(a: string | null, b: string | null): boolean {
    return (a ?? '').trim() === (b ?? '').trim();
}

function matchesRun(stored: StoredPayout, job: PayRunJob): boolean {
    return stored.status === 'paid'
        && Math.round(stored.amount * 100) === Math.round(job.amount * 100)
        && sameText(stored.reference, job.reference)
        && (stored.date ?? '').slice(0, 10) === job.date;
}

async function emailFor(job: PayRunJob, deps: PayRunDeps): Promise<PayRunEmail> {
    if (!job.sendEmail) return 'skipped';
    try {
        return await deps.sendEmail(job);
    } catch {
        return 'failed';
    }
}

/**
 * Pays the queue one payout at a time. A row becomes paid only after its payer resolves, or after
 * the stored payout proves this run paid it. Rows already settled in `current` are skipped, so a
 * restart never pays one twice. Returns the final state of every row.
 */
export async function runPayRun(
    queue: PayRunJob[],
    deps: PayRunDeps,
    current: Record<string, PayRunRowState> = {},
): Promise<Record<string, PayRunRowState>> {
    const states: Record<string, PayRunRowState> = { ...current };
    const set = (id: string, state: PayRunRowState) => {
        states[id] = state;
        deps.onRowState(id, state);
    };
    for (const job of queue) {
        if (states[job.id] && isPayRunSettled(states[job.id].phase)) continue;
        set(job.id, { phase: 'paying' });
        try {
            await deps.pay(job);
            set(job.id, { phase: 'paid', email: await emailFor(job, deps) });
            continue;
        } catch (err) {
            const message = describeFinalizeError(err instanceof Error ? err.message : 'Could not mark this payout paid.');
            let stored: StoredPayout | null;
            try {
                stored = await deps.checkStatus(job);
            } catch {
                set(job.id, { phase: 'unconfirmed', error: 'Could not confirm. Reload before retrying.' });
                continue;
            }
            if (!stored || stored.status === 'voided') set(job.id, { phase: 'removed' });
            else if (matchesRun(stored, job)) set(job.id, { phase: 'paid', email: await emailFor(job, deps) });
            else if (stored.status === 'paid') set(job.id, { phase: 'already_paid' });
            else set(job.id, { phase: 'failed', error: message });
        }
    }
    return states;
}

/** End-of-run line: "5 paid, 1 failed". The failed part is left out when nothing failed. */
export function payRunSummary(paid: number, failed: number, unresolved = 0): string {
    const parts = [`${paid} paid`];
    if (failed > 0) parts.push(`${failed} failed`);
    if (unresolved > 0) parts.push(`${unresolved} could not be confirmed`);
    return parts.join(', ');
}

/** "{n} payout(s)", singular for one. */
export function payoutCount(count: number): string {
    return `${count} ${count === 1 ? 'payout' : 'payouts'}`;
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

/** Items sold after the payout cutoff instant (the cutoff itself is in scope). */
export function countAfterCutoff(items: Array<{ sale_timestamp: string }>, cutoffAt: string): number {
    const cutoff = Date.parse(cutoffAt);
    if (Number.isNaN(cutoff)) return 0;
    return items.filter((item) => Date.parse(item.sale_timestamp) > cutoff).length;
}

/** Link back to the payouts page, keeping the date and tab and leaving out the defaults. */
export function payoutsBackPath(through: string, tab: string, today: Date): string {
    const params = new URLSearchParams();
    if (through !== defaultThroughDate(today)) params.set('through', through);
    if (tab !== 'queue') params.set('tab', tab);
    const query = params.toString();
    return query ? `/admin/payouts?${query}` : '/admin/payouts';
}

/** Link to a draft, carrying the through date so every screen keeps it. */
export function draftPath(payoutId: string, through: string): string {
    return `/admin/payouts/drafts/${payoutId}?through=${through}`;
}

/** Problem with a typed payout minimum, or null when it is a valid amount of $0.00 or more. */
export function validateMinimum(value: string): string | null {
    const trimmed = value.trim();
    if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(trimmed)) return 'Enter an amount of $0.00 or more.';
    return null;
}

/** Vendor earnings for the given sale items, summed in cents. An id with no entry counts as $0. */
export function sumEarnings(itemIds: string[], earnings: Map<string, number>): number {
    const cents = itemIds.reduce((total, id) => total + Math.round((earnings.get(id) ?? 0) * 100), 0);
    return cents / 100;
}
