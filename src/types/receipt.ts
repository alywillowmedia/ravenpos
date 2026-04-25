// Receipt data types for thermal printing

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
    total: number;
    cardFeeAmount?: number;
    cardLast4?: string;
    paymentMethod: 'cash' | 'card' | 'check';
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
    paymentMethod: 'cash' | 'card' | 'check';
    stripeRefundId?: string;
}
