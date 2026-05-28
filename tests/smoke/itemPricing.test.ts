import { describe, expect, it } from 'vitest';
import { getAppliedCompareAtPrice } from '../../src/lib/itemPricing';
import type { Item } from '../../src/types';

function buildPricing(overrides: Partial<Pick<Item, 'price' | 'compare_at_price'>>) {
    return {
        price: 40,
        compare_at_price: null,
        ...overrides,
    } as Pick<Item, 'price' | 'compare_at_price'>;
}

describe('item compare-at pricing', () => {
    it('applies only when compare-at is higher than price', () => {
        expect(getAppliedCompareAtPrice(buildPricing({ compare_at_price: 60 }))).toBe(60);
    });

    it('does not apply blank, equal, or lower compare-at values', () => {
        expect(getAppliedCompareAtPrice(buildPricing({ compare_at_price: null }))).toBeNull();
        expect(getAppliedCompareAtPrice(buildPricing({ compare_at_price: 40 }))).toBeNull();
        expect(getAppliedCompareAtPrice(buildPricing({ compare_at_price: 30 }))).toBeNull();
    });
});
