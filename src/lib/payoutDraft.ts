import type { SelectOption } from '../components/ui/Select';
import type { PayoutAdjustmentSnapshot, PayoutStatementData, PayoutStatementEmail, RequiredPayoutAdjustment, SavePayoutDraftInput } from '../types/payouts';
import { fromCents, selectInvoicesOldestFirst, toCents } from './payoutLedger';

export const PAYMENT_METHODS: SelectOption[] = [
    { value: 'check', label: 'Check' },
    { value: 'ach', label: 'ACH' },
    { value: 'cash', label: 'Cash' },
    { value: 'other', label: 'Other' },
];

const STORE_TIME_ZONE = 'America/New_York';
export const CHANGED_MESSAGE = 'This draft changed after it was prepared. Open it and recalculate.';

export interface DraftFigures {
    carriedIn: number;
    earned: number;
    required: number;
    invoices: number;
}

/** Carried in + Earned - Deductions, never below zero. */
export function draftPayable(figures: DraftFigures): number {
    const cents = toCents(figures.carriedIn) + toCents(figures.earned) - toCents(figures.required) - toCents(figures.invoices);
    return fromCents(Math.max(0, cents));
}

export function rollsForward(payable: number, payingNow: number): number {
    return fromCents(Math.max(0, toCents(payable) - toCents(payingNow)));
}

export function notInThisPayout(currentPayable: number, payableBeforeInvoices: number): number {
    return fromCents(Math.max(0, toCents(currentPayable) - toCents(payableBeforeInvoices)));
}

/** While following, Paying now tracks Payable; otherwise the typed text is kept. */
export function nextPayingNow(input: { payable: number; typed: string; following: boolean }): string {
    if (!input.following) return input.typed;
    return fromCents(toCents(input.payable)).toFixed(2);
}

export type DraftScope = { kind: 'through'; date: string } | { kind: 'between'; from: string; to: string };

export function storeDate(timestamp: string): string | null {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE }).format(parsed);
}

/** True when the timestamp's store day falls within from..to (YYYY-MM-DD, either may be blank). */
export function inStoreDateRange(timestamp: string, from: string, to: string): boolean {
    const day = storeDate(timestamp);
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 31" from a plain date, with no timezone shift. */
function plainDay(date: string): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!match) return null;
    const month = SHORT_MONTHS[Number(match[2]) - 1];
    return month ? `${month} ${Number(match[3])}` : null;
}

/** The scope line on a statement: what the payout covers. */
export function statementScopeLabel(payout: PayoutStatementData['payout']): string {
    if (payout.range_mode === 'selected_range' && payout.source_range_start && payout.source_range_end) {
        const from = plainDay(payout.source_range_start);
        const to = plainDay(payout.source_range_end);
        if (from && to) return `Sales from ${from} to ${to}`;
    }
    if (payout.range_mode === 'through_date') {
        const end = payout.source_range_end || (payout.cutoff_at ? storeDate(payout.cutoff_at) : null);
        const day = end ? plainDay(end) : null;
        if (day) return `Earnings through ${day}`;
    }
    return 'All outstanding';
}

export function scopeFromPayout(payout: PayoutStatementData['payout'], today: string): DraftScope {
    if (
        payout.range_mode === 'selected_range'
        && !payout.include_prior_balance
        && payout.source_range_start
        && payout.source_range_end
    ) {
        return { kind: 'between', from: payout.source_range_start, to: payout.source_range_end };
    }
    const date = payout.source_range_end
        || (payout.cutoff_at ? storeDate(payout.cutoff_at) : null)
        || today;
    return { kind: 'through', date };
}

export function scopeToSaveInput(
    scope: DraftScope,
): Pick<SavePayoutDraftInput, 'rangeMode' | 'sourceRangeStart' | 'sourceRangeEnd' | 'includePriorBalance'> {
    if (scope.kind === 'through') {
        return { rangeMode: 'through_date', sourceRangeStart: null, sourceRangeEnd: scope.date, includePriorBalance: true };
    }
    return { rangeMode: 'selected_range', sourceRangeStart: scope.from, sourceRangeEnd: scope.to, includePriorBalance: false };
}

export function validatePayingNow(value: string, payable: number): string | null {
    const trimmed = value.trim();
    if (!/^-?(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(trimmed)) return 'Enter an amount.';
    const cents = toCents(Number(trimmed));
    if (cents < 0 || cents > toCents(payable)) return `Must be between $0.00 and $${payable.toFixed(2)}.`;
    return null;
}

export function validatePayment(input: {
    method: string;
    date: string;
    reference: string;
    amount: number;
    reasonRequired: boolean;
    reason: string;
}): { reference?: string; reason?: string; date?: string } {
    const errors: { reference?: string; reason?: string; date?: string } = {};
    if (!input.date) errors.date = 'Choose a payment date.';
    if (input.method === 'check' && toCents(input.amount) > 0 && !input.reference.trim()) {
        errors.reference = 'Enter the check number.';
    }
    if (input.reasonRequired && !input.reason.trim()) {
        errors.reason = 'Say why this payout is below the minimum.';
    }
    return errors;
}

export const AMOUNT_CHANGED_MESSAGE = 'The amount changed after this screen loaded. Reload and check it.';

export function describeFinalizeError(message: string): string {
    if (message.includes('The payout amount changed after this screen loaded')) return AMOUNT_CHANGED_MESSAGE;
    if (message.includes('Finalizable payout draft not found')) return 'This payout was already paid or removed.';
    if (
        message.includes('A sale allocation is no longer available')
        || message.includes('changed after the draft was prepared')
        || message.includes('Sale allocation conflict detected')
        || message.includes('Draft no longer reconciles')
    ) {
        return CHANGED_MESSAGE;
    }
    return message;
}

export function statementFigures(
    payout: PayoutStatementData['payout'],
    adjustments: PayoutAdjustmentSnapshot[],
): DraftFigures & { hasSnapshots: boolean } {
    let requiredCents = 0;
    let invoicesCents = 0;
    for (const adjustment of adjustments) {
        const cents = toCents(adjustment.amount);
        if (cents >= 0) continue;
        if (adjustment.adjustment_type === 'invoice_deduction') invoicesCents += -cents;
        else requiredCents += -cents;
    }
    const hasSnapshots = payout.carried_in_snapshot !== null && payout.earned_snapshot !== null;
    const earned = hasSnapshots
        ? (payout.earned_snapshot as number)
        : fromCents(toCents(payout.payable_before_invoices_snapshot ?? 0) + requiredCents);
    return {
        carriedIn: payout.carried_in_snapshot ?? 0,
        earned,
        required: fromCents(requiredCents),
        invoices: fromCents(invoicesCents),
        hasSnapshots,
    };
}

const AMOUNT_PATTERN = /^(\d+(\.\d{1,2})?|\.\d{1,2})$/;

/** What one invoice can still take: carried in + earned - required, less the other invoices. */
export function invoiceRoom(figures: Pick<DraftFigures, 'carriedIn' | 'earned' | 'required'>, otherInvoices: number): number {
    const cents = toCents(figures.carriedIn) + toCents(figures.earned) - toCents(figures.required) - toCents(otherInvoices);
    return fromCents(Math.max(0, cents));
}

/** Problem with a typed invoice amount, or null. Blank counts as nothing applied. */
export function validateInvoiceAmount(value: string, balanceDue: number, room: number): string | null {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (!AMOUNT_PATTERN.test(trimmed)) return 'Enter an amount.';
    const cents = toCents(Number(trimmed));
    if (cents > toCents(balanceDue)) return `Can't be more than the $${balanceDue.toFixed(2)} due.`;
    if (cents > toCents(room)) return `Can't be more than $${room.toFixed(2)} here.`;
    return null;
}

function amountCents(value: string | undefined): number {
    const parsed = Number((value ?? '').trim());
    return Number.isFinite(parsed) ? toCents(parsed) : 0;
}

export function invoiceAmountsFromAdjustments(adjustments: PayoutAdjustmentSnapshot[]): Record<string, string> {
    const amounts: Record<string, string> = {};
    for (const adjustment of adjustments) {
        if (adjustment.adjustment_type !== 'invoice_deduction' || !adjustment.source_reference) continue;
        amounts[adjustment.source_reference] = Math.abs(Number(adjustment.amount)).toFixed(2);
    }
    return amounts;
}

export function invoiceApplicationsFrom(amounts: Record<string, string>): Array<{ invoice_id: string; amount: number }> {
    return Object.entries(amounts)
        .map(([invoice_id, value]) => ({ invoice_id, amount: fromCents(amountCents(value)) }))
        .filter((entry) => entry.amount > 0);
}

/**
 * True when recalculating would replace something the admin chose: Paying now below Payable,
 * or invoice amounts other than the oldest-first fill of the available money.
 */
export function wouldLoseEdits(input: {
    payingNow: string;
    payable: number;
    invoiceAmounts: Record<string, string>;
    invoices: Array<{ id: string; created_at: string; balance_due: number }>;
    available: number;
}): boolean {
    if (amountCents(input.payingNow) !== toCents(input.payable)) return true;
    const fill = new Map(selectInvoicesOldestFirst(
        toCents(input.available),
        input.invoices.map((invoice) => ({ id: invoice.id, createdAt: invoice.created_at, balanceCents: toCents(invoice.balance_due) })),
    ).map((row) => [row.invoiceId, row.amountCents]));
    const ids = new Set([...Object.keys(input.invoiceAmounts), ...fill.keys()]);
    for (const id of ids) {
        if (amountCents(input.invoiceAmounts[id]) !== (fill.get(id) ?? 0)) return true;
    }
    return false;
}

/** Required deductions the draft did not apply, whatever the workspace says about affordability. */
export function pendingDeductions(
    required: RequiredPayoutAdjustment[],
    applied: PayoutAdjustmentSnapshot[],
): RequiredPayoutAdjustment[] {
    const key = (row: { adjustment_type: string; source_table: string | null; source_reference: string | null }) =>
        `${row.adjustment_type}|${row.source_table}|${row.source_reference}`;
    const appliedKeys = new Set(applied.map(key));
    return required.filter((row) => !appliedKeys.has(key(row)));
}

/** Following starts on only when the saved amount is the full amount that was due. */
export function startsFollowing(amount: number, originalAmountDue: number | null | undefined): boolean {
    if (originalAmountDue === null || originalAmountDue === undefined) return false;
    return toCents(amount) === toCents(originalAmountDue);
}

export function sameScope(a: DraftScope, b: DraftScope): boolean {
    if (a.kind === 'through' && b.kind === 'through') return a.date === b.date;
    if (a.kind === 'between' && b.kind === 'between') return a.from === b.from && a.to === b.to;
    return false;
}

/** `today` is a plain YYYY-MM-DD store date; an end date after it is refused. */
export function isScopeValid(scope: DraftScope, today: string): boolean {
    if (scope.kind === 'through') return scope.date !== '' && scope.date <= today;
    return scope.from !== '' && scope.to !== '' && scope.from <= scope.to && scope.to <= today;
}

/** `not_a_draft`: already paid or removed. `stale`: figures moved since the draft was saved. */
export function classifyDraftError(message: string): 'not_a_draft' | 'stale' | null {
    if (message.includes('Editable payout draft not found') || message.includes('Only drafts can be discarded')) {
        return 'not_a_draft';
    }
    if (
        message.includes('invalid or stale')
        || message.includes('exceed')
        || message.includes('Payment amount must be between')
    ) {
        return 'stale';
    }
    return null;
}

export function pendingReasonText(reason: string | null): string {
    if (reason === 'insufficient_available_funds') return 'Not enough earnings to cover this yet.';
    if (!reason) return 'Not enough earnings in this payout to cover this yet.';
    const words = reason.replace(/_/g, ' ').trim();
    return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

/** Cutoff instant as the store sees it, e.g. "Oct 31, 2025, 11:59 PM EDT". */
export function formatStatementCutoff(cutoffAt: string): string {
    const parsed = new Date(cutoffAt);
    if (Number.isNaN(parsed.getTime())) return cutoffAt;
    return new Intl.DateTimeFormat('en-US', {
        timeZone: STORE_TIME_ZONE,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(parsed);
}

/** The line under a statement saying whether it was emailed. Empty when nothing was tried. */
export function statementEmailLine(email: PayoutStatementEmail | null): string {
    if (!email) return '';
    const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(email.created_at));
    return email.status === 'sent'
        ? `Emailed to ${email.recipient} on ${when}`
        : `Email to ${email.recipient} failed on ${when}`;
}
