import type { CartItem, Item } from '../types';

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

// Calculate tax for a single item
export function calculateItemTax(item: Item, quantity: number = 1): number {
    const rate = getTaxRate(item.category);
    return item.price * quantity * rate;
}

// Calculate cart totals
export function calculateCartTotals(items: CartItem[]): {
    subtotal: number;
    taxTotal: number;
    total: number;
} {
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const taxTotal = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const total = subtotal + taxTotal;

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        total: Math.round(total * 100) / 100,
    };
}

// Create cart item from inventory item
export function createCartItem(item: Item, quantity: number = 1): CartItem {
    const lineTotal = item.price * quantity;
    const taxAmount = calculateItemTax(item, quantity);

    return {
        item,
        quantity,
        lineTotal: Math.round(lineTotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
    };
}

// Update tax rates from database categories (call on app init)
export function updateTaxRates(categories: { name: string; tax_rate: number }[]): void {
    categories.forEach(cat => {
        TAX_RATES[cat.name] = cat.tax_rate;
    });
}
