// Database entity types for RavenPOS

export interface Category {
    id: string;
    name: string;
    tax_rate: number;
    created_at: string;
}

export interface Consignor {
    id: string;
    consignor_number: string;
    name: string;
    booth_location: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    commission_split: number;
    monthly_booth_rent: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Item {
    id: string;
    consignor_id: string;
    sku: string;
    name: string;
    variant: string | null;
    category: string;
    quantity: number;
    qty_unlabeled: number;
    price: number;
    image_url: string | null;
    is_listed: boolean;
    created_at: string;
    updated_at: string;
    // Shopify sync fields
    shopify_product_id: string | null;
    shopify_variant_id: string | null;
    shopify_inventory_item_id: string | null;
    sync_enabled: boolean;
    last_sync_source: string | null;
    last_synced_at: string | null;
    // Joined data
    consignor?: Consignor;
}

// Customer types for tracking buyers
export interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export type CustomerInput = Omit<Customer, 'id' | 'created_at' | 'updated_at'>;

export type PaymentMethod = 'cash' | 'card';

// Discount types for POS
export type DiscountType = 'percentage' | 'fixed';
export type DiscountScope = 'order' | 'item';

export interface Discount {
    id: string;
    type: DiscountType;
    value: number;           // Percentage (0-100) or dollar amount
    scope: DiscountScope;
    itemIndex?: number;      // Only for item-level discounts (cart index)
    reason?: string;         // Optional note
    calculatedAmount: number; // Actual dollar amount off
}

export interface Sale {
    id: string;
    customer_id: string | null;
    completed_at: string;
    subtotal: number;
    tax_amount: number;
    total: number;
    payment_method: PaymentMethod;
    cash_tendered: number | null;
    change_given: number | null;
    stripe_payment_intent_id: string | null;
    refund_status: 'partial' | 'full' | null;
    // Discount data
    discounts?: Array<{
        type: DiscountType;
        value: number;
        reason?: string;
        calculatedAmount: number;
    }>;
    discount_total?: number;
    // Joined data
    customer?: Customer;
}

export interface SaleItem {
    id: string;
    sale_id: string;
    item_id: string;
    consignor_id: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    commission_split: number;
    // Discount data
    discount_type?: DiscountType;
    discount_value?: number;
    discount_amount?: number;
    discount_reason?: string;
}

// Refund types
export interface RefundItem {
    item_id: string;
    sale_item_id: string;
    name: string;
    quantity: number;
    max_quantity: number;
    price: number;
    restocked: boolean;
}

export interface Refund {
    id: string;
    sale_id: string;
    customer_id: string | null;
    refund_amount: number;
    payment_method: PaymentMethod;
    stripe_refund_id: string | null;
    items: RefundItem[];
    created_at: string;
}

// Form/input types
export type ConsignorInput = Omit<Consignor, 'id' | 'created_at' | 'updated_at'>;
export type ItemInput = Omit<Item, 'id' | 'created_at' | 'updated_at' | 'consignor'>;

// Cart types for POS
export interface CartItem {
    item: Item;
    quantity: number;
    lineTotal: number;
    taxAmount: number;
    // Discount data (item-level)
    discount?: Discount;
    discountedLineTotal: number;
    discountedTaxAmount: number;
}

export interface Cart {
    items: CartItem[];
    subtotal: number;
    taxTotal: number;
    total: number;
    // Discount data (order-level)
    discounts: Discount[];
    itemDiscountTotal: number;
    orderDiscountTotal: number;
    discountTotal: number;
}

// Stats for dashboard
export interface DashboardStats {
    totalConsignors: number;
    activeConsignors: number;
    totalItems: number;
    totalQuantity: number;
    todaySalesCount: number;
    todaySalesTotal: number;
}

// Payout types for admin financial management
export type BalanceDisposition = 'deferred' | 'forgiven';

export interface Payout {
    id: string;
    consignor_id: string;
    amount: number;
    period_start: string;
    period_end: string;
    sales_count: number;
    items_sold: number;
    gross_sales: number;
    tax_collected: number;
    store_share: number;
    credit_card_fees: number;
    notes: string | null;
    paid_at: string;
    created_at: string;
    // Partial payout fields
    original_amount_due: number | null;
    is_partial: boolean;
    partial_reason: string | null;
    balance_disposition: BalanceDisposition | null;
    // Joined data
    consignor?: Consignor;
}

export type PayoutInput = Omit<Payout, 'id' | 'created_at' | 'consignor'>;

// Booth rent payment tracking
export interface BoothRentPayment {
    id: string;
    consignor_id: string;
    amount: number;
    period_month: number;
    period_year: number;
    notes: string | null;
    paid_at: string;
    created_at: string;
}

export type BoothRentPaymentInput = Omit<BoothRentPayment, 'id' | 'created_at'>;

// Calculated payout data for a consignor (before payment)
export interface ConsignorPayoutSummary {
    consignor: Consignor;
    pendingAmount: number;
    grossSales: number;
    taxCollected: number;
    storeShare: number;
    creditCardFees: number;
    salesCount: number;
    itemsSold: number;
    lastPayout: Payout | null;
    salesSinceLastPayout: SaleItemDetail[];
}

// Detailed sale item for payout breakdown
export interface SaleItemDetail {
    saleId: string;
    saleItemId: string;
    saleDate: string;
    itemName: string;
    sku: string;
    quantity: number;
    price: number;
    lineTotal: number;
    commissionSplit: number;
    consignorShare: number;
    storeShare: number;
    taxAmount: number;
    creditCardFee: number;
    isRefunded: boolean;
    refundedQuantity: number;
}

