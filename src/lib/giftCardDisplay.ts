// What the register tells the customer display while gift cards are being sold.
// Sent on its own channel so it never collides with the cart broadcast.

import type { GiftCardFaceData } from '../components/giftcards/GiftCardFace';

export const GIFT_CARD_DISPLAY_CHANNEL = 'ravenpos-giftcards';

export type GiftCardDisplayMessage =
    | { active: false }
    | {
        active: true;
        stage: 'building' | 'paying' | 'done';
        /** Codes are never sent to the customer display. */
        cards: GiftCardFaceData[];
        total: number;
        paymentMethod: 'cash' | 'card';
        changeDue: number;
    };
