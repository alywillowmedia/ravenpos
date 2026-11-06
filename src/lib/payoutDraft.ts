import type { SelectOption } from '../components/ui/Select';
import type { PayoutAdjustmentSnapshot, PayoutStatementData, SavePayoutDraftInput } from '../types/payouts';
import { fromCents, toCents } from './payoutLedger';

export const PAYMENT_METHODS: SelectOption[] = [
    { value: 'check', label: 'Check' },
    { value: 'ach', label: 'ACH' },
    { value: 'cash', label: 'Cash' },
    { value: 'other', label: 'Other' },
];

const STORE_TIME_ZONE = 'America/New_York';
const CHANGED_MESSAGE = 'This draft changed after it was prepared. Open it and recalculate.';

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

function storeDate(timestamp: string): string | null {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE }).format(parsed);
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

export function describeFinalizeError(message: string): string {
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

export interface DraftInputs {
    payingNow: string;
    invoiceAmounts: Record<string, string>;
}

/** True when Paying now or any invoice amount differs from what was loaded. */
export function draftInputsChanged(current: DraftInputs, loaded: DraftInputs): boolean {
    if (amountCents(current.payingNow) !== amountCents(loaded.payingNow)) return true;
    const ids = new Set([...Object.keys(current.invoiceAmounts), ...Object.keys(loaded.invoiceAmounts)]);
    for (const id of ids) {
        if (amountCents(current.invoiceAmounts[id]) !== amountCents(loaded.invoiceAmounts[id])) return true;
    }
    return false;
}

export function sameScope(a: DraftScope, b: DraftScope): boolean {
    if (a.kind === 'through' && b.kind === 'through') return a.date === b.date;
    if (a.kind === 'between' && b.kind === 'between') return a.from === b.from && a.to === b.to;
    return false;
}

export function isScopeValid(scope: DraftScope): boolean {
    if (scope.kind === 'through') return scope.date !== '';
    return scope.from !== '' && scope.to !== '' && scope.from <= scope.to;
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
    if (!reason) return 'Pending.';
    const words = reason.replace(/_/g, ' ').trim();
    return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}
