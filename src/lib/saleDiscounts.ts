import type { CartItem, SaleItem } from '../types';

export interface SaleDiscountLineInput {
    quantity: number;
    unitPrice: number;
    lineDiscountAmount?: number;
}

export interface SaleDiscountLineBreakdown {
    quantity: number;
    unitPrice: number;
    originalLineTotal: number;
    lineDiscountAmount: number;
    subtotalAfterLineDiscount: number;
    orderDiscountAmount: number;
    totalDiscountAmount: number;
    netLineTotal: number;
    discountedUnitPrice: number;
}

export interface SaleDiscountBreakdown {
    items: SaleDiscountLineBreakdown[];
    subtotal: number;
    lineDiscountTotal: number;
    orderDiscountTotal: number;
    discountTotal: number;
    netSubtotal: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

export function calculateSaleDiscountBreakdown(
    items: SaleDiscountLineInput[],
    saleDiscountTotal: number
): SaleDiscountBreakdown {
    const normalizedItems = items.map((item) => {
        const quantity = Math.max(0, Number(item.quantity || 0));
        const unitPrice = Math.max(0, Number(item.unitPrice || 0));
        const originalLineTotal = roundCurrency(unitPrice * quantity);
        const lineDiscountAmount = roundCurrency(
            clamp(Number(item.lineDiscountAmount || 0), 0, originalLineTotal)
        );
        const subtotalAfterLineDiscount = roundCurrency(
            Math.max(0, originalLineTotal - lineDiscountAmount)
        );

        return {
            quantity,
            unitPrice,
            originalLineTotal,
            lineDiscountAmount,
            subtotalAfterLineDiscount,
        };
    });

    const subtotal = roundCurrency(
        normalizedItems.reduce((sum, item) => sum + item.originalLineTotal, 0)
    );
    const lineDiscountTotal = roundCurrency(
        normalizedItems.reduce((sum, item) => sum + item.lineDiscountAmount, 0)
    );
    const subtotalAfterLineDiscounts = roundCurrency(
        normalizedItems.reduce((sum, item) => sum + item.subtotalAfterLineDiscount, 0)
    );
    const orderDiscountTotal = roundCurrency(
        clamp(Number(saleDiscountTotal || 0) - lineDiscountTotal, 0, subtotalAfterLineDiscounts)
    );

    let remainingOrderDiscount = orderDiscountTotal;
    let remainingBasis = subtotalAfterLineDiscounts;

    const itemsWithAllocatedDiscounts = normalizedItems.map((item, index) => {
        const isLastItem = index === normalizedItems.length - 1;
        const orderDiscountAmount = roundCurrency(
            item.subtotalAfterLineDiscount <= 0 || remainingOrderDiscount <= 0
                ? 0
                : isLastItem || remainingBasis <= 0
                    ? Math.min(remainingOrderDiscount, item.subtotalAfterLineDiscount)
                    : Math.min(
                        item.subtotalAfterLineDiscount,
                        remainingOrderDiscount * (item.subtotalAfterLineDiscount / remainingBasis)
                    )
        );

        remainingOrderDiscount = roundCurrency(
            Math.max(0, remainingOrderDiscount - orderDiscountAmount)
        );
        remainingBasis = roundCurrency(
            Math.max(0, remainingBasis - item.subtotalAfterLineDiscount)
        );

        const totalDiscountAmount = roundCurrency(item.lineDiscountAmount + orderDiscountAmount);
        const netLineTotal = roundCurrency(
            Math.max(0, item.originalLineTotal - totalDiscountAmount)
        );
        const discountedUnitPrice = item.quantity > 0
            ? roundCurrency(netLineTotal / item.quantity)
            : 0;

        return {
            ...item,
            orderDiscountAmount,
            totalDiscountAmount,
            netLineTotal,
            discountedUnitPrice,
        };
    });

    const discountTotal = roundCurrency(lineDiscountTotal + orderDiscountTotal);
    const netSubtotal = roundCurrency(
        itemsWithAllocatedDiscounts.reduce((sum, item) => sum + item.netLineTotal, 0)
    );

    return {
        items: itemsWithAllocatedDiscounts,
        subtotal,
        lineDiscountTotal,
        orderDiscountTotal,
        discountTotal,
        netSubtotal,
    };
}

export function calculateCartDiscountBreakdown(
    cartItems: CartItem[],
    saleDiscountTotal: number
): SaleDiscountBreakdown {
    return calculateSaleDiscountBreakdown(
        cartItems.map((item) => ({
            quantity: item.quantity,
            unitPrice: Number(item.item.price || 0),
            lineDiscountAmount: Math.max(
                0,
                roundCurrency(Number(item.lineTotal || 0) - Number(item.discountedLineTotal || 0))
            ),
        })),
        saleDiscountTotal
    );
}

export function calculateSaleItemDiscountBreakdown(
    saleItems: Pick<SaleItem, 'price' | 'quantity' | 'discount_amount'>[],
    saleDiscountTotal: number
): SaleDiscountBreakdown {
    return calculateSaleDiscountBreakdown(
        saleItems.map((item) => ({
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.price || 0),
            lineDiscountAmount: Number(item.discount_amount || 0),
        })),
        saleDiscountTotal
    );
}
