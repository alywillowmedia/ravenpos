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
    first_name?: string | null;
    last_name?: string | null;
    business_name?: string | null;
    pay_to_type?: 'business' | 'individual';
    has_w9_filled_out?: boolean;
    booth_location: string | null;
    booth_square_feet?: number | null;
    booth_cost_per_square_foot?: number | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    notes: string | null;
    commission_split: number;
    consignor_pays_card_fee?: boolean;
    dealer_discount_percent?: number;
    monthly_booth_rent: number;
    scheduled_active_date?: string | null;
    is_active: boolean;
    storefront_display_name?: string | null;
    storefront_slug?: string | null;
    storefront_description?: string | null;
    storefront_logo_url?: string | null;
    storefront_header_image_url?: string | null;
    storefront_show_items?: boolean;
    storefront_images_only?: boolean;
    created_at: string;
    updated_at: string;
}

export interface ScheduledConsignorRateChangeInput {
    effective_date: string;
    commission_split: number;
    booth_square_feet?: number;
    booth_cost_per_square_foot?: number;
    monthly_booth_rent: number;
}

export interface Item {
    id: string;
    consignor_id: string;
    sku: string;
    name: string;
    variant_summary: string | null;
    other_details_1: string | null;
    other_details_2: string | null;
    category: string;
    quantity: number;
    qty_unlabeled: number;
    price: number;
    image_url: string | null;
    is_listed: boolean;
    show_in_public_browse: boolean;
    storefront_featured: boolean;
    created_at: string;
    updated_at: string;
    // Shopify sync fields
    shopify_product_id: string | null;
    shopify_variant_id: string | null;
    shopify_inventory_item_id: string | null;
    sync_enabled: boolean;
    last_sync_source: string | null;
    last_synced_at: string | null;
    is_custom_sale_item?: boolean;
    // Joined data
    consignor?: Consignor;
}

// Customer types for tracking buyers
export interface Customer {
    id: string;
    consignor_id?: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    accepts_marketing: boolean;
    store_credit?: number;
    created_at: string;
    updated_at: string;
}

export type CustomerInput = Omit<Customer, 'id' | 'created_at' | 'updated_at'>;

export type PaymentMethod = 'cash' | 'card' | 'check';

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
    processed_by_employee?: string | null;
    processed_by_user?: string | null;
    completed_at: string;
    subtotal: number;
    tax_amount: number;
    total: number;
    store_credit_used?: number;
    gift_card_used?: number;
    card_fee_amount?: number;
    payment_method: PaymentMethod;
    check_number?: string | null;
    cash_tendered: number | null;
    change_given: number | null;
    stripe_payment_intent_id: string | null;
    card_last4?: string | null;
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

export interface GiftCard {
    id: string;
    code: string;
    original_amount: number;
    current_balance: number;
    recipient_name: string | null;
    recipient_email: string | null;
    from_name: string | null;
    purchaser_customer_id: string | null;
    purchase_payment_method: PaymentMethod | null;
    purchase_payment_intent_id: string | null;
    message: string | null;
    issued_at: string;
    expires_at: string | null;
    last_redeemed_at: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SaleItem {
    id: string;
    sale_id: string;
    item_id: string | null;
    consignor_id: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    commission_split: number;
    consignor_pays_card_fee?: boolean;
    // Discount data
    discount_type?: DiscountType;
    discount_value?: number;
    discount_amount?: number;
    discount_reason?: string;
}

// Refund types
export interface RefundItem {
    item_id: string | null;
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

export type InvoiceRecipientType = 'customer' | 'vendor';
export type InvoiceStatus = 'unpaid' | 'paid';

export interface InvoiceItem {
    id: string;
    invoice_id: string;
    item_id: string | null;
    consignor_id: string | null;
    sku: string | null;
    name: string;
    price: number;
    quantity: number;
    line_total: number;
    is_custom: boolean;
    created_at: string;
    // Joined data
    consignor?: Consignor;
    item?: Item;
}

export interface Invoice {
    id: string;
    recipient_type: InvoiceRecipientType;
    customer_id: string | null;
    consignor_id: string | null;
    recipient_name: string;
    recipient_email: string | null;
    status: InvoiceStatus;
    subtotal: number;
    tax_amount: number;
    total: number;
    notes?: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
    // Joined data
    customer?: Customer;
    consignor?: Consignor;
    items?: InvoiceItem[];
}

// Form/input types
export type ConsignorInput = Omit<Consignor, 'id' | 'created_at' | 'updated_at'> & {
    scheduled_rate_change?: ScheduledConsignorRateChangeInput | null;
};
export type ItemInput = Omit<Item, 'id' | 'created_at' | 'updated_at' | 'consignor'>;

// Cart types for POS
export interface CartItem {
    item: Item;
    quantity: number;
    lineTotal: number;
    taxAmount: number;
    // Discount data (item-level)
    discount?: Discount;
    dealerDiscountPercent?: number;
    dealerDiscountAmount?: number;
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
    booth_rent_deduction?: number;
    marketing_fee_deduction?: number;
    ledger_deduction?: number;
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
    pendingFromSales: number;
    pendingAmount: number;
    grossSales: number;
    taxCollected: number;
    storeShare: number;
    creditCardFees: number;
    boothRentDeduction: number;
    marketingFeeDeduction: number;
    ledgerDeduction: number;
    salesCount: number;
    itemsSold: number;
    lastPayout: Payout | null;
    salesSinceLastPayout: SaleItemDetail[];
    boothRentMonthsToDeduct: Array<{ period_month: number; period_year: number }>;
    marketingAllocationIdsToDeduct: string[];
    ledgerEntryIdsToDeduct: string[];
    pendingLedgerEntries: VendorLedgerEntry[];
}

export interface MarketingFee {
    id: string;
    title: string;
    description: string | null;
    amount: number;
    consignor_count: number;
    created_by: string | null;
    created_at: string;
}

export interface MarketingFeeAllocation {
    id: string;
    marketing_fee_id: string;
    consignor_id: string;
    amount: number;
    deducted_payout_id: string | null;
    deducted_at: string | null;
    created_at: string;
}

export interface VendorLedgerEntry {
    id: string;
    consignor_id: string;
    description: string;
    amount: number;
    deducted_payout_id: string | null;
    deducted_at: string | null;
    created_by: string | null;
    created_at: string;
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
