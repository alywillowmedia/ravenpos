export function toCents(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function fromCents(value: number): number {
    return Math.round(value) / 100;
}

/** Distributes a cents total proportionally, assigning remainder cents by fraction then stable key. */
export function allocateCents(totalCents: number, rows: Array<{ key: string; weightCents: number }>): Record<string, number> {
    const safeTotal = Math.max(0, Math.round(totalCents));
    const weightTotal = rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.weightCents)), 0);
    if (safeTotal === 0 || weightTotal === 0) return Object.fromEntries(rows.map((row) => [row.key, 0]));
    const prelim = rows.map((row) => {
        const product = safeTotal * Math.max(0, Math.round(row.weightCents));
        return { key: row.key, cents: Math.floor(product / weightTotal), remainder: product % weightTotal };
    });
    let remainderCents = safeTotal - prelim.reduce((sum, row) => sum + row.cents, 0);
    const ranked = [...prelim].sort((left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key));
    for (const row of ranked) {
        if (remainderCents <= 0) break;
        row.cents += 1;
        remainderCents -= 1;
    }
    return Object.fromEntries(prelim.map((row) => [row.key, row.cents]));
}

export function allocationStatus(input: { eligibleCents: number; paidCents: number; refundedQuantity: number; quantity: number; legacyUncertain?: boolean }) {
    if (input.legacyUncertain && input.paidCents <= 0) return 'legacy_uncertain' as const;
    if (input.quantity > 0 && input.refundedQuantity >= input.quantity) return 'refunded' as const;
    if (input.paidCents <= 0) return 'unpaid' as const;
    if (input.paidCents < input.eligibleCents) return 'partially_paid' as const;
    return 'paid' as const;
}

export function selectInvoicesOldestFirst(availableCents: number, invoices: Array<{ id: string; createdAt: string; balanceCents: number }>) {
    let available = Math.max(0, Math.round(availableCents));
    return [...invoices]
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id.localeCompare(right.id))
        .map((invoice) => {
            const amountCents = Math.min(available, Math.max(0, Math.round(invoice.balanceCents)));
            available -= amountCents;
            return { invoiceId: invoice.id, amountCents };
        })
        .filter((row) => row.amountCents > 0);
}

export function reportEquation(input: { openingCents: number; activityCents: number; adjustmentCents: number; paymentCents: number }) {
    return input.openingCents + input.activityCents + input.adjustmentCents - input.paymentCents;
}
