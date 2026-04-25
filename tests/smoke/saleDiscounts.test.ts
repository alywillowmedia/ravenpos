import { describe, expect, it } from 'vitest';
import { calculateCartDiscountBreakdown, calculateSaleItemDiscountBreakdown } from '../../src/lib/saleDiscounts';
import { createCartItem } from '../../src/lib/tax';
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

describe('sale discount breakdowns', () => {
    it('allocates item and order discounts to sale items', () => {
        const breakdown = calculateSaleItemDiscountBreakdown([
            {
                price: 100,
                quantity: 1,
                discount_amount: 10,
            },
        ], 15);

        expect(breakdown.subtotal).toBe(100);
        expect(breakdown.lineDiscountTotal).toBe(10);
        expect(breakdown.orderDiscountTotal).toBe(5);
        expect(breakdown.discountTotal).toBe(15);
        expect(breakdown.netSubtotal).toBe(85);
        expect(breakdown.items[0].netLineTotal).toBe(85);
        expect(breakdown.items[0].discountedUnitPrice).toBe(85);
    });

    it('uses cart discount-aware line totals when building receipt breakdowns', () => {
        const itemDiscount = createDiscount('percentage', 10, 'item', 0, 'Promo', 100);
        const cartItem = createCartItem(buildItem(), 1, itemDiscount);
        const breakdown = calculateCartDiscountBreakdown([cartItem], 15);

        expect(breakdown.lineDiscountTotal).toBe(10);
        expect(breakdown.orderDiscountTotal).toBe(5);
        expect(breakdown.discountTotal).toBe(15);
        expect(breakdown.netSubtotal).toBe(85);
        expect(breakdown.items[0].totalDiscountAmount).toBe(15);
    });
});
