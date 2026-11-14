// The store no longer gives pennies: anything paid or handed back in cash is
// rounded to the nearest nickel. Card, check, store credit and gift card
// amounts are never rounded. Pure helpers so the rule can be tested directly.

const NICKEL_CENTS = 5;

function toWholeCents(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * Nearest multiple of 5 cents. Endings 1, 2, 6, 7 go down and 3, 4, 8, 9 go
 * up; whole cents never land exactly halfway, so there is no tie to break.
 */
export function roundCashCents(cents: number): number {
    const whole = Number.isFinite(cents) ? Math.round(cents) : 0;
    const sign = whole < 0 ? -1 : 1;
    const rounded = Math.round(Math.abs(whole) / NICKEL_CENTS) * NICKEL_CENTS;
    return rounded === 0 ? 0 : sign * rounded;
}

/** Largest multiple of 5 cents that is not above `cents`. */
export function floorCashCents(cents: number): number {
    const whole = Number.isFinite(cents) ? Math.round(cents) : 0;
    return Math.floor(whole / NICKEL_CENTS) * NICKEL_CENTS;
}

/** A dollar amount as it is paid in cash. */
export function roundCashAmount(amount: number | string | null | undefined): number {
    return roundCashCents(toWholeCents(amount)) / 100;
}

/** What rounding adds to (or takes off) a cash amount: -0.02 to +0.02. */
export function getCashRounding(amount: number | string | null | undefined): number {
    const cents = toWholeCents(amount);
    const difference = roundCashCents(cents) - cents;
    return difference === 0 ? 0 : difference / 100;
}

export interface GiftCardCashLike {
    original_amount?: number | string | null;
    purchase_payment_method?: string | null;
    batch_id?: string | null;
}

/**
 * Rounding on gift cards sold for cash. Cards sold together in one payment
 * share a batch id and are rounded once, on the amount actually paid.
 */
export function getGiftCardCashRounding(cards: GiftCardCashLike[]): number {
    const centsByPayment = new Map<string, number>();
    cards.forEach((card, index) => {
        if (card.purchase_payment_method !== 'cash') return;
        const key = card.batch_id ? `batch:${card.batch_id}` : `single:${index}`;
        centsByPayment.set(key, (centsByPayment.get(key) || 0) + toWholeCents(card.original_amount));
    });
    let roundingCents = 0;
    for (const cents of centsByPayment.values()) {
        roundingCents += roundCashCents(cents) - cents;
    }
    return roundingCents === 0 ? 0 : roundingCents / 100;
}
