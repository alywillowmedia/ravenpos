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
    printed_quantity: number;
    price: number;
    image_url: string | null;
    is_listed: boolean;
    created_at: string;
    updated_at: string;
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
}

export interface Cart {
    items: CartItem[];
    subtotal: number;
    taxTotal: number;
    total: number;
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
    notes: string | null;
    paid_at: string;
    created_at: string;
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
    salesCount: number;
    itemsSold: number;
    lastPayout: Payout | null;
    salesSinceLastPayout: SaleItemDetail[];
}

// Detailed sale item for payout breakdown
export interface SaleItemDetail {
    saleId: string;
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
}
