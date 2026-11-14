// What's new, per account type. Add a release to the top of RELEASES; the
// sidebar dot shows until the person opens the panel for that version.

export type WhatsNewRole = 'admin' | 'employee' | 'vendor';

export interface WhatsNewNote {
    title: string;
    body: string;
}

export interface WhatsNewRelease {
    version: string;
    notes: Record<WhatsNewRole, WhatsNewNote[]>;
}

export const RELEASES: WhatsNewRelease[] = [
    {
        version: '3.13.0',
        notes: {
            admin: [
                {
                    title: 'Find the gift cards you sold',
                    body: 'Sales History has a new Gift Cards tab listing every card sold. Search by code, name, email or vendor, see what is left on each card and where it was spent, and reprint a card from there.',
                },
                {
                    title: 'Cash rounds to the nickel',
                    body: 'The store no longer gives pennies, so cash due and change round to the nearest 5 cents. Cards, checks, store credit and gift cards stay exact. Receipts and the Sales summary show a "Cash rounding" line, and prices, tax and vendor payouts are unchanged.',
                },
                {
                    title: 'Gift card print sizes',
                    body: 'Pick Small, Medium, Large or Extra large when printing gift cards. The register remembers the last size used.',
                },
                {
                    title: 'Gift cards with real artwork',
                    body: 'Printed gift cards now carry illustrated borders: wildflowers for Alywillow and vintage parchment for Ravenlia. Long names and notes shrink to fit instead of being cut off.',
                },
                {
                    title: 'Gift cards, rebuilt',
                    body: 'Sell gift cards from Options at the register: several cards in one payment, a choice of printed designs, and cards that are good for one vendor only. Cards print on letter paper or go out by email, and any card can be reprinted from its code.',
                },
                {
                    title: 'A new look',
                    body: 'Every screen has been restyled, in light and dark. The sidebar is grouped into Inventory, People, Money and Store, and the top bar shows where you are.',
                },
                {
                    title: 'Vendor payouts, rebuilt',
                    body: 'Pick a "through" date and the queue shows who is owed what up to that day. Prepare drafts one at a time or in a batch, then work through them on the new Pay run screen.',
                },
                {
                    title: 'The amount you confirm is the amount recorded',
                    body: 'Mark paid checks the figure again at the moment you confirm. If a sale, refund or rent payment changed the draft in the meantime, it stops and asks you to recalculate.',
                },
                {
                    title: 'Payout statements by email',
                    body: 'A statement shows the full equation: earned, card fees, refunds, rent and what was paid. You can email it to the vendor from the payout.',
                },
                {
                    title: 'One Sales summary',
                    body: 'The Analytics tab and snapshot are replaced by a single summary for the date range: money in by payment type, who gets what, sales by day and by category.',
                },
                {
                    title: 'Consignor pages in sections',
                    body: 'A consignor page now has Overview, Booth rent, Inventory and Portal access tabs. Edit one section at a time instead of one long form.',
                },
                {
                    title: 'Staff records are private',
                    body: 'Employee records can no longer be read without signing in.',
                },
            ],
            employee: [
                {
                    title: 'Clock in and out from the register',
                    body: 'The clock button is back on the register: the clock icon at the bottom of the sidebar. Tap it to clock in, or to clock out when it shows a green dot.',
                },
                {
                    title: 'Cash rounds to the nickel',
                    body: 'No more pennies: the register rounds cash due and change to the nearest 5 cents, including cash refunds. Cards, checks, store credit and gift cards stay exact.',
                },
                {
                    title: 'Gift card print sizes',
                    body: 'Pick Small, Medium, Large or Extra large when printing gift cards. The register remembers the last size used.',
                },
                {
                    title: 'Gift cards, rebuilt',
                    body: 'Sell gift cards from Options at the register: several cards in one payment, a choice of printed designs, and cards that are good for one vendor only. Cards print on letter paper or go out by email, and any card can be reprinted from its code.',
                },
                {
                    title: 'A new look',
                    body: 'Every screen has been restyled, and the sidebar is tidier. Everything is where it was; People now holds Consignors, Customers and Dealers.',
                },
                {
                    title: 'Faster PIN pad',
                    body: 'After your PIN, one tap clocks you in and opens the register. Clocking in or out shows a short confirmation, then returns to the PIN pad for the next person.',
                },
                {
                    title: 'Sales summary',
                    body: 'Sales now opens with one summary for the date range, and sale rows stack on narrow screens instead of running off the page.',
                },
                {
                    title: 'Scan in / out',
                    body: 'The scan page has been rebuilt to match the rest of the app.',
                },
            ],
            vendor: [
                {
                    title: 'Gift cards for your booth',
                    body: 'The store can now sell gift cards that are good for your items only. They are redeemed at the register like any other gift card.',
                },
                {
                    title: 'Your earnings now include card fees and refunds',
                    body: 'Earnings figures are worked out by the store system and already account for card fees and refunds. On card sales they will read a little lower than before; what you are paid has not changed.',
                },
                {
                    title: 'Clearer payouts',
                    body: 'My payouts shows your balance today, each past payment with its payment date, and a statement that spells out how the amount was reached.',
                },
                {
                    title: 'Statements by email',
                    body: 'The store can now email you a statement when a payout is made.',
                },
                {
                    title: 'A new look',
                    body: 'The portal has been restyled, in light and dark, with the same pages in the same places.',
                },
            ],
        },
    },
];

export const LATEST_RELEASE = RELEASES[0];

type SeenStore = Pick<Storage, 'getItem' | 'setItem'>;

const seenKey = (role: WhatsNewRole) => `whats-new-seen-${role}`;

function defaultStore(): SeenStore | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function hasUnseenWhatsNew(role: WhatsNewRole, store: SeenStore | null = defaultStore()): boolean {
    if (LATEST_RELEASE.notes[role].length === 0) return false;
    try {
        return store?.getItem(seenKey(role)) !== LATEST_RELEASE.version;
    } catch {
        return false;
    }
}

export function markWhatsNewSeen(role: WhatsNewRole, store: SeenStore | null = defaultStore()): void {
    try {
        store?.setItem(seenKey(role), LATEST_RELEASE.version);
    } catch {
        // Private windows can refuse storage; the dot just comes back next visit.
    }
}
