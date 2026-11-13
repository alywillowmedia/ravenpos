import { describe, expect, it } from 'vitest';
import { GIFT_CARD_OCCASIONS, getGiftCardOccasion } from '../src/lib/giftCardThemes';

describe('gift card occasions', () => {
    it('gives every occasion a headline colour for both brands', () => {
        for (const occasion of GIFT_CARD_OCCASIONS) {
            expect(occasion.accents.ravenlia, occasion.id).toMatch(/^#[0-9A-F]{6}$/i);
            expect(occasion.accents.alywillow, occasion.id).toMatch(/^#[0-9A-F]{6}$/i);
        }
    });

    it('falls back to the everyday design for an unknown or missing theme', () => {
        expect(getGiftCardOccasion('nonsense').id).toBe('everyday');
        expect(getGiftCardOccasion(null).id).toBe('everyday');
    });
});
