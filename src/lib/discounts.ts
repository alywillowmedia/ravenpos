// Discount calculation utilities for RavenPOS
import type { Discount, DiscountType, DiscountScope } from '../types';

let idCounter = 0;

// Generate a simple unique ID (no external dependency)
function generateId(): string {
    return `discount_${Date.now()}_${++idCounter}`;
}

// Create a new discount
export function createDiscount(
    type: DiscountType,
    value: number,
    scope: DiscountScope,
    itemIndex?: number,
    reason?: string,
    baseAmount?: number
): Discount {
    const calculatedAmount = baseAmount
        ? calculateDiscountAmount(type, value, baseAmount)
        : 0;

    return {
        id: generateId(),
        type,
        value,
        scope,
        itemIndex,
        reason,
        calculatedAmount,
    };
}

// Calculate the dollar amount of a discount
export function calculateDiscountAmount(
    type: DiscountType,
    value: number,
    baseAmount: number
): number {
    if (type === 'percentage') {
        // Cap percentage at 100%
        const percentage = Math.min(100, Math.max(0, value));
        return Math.round((baseAmount * percentage / 100) * 100) / 100;
    }
    // Fixed amount: cap at base amount
    return Math.round(Math.min(baseAmount, Math.max(0, value)) * 100) / 100;
}

// Validate a discount value
export function validateDiscountValue(
    type: DiscountType,
    value: number,
    maxAmount: number
): { valid: boolean; message?: string; adjustedValue?: number } {
    if (value <= 0) {
        return { valid: false, message: 'Discount value must be greater than 0' };
    }

    if (type === 'percentage') {
        if (value > 100) {
            return {
                valid: false,
                message: 'Percentage cannot exceed 100%',
                adjustedValue: 100
            };
        }
        return { valid: true };
    }

    // Fixed amount
    if (value > maxAmount) {
        return {
            valid: false,
            message: `Discount cannot exceed $${maxAmount.toFixed(2)}`,
            adjustedValue: maxAmount
        };
    }

    return { valid: true };
}

// Format discount for display (e.g., "10% off" or "$5.00 off")
export function formatDiscountLabel(discount: Discount): string {
    if (discount.type === 'percentage') {
        return `${discount.value}% off`;
    }
    return `$${discount.value.toFixed(2)} off`;
}

// Format discount as a summary line (e.g., "Discount (10%): -$12.50")
export function formatDiscountSummary(discount: Discount): string {
    const label = discount.type === 'percentage'
        ? `${discount.value}%`
        : `$${discount.value.toFixed(2)}`;

    const scope = discount.scope === 'order' ? 'Order Discount' : 'Item Discount';
    const reason = discount.reason ? ` - ${discount.reason}` : '';

    return `${scope} (${label})${reason}`;
}

// Update a discount's calculated amount based on a new base amount
export function recalculateDiscount(discount: Discount, baseAmount: number): Discount {
    return {
        ...discount,
        calculatedAmount: calculateDiscountAmount(discount.type, discount.value, baseAmount),
    };
}

// Calculate total discounts from an array
export function sumDiscounts(discounts: Discount[]): number {
    return discounts.reduce((sum, d) => sum + d.calculatedAmount, 0);
}
