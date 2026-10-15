// Receipt data types for thermal printing

import type { PaymentBreakdownEntry, PaymentMethod } from './index';

/**
 * Individual item on a receipt
 */
export interface ReceiptItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    originalLineTotal?: number;
    lineDiscountAmount?: number;
    orderDiscountAmount?: number;
    totalDiscountAmount?: number;
    discountedUnitPrice?: number;
    consignorName: string;
    consignorId: string;
    imageUrl?: string | null;
}

/**
 * Complete receipt data structure
 */
export interface ReceiptData {
    transactionId: string;
    date: Date;
    items: ReceiptItem[];
    subtotal: number;
    discountTotal?: number;
    netSubtotal?: number;
    tax: number;
    storeCreditUsed?: number;
    giftCardUsed?: number;
    // Full order total (subtotal - discounts + tax + card fee); tenders sum to it.
    total: number;
    cardFeeAmount?: number;
    cardLast4?: string;
    paymentMethod: PaymentMethod;
    // Every tender on the sale, including store credit and gift card.
    paymentBreakdown?: PaymentBreakdownEntry[] | null;
    checkNumber?: string;
    cashTendered?: number;
    changeGiven?: number;
}

/**
 * Refund receipt item
 */
export interface RefundReceiptItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    restocked: boolean;
}

/**
 * Refund receipt data structure
 */
export interface RefundReceiptData {
    refundId: string;
    originalTransactionId: string;
    date: Date;
    items: RefundReceiptItem[];
    refundAmount: number;
    paymentMethod: PaymentMethod;
    // Per-tender refund allocation; sums to refundAmount.
    paymentBreakdown?: PaymentBreakdownEntry[] | null;
    stripeRefundId?: string;
}
