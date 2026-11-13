// Gift card designs. A card's look is its brand's illustrated border (Ravenlia
// for store-wide cards and most vendors, Alywillow for Alywillow's own cards)
// plus an occasion (stored on the card as `theme`), which sets the headline and
// its colour.

export type GiftCardOccasion = 'everyday' | 'birthday' | 'thankyou' | 'christmas' | 'holidays';
export type GiftCardBrand = 'ravenlia' | 'alywillow';

export interface GiftCardOccasionDef {
    id: GiftCardOccasion;
    /** Shown on the picker. */
    label: string;
    /** Printed on the card. */
    headline: string;
    seasonal: boolean;
    /** Colour of the headline, per brand. The border art is the brand's and never changes. */
    accents: Record<GiftCardBrand, string>;
}

export const GIFT_CARD_OCCASIONS: GiftCardOccasionDef[] = [
    {
        id: 'everyday',
        label: 'Everyday',
        headline: 'A gift for you',
        seasonal: false,
        accents: { ravenlia: '#5A1512', alywillow: '#33482A' },
    },
    {
        id: 'birthday',
        label: 'Birthday',
        headline: 'Happy Birthday',
        seasonal: false,
        accents: { ravenlia: '#A3271C', alywillow: '#9A3F63' },
    },
    {
        id: 'thankyou',
        label: 'Thank you',
        headline: 'Thank you',
        seasonal: false,
        accents: { ravenlia: '#6B4A16', alywillow: '#4F437C' },
    },
    {
        id: 'christmas',
        label: 'Christmas',
        headline: 'Merry Christmas',
        seasonal: true,
        accents: { ravenlia: '#1F5A3A', alywillow: '#8C2F26' },
    },
    {
        id: 'holidays',
        label: 'Happy Holidays',
        headline: 'Happy Holidays',
        seasonal: true,
        accents: { ravenlia: '#1F5F6B', alywillow: '#2F5A6B' },
    },
];

export const DEFAULT_GIFT_CARD_OCCASION: GiftCardOccasion = 'everyday';

export function getGiftCardOccasion(theme: string | null | undefined): GiftCardOccasionDef {
    return GIFT_CARD_OCCASIONS.find((occasion) => occasion.id === theme) || GIFT_CARD_OCCASIONS[0];
}

export interface GiftCardVendorLike {
    id: string;
    name: string;
    /** Vendor shortcode, e.g. "ALY". */
    shortcode?: string | null;
}

/** Alywillow cards get the Alywillow look; everything else is Ravenlia's. */
export function getGiftCardBrand(vendor: GiftCardVendorLike | null | undefined): GiftCardBrand {
    if (!vendor) return 'ravenlia';
    const shortcode = (vendor.shortcode || '').trim().toUpperCase();
    if (shortcode === 'ALY') return 'alywillow';
    return /alywillow/i.test(vendor.name || '') ? 'alywillow' : 'ravenlia';
}

export function getGiftCardBrandName(brand: GiftCardBrand): string {
    return brand === 'alywillow' ? 'Alywillow Organics' : 'Ravenlia Galleria';
}

/** The "where it's good" line printed on every card. */
export function getGiftCardScopeLine(vendorName: string | null | undefined): string {
    const name = (vendorName || '').trim();
    return name ? `Good for ${name} items at Ravenlia` : 'Good for anything at Ravenlia';
}

/** True from November 1 through January 5, when holiday designs lead the picker. */
export function isHolidaySeason(date: Date = new Date()): boolean {
    const month = date.getMonth();
    return month === 10 || month === 11 || (month === 0 && date.getDate() <= 5);
}

/** Occasions in picker order: seasonal designs first while they are in season. */
export function getOrderedGiftCardOccasions(date: Date = new Date()): GiftCardOccasionDef[] {
    if (!isHolidaySeason(date)) return GIFT_CARD_OCCASIONS;
    return [
        ...GIFT_CARD_OCCASIONS.filter((occasion) => occasion.seasonal),
        ...GIFT_CARD_OCCASIONS.filter((occasion) => !occasion.seasonal),
    ];
}
