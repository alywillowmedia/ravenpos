export const STRIPE_TERMINAL_FEE_PERCENT = 0.027;
export const STRIPE_TERMINAL_FEE_FIXED = 0.05;

function roundToCents(value: number): number {
    return Math.round(value * 100) / 100;
}

export function calculateStripeTerminalProcessingFee(amount: number): number {
    const normalizedAmount = Math.max(0, amount || 0);
    if (normalizedAmount <= 0) return 0;
    return roundToCents((normalizedAmount * STRIPE_TERMINAL_FEE_PERCENT) + STRIPE_TERMINAL_FEE_FIXED);
}

export function calculateCardSurchargeAmount(
    amountBeforeSurcharge: number,
    eligibleRatio = 1
): number {
    const normalizedAmount = Math.max(0, amountBeforeSurcharge || 0);
    const ratio = Math.max(0, Math.min(1, eligibleRatio || 0));
    if (normalizedAmount <= 0 || ratio <= 0) return 0;

    // Gross-up so the collected fee also covers Stripe's percentage fee on the fee itself.
    const numerator = (normalizedAmount * STRIPE_TERMINAL_FEE_PERCENT * ratio)
        + (STRIPE_TERMINAL_FEE_FIXED * ratio);
    const grossedUpFee = numerator / (1 - STRIPE_TERMINAL_FEE_PERCENT);
    return roundToCents(grossedUpFee);
}
