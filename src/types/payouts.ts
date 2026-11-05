export type PayoutReadiness = 'ready' | 'accruing' | 'draft' | 'paid_up';
export type PayoutLifecycleStatus = 'draft' | 'paid' | 'voided';
export type HistoricalConfidence = 'verified' | 'reconciled' | 'legacy_unverified';
export type PayoutRangeMode = 'all_outstanding' | 'selected_range' | 'through_date';

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
    email: string | null;
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

export interface PayoutRangePreview {
    consignor_id: string;
    sales_count: number;
    items_count: number;
    range_earnings: number;
    already_paid: number;
    deductions: number;
    invoice_balance: number;
    invoices_applied: number;
    estimated_payout: number;
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
        source_range_start: string | null;
        source_range_end: string | null;
        include_prior_balance: boolean;
        threshold_snapshot: number | null;
        payable_before_invoices_snapshot: number | null;
        below_threshold_override_reason: string | null;
        historical_confidence: HistoricalConfidence;
        reconciliation_explanation: string | null;
        notes: string | null;
        prepared_at: string | null;
        voided_at: string | null;
        carried_in_snapshot: number | null;
        earned_snapshot: number | null;
        original_amount_due: number | null;
        is_partial: boolean;
        paid_by: string | null;
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
    actors: {
        prepared_by_name: string | null;
        paid_by_name: string | null;
        voided_by_name: string | null;
        reversed_by_name: string | null;
    } | null;
    latest_email: PayoutStatementEmail | null;
}

export interface PayoutStatementEmail {
    id: string;
    payout_id: string;
    recipient: string;
    status: 'sent' | 'failed';
    provider_id: string | null;
    error: string | null;
    sent_by: string | null;
    created_at: string;
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

export interface PayoutRunRow {
    consignor_id: string; consignor_number: string; name: string; business_name: string | null;
    pay_to_name: string; email: string | null; is_active: boolean; threshold: number;
    carried_in: number; earned: number; booth_rent: number; other_deductions: number;
    invoices_applied: number; payable_before_invoices: number; payable: number; paying_now: number;
    status: PayoutReadiness; threshold_remaining: number;
    pending_total: number; pending_count: number; pending_type: string | null;
    draft_id: string | null; draft_through: string | null; override_reason: string | null;
    last_paid_at: string | null; legacy_item_count: number;
    items_count: number; sales_count: number; cutoff_at: string;
}

export interface PayoutRunData {
    rows: PayoutRunRow[];
    paid_in_month: { count: number; total: number };
    legacy: { payouts: number; items: number };
}

export interface PrepareRunResult {
    consignor_id: string; payout_id: string | null;
    status: 'created' | 'skipped' | 'failed'; message: string | null;
}

export interface PayoutHistoryRow {
    id: string; status: PayoutLifecycleStatus; amount: number; paid_at: string | null;
    payment_method: string | null; payment_reference: string | null;
    historical_confidence: HistoricalConfidence;
    consignor: { name: string; business_name: string | null; consignor_number: string };
}
