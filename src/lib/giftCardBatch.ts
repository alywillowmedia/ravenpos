// Pure rules for selling several gift cards in one payment and laying them out
// for printing. Kept free of React and Supabase so it can be tested directly.

import type { GiftCardOccasion } from './giftCardThemes';

export const GIFT_CARD_MIN_AMOUNT = 5;
export const GIFT_CARD_MAX_AMOUNT = 250;
export const GIFT_CARD_MAX_PER_SALE = 48;
export const GIFT_CARD_NOTE_MAX_LENGTH = 80;
export const GIFT_CARD_NAME_MAX_LENGTH = 40;
export const GIFT_CARDS_PER_SHEET = 8;
export const GIFT_CARD_AMOUNT_PRESETS = [10, 20, 25, 50, 75, 100];

export interface GiftCardDraft {
    key: string;
    recipientName: string;
    recipientEmail: string;
    amount: number;
    message: string;
    /** null = use the design picked for the whole sale. */
    occasion: GiftCardOccasion | null;
}

export interface GiftCardDraftErrors {
    amount?: string;
    email?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GIFT_CARD_CODE_PATTERN = /^GC-[0-9A-Z]{6,16}$/;

let draftCounter = 0;

export function createGiftCardDraft(amount: number): GiftCardDraft {
    draftCounter += 1;
    return {
        key: `card-${Date.now().toString(36)}-${draftCounter}`,
        recipientName: '',
        recipientEmail: '',
        amount,
        message: '',
        occasion: null,
    };
}

export function roundGiftCardMoney(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
}

/** Grows or shrinks the list to `count` cards, keeping what is already typed. */
export function resizeGiftCardDrafts(drafts: GiftCardDraft[], count: number, amount: number): GiftCardDraft[] {
    const target = Math.max(1, Math.min(GIFT_CARD_MAX_PER_SALE, Math.floor(count) || 1));
    if (drafts.length === target) return drafts;
    if (drafts.length > target) return drafts.slice(0, target);
    const added = Array.from({ length: target - drafts.length }, () => createGiftCardDraft(amount));
    return [...drafts, ...added];
}

export function validateGiftCardDrafts(
    drafts: GiftCardDraft[],
    options: { emailEnabled: boolean }
): { valid: boolean; errors: Record<string, GiftCardDraftErrors>; firstError: string | null } {
    const errors: Record<string, GiftCardDraftErrors> = {};
    let firstError: string | null = null;
    const note = (message: string) => { if (!firstError) firstError = message; };

    if (drafts.length === 0) note('Add at least one gift card.');
    if (drafts.length > GIFT_CARD_MAX_PER_SALE) note(`One sale is limited to ${GIFT_CARD_MAX_PER_SALE} cards.`);

    drafts.forEach((draft, index) => {
        const rowErrors: GiftCardDraftErrors = {};
        const amount = roundGiftCardMoney(draft.amount);
        if (!amount || amount < GIFT_CARD_MIN_AMOUNT || amount > GIFT_CARD_MAX_AMOUNT) {
            rowErrors.amount = `$${GIFT_CARD_MIN_AMOUNT} to $${GIFT_CARD_MAX_AMOUNT}`;
            note(`Card ${index + 1}: the amount must be between $${GIFT_CARD_MIN_AMOUNT} and $${GIFT_CARD_MAX_AMOUNT}.`);
        }
        const email = draft.recipientEmail.trim();
        if (options.emailEnabled && email && !EMAIL_PATTERN.test(email)) {
            rowErrors.email = 'Check this email';
            note(`Card ${index + 1}: that email address doesn't look right.`);
        }
        if (rowErrors.amount || rowErrors.email) errors[draft.key] = rowErrors;
    });

    return { valid: firstError === null, errors, firstError };
}

export function getGiftCardBatchTotal(drafts: GiftCardDraft[]): number {
    const cents = drafts.reduce((sum, draft) => sum + Math.round(roundGiftCardMoney(draft.amount) * 100), 0);
    return cents / 100;
}

export interface GiftCardBatchPayloadCard {
    amount: number;
    recipient_name: string | null;
    recipient_email: string | null;
    message: string | null;
    theme: GiftCardOccasion;
}

/** What create_gift_card_batch expects. Emails are only sent along when the toggle is on. */
export function buildGiftCardBatchPayload(
    drafts: GiftCardDraft[],
    options: { emailEnabled: boolean; occasion: GiftCardOccasion }
): GiftCardBatchPayloadCard[] {
    return drafts.map((draft) => ({
        amount: roundGiftCardMoney(draft.amount),
        recipient_name: draft.recipientName.trim() || null,
        recipient_email: options.emailEnabled ? draft.recipientEmail.trim() || null : null,
        message: draft.message.trim() || null,
        theme: draft.occasion || options.occasion,
    }));
}

/** Splits cards into printed pages of eight. */
export function chunkGiftCardsIntoSheets<T>(cards: T[], perSheet: number = GIFT_CARDS_PER_SHEET): T[][] {
    const sheets: T[][] = [];
    for (let index = 0; index < cards.length; index += perSheet) {
        sheets.push(cards.slice(index, index + perSheet));
    }
    return sheets;
}

/**
 * How much of a sale a gift card can pay for. A store-wide card can cover the
 * whole order; a vendor card only that vendor's items (with their tax).
 */
export function getGiftCardRedeemAmount(input: {
    balance: number;
    orderTotal: number;
    /** That vendor's share of the cart, or null for a store-wide card. */
    vendorCartTotal: number | null;
}): number {
    const ceiling = input.vendorCartTotal === null
        ? input.orderTotal
        : Math.min(input.orderTotal, input.vendorCartTotal);
    return roundGiftCardMoney(Math.max(0, Math.min(Math.max(0, input.balance), ceiling)));
}

/** True when a scan or typed entry is a gift card code rather than a SKU. */
export function isGiftCardCode(value: string): boolean {
    return GIFT_CARD_CODE_PATTERN.test(value.trim().toUpperCase());
}

/** Quick-cash buttons: exact amount, then the next sensible bills up. */
export function getCashSuggestions(total: number): number[] {
    const exact = roundGiftCardMoney(total);
    if (exact <= 0) return [];
    const suggestions = new Set<number>([exact]);
    for (const step of [5, 10, 20, 50, 100]) {
        const rounded = Math.ceil(exact / step) * step;
        if (rounded > exact) suggestions.add(rounded);
    }
    return Array.from(suggestions).sort((a, b) => a - b).slice(0, 4);
}
