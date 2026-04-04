import type { SaleItem } from './index';

export type OfflineQueueStatus = 'pending' | 'syncing' | 'failed';

export interface OfflineCashSaleRecord {
    id: string;
    customer_id: string | null;
    subtotal: number;
    tax_amount: number;
    total: number;
    payment_method: 'cash';
    cash_tendered: number | null;
    change_given: number | null;
    stripe_payment_intent_id: null;
    discounts: Array<{
        type: 'percentage' | 'fixed';
        value: number;
        reason?: string;
        calculatedAmount: number;
    }>;
    discount_total: number;
    store_credit_used: number;
    gift_card_used: number;
    card_fee_amount: number;
    processed_by_user: string | null;
    processed_by_employee: string | null;
    completed_at: string;
}

export interface OfflineCashSaleItemRecord extends Omit<SaleItem, 'sale_id'> {
    id: string;
    sale_id: string;
}

export interface OfflineInventoryAdjustment {
    item_id: string;
    quantity_sold: number;
}

export interface OfflineCashSalePayload {
    sale: OfflineCashSaleRecord;
    sale_items: OfflineCashSaleItemRecord[];
    inventory_adjustments: OfflineInventoryAdjustment[];
}

export interface OfflineCashSaleQueueEntry {
    queue_id: string;
    status: OfflineQueueStatus;
    attempt_count: number;
    last_error: string | null;
    last_attempt_at: string | null;
    created_at: string;
    updated_at: string;
    payload: OfflineCashSalePayload;
}

export interface OfflineSalesSyncStatus {
    total: number;
    pending: number;
    syncing: number;
    failed: number;
}
