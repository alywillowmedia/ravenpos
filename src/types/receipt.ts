// Receipt data types for thermal printing

/**
 * Individual item on a receipt
 */
export interface ReceiptItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
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
    tax: number;
    total: number;
    paymentMethod: 'cash' | 'card';
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
    paymentMethod: 'cash' | 'card';
    stripeRefundId?: string;
}
