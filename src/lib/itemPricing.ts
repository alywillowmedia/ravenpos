import type { Item } from '../types';

type ItemPricingFields = Pick<Item, 'price' | 'compare_at_price'>;

export function getAppliedCompareAtPrice(item: ItemPricingFields): number | null {
    const price = Number(item.price);
    const compareAtPrice = Number(item.compare_at_price);

    if (!Number.isFinite(price) || !Number.isFinite(compareAtPrice)) {
        return null;
    }

    return compareAtPrice > price ? compareAtPrice : null;
}

export function hasAppliedCompareAtPrice(item: ItemPricingFields): boolean {
    return getAppliedCompareAtPrice(item) !== null;
}
