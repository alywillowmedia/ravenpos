export type PayoutReadiness = 'ready' | 'accruing' | 'draft' | 'paid_up';
export type PayoutLifecycleStatus = 'draft' | 'paid' | 'voided';
export type HistoricalConfidence = 'verified' | 'reconciled' | 'legacy_unverified';
export type PayoutRangeMode = 'all_outstanding' | 'selected_range';

export interface PayoutVendorIdentity {
    id: string;
    consignor_number: string;
    name: string;
    business_name: string | null;
    pay_to_name: string;
    booth_location: string | null;
    has_w9_filled_out: boolean;
    commission_split: number;
    payout_threshold_override: number | null;
}

export interface PayoutWorkspaceSummary {
    opening_balance: number;
    range_activity: number;
    applied_adjustments: number;
    payments_in_range: number;
    closing_balance: number;
    current_payable: number;
    threshold: number;
    threshold_remaining: number;
    threshold_progress: number;
    readiness: PayoutReadiness;
    draft_id: string | null;
    legacy_exception_count: number;
    range_start: string | null;
    range_end: string | null;
}

export interface LinkedPayoutAllocation {
    payout_id: string;
    amount: number;
    paid_at: string;
    confidence: HistoricalConfidence;
}

export interface PayoutSaleFinancial {
    sale_id: string;
    sale_item_id: string;
    consignor_id: string;
    sale_timestamp: string;
    sku: string;
    item_name: string;
    quantity: number;
    refunded_quantity: number;
    unit_price: number;
    gross_line_amount: number;
    item_discount: number;
    allocated_order_discount: number;
    net_line_amount: number;
    commission_percentage: number;
    vendor_earnings_before_fees: number;
    allocated_card_fee: number;
    final_vendor_cut: number;
    paid_amount: number;
    remaining_amount: number;
    refund_obligation_amount: number;
    allocation_status: 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'legacy_uncertain';
    linked_payouts: LinkedPayoutAllocation[];
}

export interface RequiredPayoutAdjustment {
    adjustment_type: string;
    amount: number;
    signed_amount: number;
    description: string;
    source_table: string | null;
    source_reference: string | null;
    metadata: Record<string, unknown>;
    will_apply: boolean;
    pending_reason: string | null;
}

export interface PayoutInvoiceSummary {
    id: string;
    invoice_number: string;
    created_at: string;
    total: number;
    amount_paid: number;
    balance_due: number;
    status: 'unpaid' | 'partially_paid' | 'paid';
    notes: string | null;
}

export interface PayoutHistorySummary {
    id: string;
    status: PayoutLifecycleStatus;
    amount: number;
    paid_at: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    historical_confidence: HistoricalConfidence;
    reconciliation_explanation: string | null;
    items_sold: number;
}

export interface VendorPayoutWorkspaceData {
    vendor: PayoutVendorIdentity;
    summary: PayoutWorkspaceSummary;
    sale_items: PayoutSaleFinancial[];
    required_adjustments: RequiredPayoutAdjustment[];
    invoices: PayoutInvoiceSummary[];
    payout_history: PayoutHistorySummary[];
}

export interface SavePayoutDraftInput {
    consignorId: string;
    payoutId?: string | null;
    rangeMode: PayoutRangeMode;
    sourceRangeStart?: string | null;
    sourceRangeEnd?: string | null;
    includePriorBalance: boolean;
    paymentAmount?: number | null;
    invoiceApplications?: Array<{ invoice_id: string; amount: number }> | null;
    notes?: string | null;
    belowThresholdOverrideReason?: string | null;
}

export interface FinalizePayoutInput {
    payoutId: string;
    paymentMethod: string;
    paymentDate: string;
    paymentReference?: string | null;
    notes?: string | null;
    belowThresholdOverrideReason?: string | null;
}

export interface PayoutAllocationSnapshot {
    id: string;
    payout_id: string;
    sale_id: string;
    sale_item_id: string;
    consignor_id: string;
    sale_timestamp: string;
    sku: string;
    item_name: string;
    quantity: number;
    refunded_quantity: number;
    unit_price: number;
    gross_line_amount: number;
    item_discount: number;
    allocated_order_discount: number;
    net_line_amount: number;
    commission_percentage: number;
    vendor_earnings_before_fees: number;
    allocated_card_fee: number;
    final_vendor_cut: number;
    amount_settled: number;
    remaining_amount_after: number;
    created_at: string;
}

export interface PayoutAdjustmentSnapshot {
    id: string;
    payout_id: string;
    consignor_id: string;
    adjustment_type: string;
    amount: number;
    description: string;
    source_table: string | null;
    source_reference: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface PayoutStatementData {
    payout: Record<string, unknown> & {
        id: string;
        consignor_id: string;
        amount: number;
        status: PayoutLifecycleStatus;
        paid_at: string | null;
        payment_method: string | null;
        payment_reference: string | null;
        payment_date: string | null;
        cutoff_at: string | null;
        range_mode: PayoutRangeMode;
        include_prior_balance: boolean;
        threshold_snapshot: number | null;
        historical_confidence: HistoricalConfidence;
        reconciliation_explanation: string | null;
        notes: string | null;
        prepared_at: string | null;
        voided_at: string | null;
    };
    vendor: Pick<PayoutVendorIdentity, 'id' | 'consignor_number' | 'name' | 'business_name' | 'pay_to_name'>;
    allocations: PayoutAllocationSnapshot[];
    adjustments: PayoutAdjustmentSnapshot[];
    invoice_payments: Array<{
        id: string;
        invoice_id: string;
        invoice_number: string;
        payment_type: string;
        amount: number;
        paid_date: string;
        reference: string | null;
        notes: string | null;
        created_at: string;
        invoice_total: number;
        invoice_status: string;
    }>;
    reversal: Record<string, unknown> | null;
    is_exact: boolean;
}

export interface InvoiceWorkspaceData {
    invoice: {
        id: string;
        consignor_id: string | null;
        recipient_type: 'customer' | 'vendor';
        recipient_name: string;
        recipient_email: string | null;
        status: 'unpaid' | 'partially_paid' | 'paid';
        subtotal: number;
        tax_amount: number;
        total: number;
        amount_paid: number;
        notes: string | null;
        paid_at: string | null;
        created_at: string;
        updated_at: string;
    };
    items: Array<{
        id: string;
        invoice_id: string;
        sku: string | null;
        name: string;
        price: number;
        quantity: number;
        line_total: number;
        created_at: string;
    }>;
    payments: Array<{
        id: string;
        payout_id: string | null;
        payment_type: 'direct' | 'payout_funded' | 'legacy_direct' | 'reversal';
        amount: number;
        paid_date: string;
        actor_id: string | null;
        reference: string | null;
        notes: string | null;
        reverses_payment_id: string | null;
        created_at: string;
    }>;
    vendor: null | {
        id: string;
        consignor_number: string;
        name: string;
        business_name: string | null;
        current_payable: number;
    };
}
