import { describe, expect, it } from 'vitest';
import {
    buildGiftCardBatchPayload,
    GIFT_CARD_ASPECT,
    GIFT_CARD_SHEET_SIZES,
    chunkGiftCardsIntoSheets,
    formatGiftCardSheetSize,
    getGiftCardPage,
    getGiftCardSheetSize,
    createGiftCardDraft,
    getCashSuggestions,
    getGiftCardBatchTotal,
    getGiftCardRedeemAmount,
    isGiftCardCode,
    resizeGiftCardDrafts,
    validateGiftCardDrafts,
} from '../../src/lib/giftCardBatch';
import {
    getGiftCardBrand,
    getGiftCardOccasion,
    getGiftCardScopeLine,
    getOrderedGiftCardOccasions,
} from '../../src/lib/giftCardThemes';

describe('gift card batch', () => {
    it('grows and shrinks the card list without losing what was typed', () => {
        let drafts = resizeGiftCardDrafts([], 3, 25);
        expect(drafts).toHaveLength(3);
        drafts = drafts.map((draft, index) => (index === 0 ? { ...draft, recipientName: 'Margaret' } : draft));

        const grown = resizeGiftCardDrafts(drafts, 10, 50);
        expect(grown).toHaveLength(10);
        expect(grown[0].recipientName).toBe('Margaret');
        expect(grown[0].amount).toBe(25);
        expect(grown[9].amount).toBe(50);

        expect(resizeGiftCardDrafts(grown, 1, 25)).toHaveLength(1);
        expect(resizeGiftCardDrafts(grown, 0, 25)).toHaveLength(1);
        expect(resizeGiftCardDrafts(grown, 500, 25)).toHaveLength(48);
    });

    it('totals the cards without float drift', () => {
        const drafts = [0.1, 0.2, 19.99].map((amount) => ({ ...createGiftCardDraft(amount) }));
        expect(getGiftCardBatchTotal(drafts)).toBe(20.29);
    });

    it('refuses amounts outside $5 to $250 and names the card', () => {
        const drafts = [createGiftCardDraft(25), createGiftCardDraft(2), createGiftCardDraft(300)];
        const result = validateGiftCardDrafts(drafts, { emailEnabled: false });
        expect(result.valid).toBe(false);
        expect(result.firstError).toContain('Card 2');
        expect(Object.keys(result.errors)).toEqual([drafts[1].key, drafts[2].key]);
    });

    it('only checks emails when emailing is turned on, and lets a card go without one', () => {
        const bad = { ...createGiftCardDraft(25), recipientEmail: 'not-an-email' };
        const blank = createGiftCardDraft(25);
        expect(validateGiftCardDrafts([bad, blank], { emailEnabled: false }).valid).toBe(true);

        const checked = validateGiftCardDrafts([bad, blank], { emailEnabled: true });
        expect(checked.valid).toBe(false);
        expect(checked.errors[bad.key].email).toBeDefined();
        expect(checked.errors[blank.key]).toBeUndefined();
    });

    it('sends emails only when the toggle is on and applies the sale design to cards without their own', () => {
        const drafts = [
            { ...createGiftCardDraft(25), recipientName: '  Dana ', recipientEmail: 'dana@example.com', message: ' ' },
            { ...createGiftCardDraft(50), occasion: 'birthday' as const },
        ];

        const printed = buildGiftCardBatchPayload(drafts, { emailEnabled: false, occasion: 'christmas' });
        expect(printed[0]).toEqual({
            amount: 25, recipient_name: 'Dana', recipient_email: null, message: null, theme: 'christmas',
        });
        expect(printed[1].theme).toBe('birthday');

        const emailed = buildGiftCardBatchPayload(drafts, { emailEnabled: true, occasion: 'christmas' });
        expect(emailed[0].recipient_email).toBe('dana@example.com');
        expect(emailed[1].recipient_email).toBeNull();
    });

    it('prints eight cards to a page', () => {
        const sheets = chunkGiftCardsIntoSheets(Array.from({ length: 19 }, (_, index) => index));
        expect(sheets.map((sheet) => sheet.length)).toEqual([8, 8, 3]);
        expect(chunkGiftCardsIntoSheets([])).toEqual([]);
    });

    it('offers print sizes that keep the card shape and fit a letter page', () => {
        expect(GIFT_CARD_SHEET_SIZES.map((size) => size.perSheet)).toEqual([8, 6, 4, 2]);
        for (const size of GIFT_CARD_SHEET_SIZES) {
            const page = getGiftCardPage(size);
            const rows = size.perSheet / size.columns;
            // 0.05in to the cut line on each side of a card, and 0.2in clear at the page edges.
            expect(size.columns * (size.cardWidth + 0.1), size.id).toBeLessThanOrEqual(page.width - 0.4);
            expect(rows * (size.cardHeight + 0.1), size.id).toBeLessThanOrEqual(page.height - 0.4);
            expect(size.cardWidth / size.cardHeight, size.id).toBeCloseTo(GIFT_CARD_ASPECT, 1);
        }
        expect(getGiftCardSheetSize('nonsense').id).toBe('small');
        expect(formatGiftCardSheetSize(getGiftCardSheetSize('small'))).toBe('3.9 × 2.4 in');
        expect(chunkGiftCardsIntoSheets([1, 2, 3, 4, 5], 2).map((sheet) => sheet.length)).toEqual([2, 2, 1]);
    });

    it('limits a vendor card to that vendor\'s share of the cart', () => {
        expect(getGiftCardRedeemAmount({ balance: 50, orderTotal: 80, vendorCartTotal: null })).toBe(50);
        expect(getGiftCardRedeemAmount({ balance: 100, orderTotal: 80, vendorCartTotal: null })).toBe(80);
        expect(getGiftCardRedeemAmount({ balance: 50, orderTotal: 80, vendorCartTotal: 21.4 })).toBe(21.4);
        expect(getGiftCardRedeemAmount({ balance: 10, orderTotal: 80, vendorCartTotal: 21.4 })).toBe(10);
        expect(getGiftCardRedeemAmount({ balance: 50, orderTotal: 80, vendorCartTotal: 0 })).toBe(0);
    });

    it('tells a scanned gift card code from a SKU', () => {
        expect(isGiftCardCode('GC-7K2M94QD1A')).toBe(true);
        expect(isGiftCardCode(' gc-0a1b2c3d4e ')).toBe(true);
        expect(isGiftCardCode('ALY-00123')).toBe(false);
        expect(isGiftCardCode('GC-')).toBe(false);
    });

    it('suggests the exact amount and the next bills up', () => {
        expect(getCashSuggestions(42.5)).toEqual([42.5, 45, 50, 60]);
        expect(getCashSuggestions(100)).toEqual([100]);
        expect(getCashSuggestions(0)).toEqual([]);
    });
});

describe('gift card designs', () => {
    it('gives Alywillow its own look and everyone else the Ravenlia look', () => {
        expect(getGiftCardBrand(null)).toBe('ravenlia');
        expect(getGiftCardBrand({ id: '1', name: 'Alywillow', shortcode: 'aly' })).toBe('alywillow');
        expect(getGiftCardBrand({ id: '2', name: 'Alywillow Organics' })).toBe('alywillow');
        expect(getGiftCardBrand({ id: '3', name: 'Holler Woodworks', shortcode: 'HW' })).toBe('ravenlia');
    });

    it('says where a card is good', () => {
        expect(getGiftCardScopeLine(null)).toBe('Good for anything at Ravenlia');
        expect(getGiftCardScopeLine('Alywillow')).toBe('Good for Alywillow items at Ravenlia');
    });

    it('falls back to the everyday design for an unknown or missing theme', () => {
        expect(getGiftCardOccasion(null).id).toBe('everyday');
        expect(getGiftCardOccasion('retired-theme').id).toBe('everyday');
        expect(getGiftCardOccasion('christmas').headline).toBe('Merry Christmas');
    });

    it('leads with holiday designs only while they are in season', () => {
        expect(getOrderedGiftCardOccasions(new Date(2026, 11, 10))[0].id).toBe('christmas');
        expect(getOrderedGiftCardOccasions(new Date(2026, 5, 10))[0].id).toBe('everyday');
    });
});
