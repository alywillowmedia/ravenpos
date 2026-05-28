import { describe, expect, it } from 'vitest';
import { createCartItem, calculateCartTotals, calculateVendorSubtotal } from '../../src/lib/tax';
import { createDiscount } from '../../src/lib/discounts';
import type { Item } from '../../src/types';

function buildItem(overrides: Partial<Item> = {}): Item {
    return {
        id: 'item-1',
        consignor_id: 'consignor-1',
        sku: 'SKU-100',
        name: 'Vintage Jacket',
        variant_summary: null,
        other_details_1: null,
        other_details_2: null,
        category: 'Clothing',
        quantity: 10,
        qty_unlabeled: 10,
        price: 100,
        compare_at_price: null,
        image_url: null,
        is_listed: true,
        show_in_public_browse: true,
        storefront_featured: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        shopify_product_id: null,
        shopify_variant_id: null,
        shopify_inventory_item_id: null,
        sync_enabled: false,
        last_sync_source: null,
        last_synced_at: null,
        ...overrides,
    };
}

describe('cart totals smoke', () => {
    it('stays stable with mixed item + order discounts', () => {
        const itemDiscount = createDiscount('percentage', 10, 'item', 0, 'Promo', 100);
        const orderDiscount = createDiscount('fixed', 5, 'order', undefined, 'Welcome', 90);
        const cartItem = createCartItem(buildItem(), 1, itemDiscount);

        const totals = calculateCartTotals([cartItem], [orderDiscount]);

        expect(totals.subtotal).toBe(100);
        expect(totals.itemDiscountTotal).toBe(10);
        expect(totals.orderDiscountTotal).toBe(5);
        expect(totals.discountTotal).toBe(15);
        expect(totals.taxTotal).toBe(4.51);
        expect(totals.total).toBe(89.51);
    });

    it('calculates a vendor subtotal from consignor shortcode', () => {
        const alyCartItem = createCartItem(buildItem({
            id: 'item-aly',
            price: 25,
            consignor: {
                id: 'consignor-aly',
                consignor_number: ' aly ',
                name: 'Alywillow',
                booth_location: null,
                email: null,
                phone: null,
                address: null,
                notes: null,
                commission_split: 1,
                monthly_booth_rent: 0,
                is_active: true,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
            },
        }), 2);
        const otherCartItem = createCartItem(buildItem({
            id: 'item-rav',
            price: 10,
            consignor: {
                id: 'consignor-rav',
                consignor_number: 'RAV',
                name: 'Ravenlia',
                booth_location: null,
                email: null,
                phone: null,
                address: null,
                notes: null,
                commission_split: 0,
                monthly_booth_rent: 0,
                is_active: true,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
            },
        }), 3);

        expect(calculateVendorSubtotal([alyCartItem, otherCartItem], 'ALY')).toBe(50);
    });
});
