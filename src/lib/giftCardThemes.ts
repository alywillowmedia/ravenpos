// Gift card designs. A card's look is an occasion (stored on the card as
// `theme`) drawn in one of two brand styles: Ravenlia for store-wide cards and
// most vendors, Alywillow for Alywillow's own cards.

export type GiftCardOccasion = 'everyday' | 'birthday' | 'thankyou' | 'christmas' | 'holidays';
export type GiftCardBrand = 'ravenlia' | 'alywillow';

export interface GiftCardPalette {
    /** Card background. */
    bg: string;
    /** Main text. */
    ink: string;
    /** Small caps labels and ornaments. */
    accent: string;
    /** Hairline frame and divider. */
    line: string;
}

export interface GiftCardOccasionDef {
    id: GiftCardOccasion;
    /** Shown on the picker. */
    label: string;
    /** Printed on the card. */
    headline: string;
    seasonal: boolean;
    palettes: Record<GiftCardBrand, GiftCardPalette>;
}

export const GIFT_CARD_OCCASIONS: GiftCardOccasionDef[] = [
    {
        id: 'everyday',
        label: 'Everyday',
        headline: 'A gift for you',
        seasonal: false,
        palettes: {
            ravenlia: { bg: '#F3ECDD', ink: '#2B2420', accent: '#8F5236', line: '#B9A88E' },
            alywillow: { bg: '#ECEBE3', ink: '#29251F', accent: '#566548', line: '#A9AE98' },
        },
    },
    {
        id: 'birthday',
        label: 'Birthday',
        headline: 'Happy Birthday',
        seasonal: false,
        palettes: {
            ravenlia: { bg: '#F7E8D8', ink: '#33241F', accent: '#B4492F', line: '#D9B79B' },
            alywillow: { bg: '#F1EBDD', ink: '#29251F', accent: '#94583B', line: '#C9BBA0' },
        },
    },
    {
        id: 'thankyou',
        label: 'Thank you',
        headline: 'Thank you',
        seasonal: false,
        palettes: {
            ravenlia: { bg: '#EFE6D2', ink: '#2B2420', accent: '#6B5B2E', line: '#BDAE86' },
            alywillow: { bg: '#E7EBE0', ink: '#29251F', accent: '#4E6350', line: '#A3B09C' },
        },
    },
    {
        id: 'christmas',
        label: 'Christmas',
        headline: 'Merry Christmas',
        seasonal: true,
        palettes: {
            ravenlia: { bg: '#1E3A2D', ink: '#F3ECDD', accent: '#D0AC62', line: '#6E8A6F' },
            alywillow: { bg: '#EDEBE1', ink: '#243528', accent: '#8C3B2E', line: '#A9AE98' },
        },
    },
    {
        id: 'holidays',
        label: 'Happy Holidays',
        headline: 'Happy Holidays',
        seasonal: true,
        palettes: {
            ravenlia: { bg: '#1F2A3C', ink: '#F1ECE0', accent: '#C9B88A', line: '#5E6C82' },
            alywillow: { bg: '#E6EAEA', ink: '#25302F', accent: '#4F6B6A', line: '#A5B3B1' },
        },
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
