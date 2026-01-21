import type { CartItem, Item, Discount } from '../types';
import { calculateDiscountAmount } from './discounts';

// Default tax rates by category
const TAX_RATES: Record<string, number> = {
    'Clothing': 0.053,
    'Accessories': 0.053,
    'Collectibles': 0.053,
    'Books': 0.0, // Often tax-exempt
    'Furniture': 0.053,
    'Electronics': 0.053,
    'Art': 0.053,
    'Jewelry': 0.053,
    'Vintage': 0.053,
    'Other': 0.053,
};

// Get tax rate for a category
export function getTaxRate(category: string): number {
    return TAX_RATES[category] ?? TAX_RATES['Other'];
}

// Calculate tax for a single item (on original price)
export function calculateItemTax(item: Item, quantity: number = 1): number {
    const rate = getTaxRate(item.category);
    return item.price * quantity * rate;
}

// Calculate tax for a discounted amount
export function calculateTaxOnAmount(amount: number, category: string): number {
    const rate = getTaxRate(category);
    return Math.round(amount * rate * 100) / 100;
}

// Create cart item from inventory item (with optional discount)
export function createCartItem(
    item: Item,
    quantity: number = 1,
    discount?: Discount
): CartItem {
    const lineTotal = item.price * quantity;

    // Calculate discount amount (recalculate to ensure accuracy)
    let discountAmount = 0;
    let updatedDiscount = discount;
    if (discount) {
        discountAmount = calculateDiscountAmount(discount.type, discount.value, lineTotal);
        updatedDiscount = { ...discount, calculatedAmount: discountAmount };
    }

    // Discounted line total (tax calculated on discounted amount)
    const discountedLineTotal = Math.max(0, lineTotal - discountAmount);
    const taxRate = getTaxRate(item.category);
    const discountedTaxAmount = discountedLineTotal * taxRate;

    // Original tax (for reference/display)
    const taxAmount = lineTotal * taxRate;

    return {
        item,
        quantity,
        lineTotal: Math.round(lineTotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        discount: updatedDiscount,
        discountedLineTotal: Math.round(discountedLineTotal * 100) / 100,
        discountedTaxAmount: Math.round(discountedTaxAmount * 100) / 100,
    };
}

// Calculate cart totals (with order-level discounts)
export function calculateCartTotals(
    items: CartItem[],
    orderDiscounts: Discount[] = []
): {
    subtotal: number;
    taxTotal: number;
    total: number;
    itemDiscountTotal: number;
    orderDiscountTotal: number;
    discountTotal: number;
} {
    // Original subtotal (before any discounts)
    const originalSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    // Item-level discount total
    const itemDiscountTotal = items.reduce(
        (sum, item) => sum + (item.discount?.calculatedAmount ?? 0), 0
    );

    // Subtotal after item discounts (but before order discounts)
    const subtotalAfterItemDiscounts = items.reduce(
        (sum, item) => sum + item.discountedLineTotal, 0
    );

    // Calculate order-level discounts on remaining subtotal
    let orderDiscountTotal = 0;
    let remainingForOrderDiscounts = subtotalAfterItemDiscounts;

    for (const discount of orderDiscounts) {
        // Recalculate order discount based on remaining amount
        const discountAmount = calculateDiscountAmount(
            discount.type,
            discount.value,
            remainingForOrderDiscounts
        );
        orderDiscountTotal += discountAmount;
        remainingForOrderDiscounts = Math.max(0, remainingForOrderDiscounts - discountAmount);
    }

    // Final subtotal after all discounts
    const finalSubtotal = Math.max(0, subtotalAfterItemDiscounts - orderDiscountTotal);

    // Tax calculated on discounted item amounts, proportionally reduced for order discounts
    const itemTaxTotal = items.reduce((sum, item) => sum + item.discountedTaxAmount, 0);

    // If there are order discounts, proportionally reduce tax
    let taxTotal = itemTaxTotal;
    if (orderDiscountTotal > 0 && subtotalAfterItemDiscounts > 0) {
        const orderDiscountRatio = finalSubtotal / subtotalAfterItemDiscounts;
        taxTotal = itemTaxTotal * orderDiscountRatio;
    }

    const total = finalSubtotal + taxTotal;
    const discountTotal = itemDiscountTotal + orderDiscountTotal;

    return {
        subtotal: Math.round(originalSubtotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        total: Math.round(total * 100) / 100,
        itemDiscountTotal: Math.round(itemDiscountTotal * 100) / 100,
        orderDiscountTotal: Math.round(orderDiscountTotal * 100) / 100,
        discountTotal: Math.round(discountTotal * 100) / 100,
    };
}

// Update tax rates from database categories (call on app init)
export function updateTaxRates(categories: { name: string; tax_rate: number }[]): void {
    categories.forEach(cat => {
        TAX_RATES[cat.name] = cat.tax_rate;
    });
}

