import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatSupabaseError } from '../lib/supabaseError';
import type {
    FinalizePayoutInput,
    InvoiceWorkspaceData,
    PayoutStatementData,
    SavePayoutDraftInput,
    VendorPayoutWorkspaceData,
} from '../types/payouts';

export interface PayoutQueueRange {
    start: string | null;
    end: string | null;
}

function rpcError(error: unknown, fallback: string): string {
    return formatSupabaseError(error, fallback);
}

export async function getPayoutQueue(range: PayoutQueueRange): Promise<VendorPayoutWorkspaceData[]> {
    const { data, error } = await supabase.rpc('get_payout_queue', {
        p_range_start: range.start,
        p_range_end: range.end,
    });
    if (error) throw new Error(rpcError(error, 'Failed to load the payout queue'));
    return (data || []) as unknown as VendorPayoutWorkspaceData[];
}

export async function getVendorPayoutWorkspace(
    consignorId: string,
    range: PayoutQueueRange = { start: null, end: null },
): Promise<VendorPayoutWorkspaceData> {
    const { data, error } = await supabase.rpc('get_vendor_payout_workspace', {
        p_consignor_id: consignorId,
        p_range_start: range.start,
        p_range_end: range.end,
    });
    if (error) throw new Error(rpcError(error, 'Failed to load the vendor payout workspace'));
    return data as unknown as VendorPayoutWorkspaceData;
}

export async function savePayoutDraft(input: SavePayoutDraftInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_payout_draft', {
        p_consignor_id: input.consignorId,
        p_payout_id: input.payoutId || null,
        p_range_mode: input.rangeMode,
        p_source_range_start: input.sourceRangeStart || null,
        p_source_range_end: input.sourceRangeEnd || null,
        p_include_prior_balance: input.includePriorBalance,
        p_payment_amount: input.paymentAmount ?? null,
        p_invoice_applications: input.invoiceApplications ?? null,
        p_notes: input.notes || null,
        p_below_threshold_override_reason: input.belowThresholdOverrideReason || null,
    });
    if (error) throw new Error(rpcError(error, 'Failed to save the payout draft'));
    return data as string;
}

export async function finalizePayout(input: FinalizePayoutInput): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('finalize_payout', {
        p_payout_id: input.payoutId,
        p_payment_method: input.paymentMethod,
        p_payment_date: input.paymentDate,
        p_payment_reference: input.paymentReference || null,
        p_notes: input.notes || null,
        p_below_threshold_override_reason: input.belowThresholdOverrideReason || null,
    });
    if (error) throw new Error(rpcError(error, 'Failed to finalize the payout'));
    return (data || {}) as Record<string, unknown>;
}

export async function voidPayout(payoutId: string, reason: string): Promise<string> {
    const { data, error } = await supabase.rpc('void_payout', {
        p_payout_id: payoutId,
        p_reason: reason,
    });
    if (error) throw new Error(rpcError(error, 'Failed to void the payout'));
    return data as string;
}

export async function getPayoutStatement(payoutId: string): Promise<PayoutStatementData> {
    const { data, error } = await supabase.rpc('get_payout_statement', {
        p_payout_id: payoutId,
    });
    if (error) throw new Error(rpcError(error, 'Failed to load the payout statement'));
    return data as unknown as PayoutStatementData;
}

export async function getPayoutReconciliationReport(): Promise<{
    summary: Array<{ confidence: string; count: number; total_amount: number }>;
    unresolved: Array<Record<string, unknown>>;
}> {
    const { data, error } = await supabase.rpc('get_payout_reconciliation_report');
    if (error) throw new Error(rpcError(error, 'Failed to load the reconciliation report'));
    return data as unknown as {
        summary: Array<{ confidence: string; count: number; total_amount: number }>;
        unresolved: Array<Record<string, unknown>>;
    };
}

export async function getInvoiceWorkspace(invoiceId: string): Promise<InvoiceWorkspaceData> {
    const { data, error } = await supabase.rpc('get_invoice_workspace', {
        p_invoice_id: invoiceId,
    });
    if (error) throw new Error(rpcError(error, 'Failed to load the invoice workspace'));
    return data as unknown as InvoiceWorkspaceData;
}

export async function recordInvoicePayment(input: {
    invoiceId: string;
    amount: number;
    paidDate: string;
    reference?: string | null;
    notes?: string | null;
}): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: input.invoiceId,
        p_amount: input.amount,
        p_paid_date: input.paidDate,
        p_reference: input.reference || null,
        p_notes: input.notes || null,
    });
    if (error) throw new Error(rpcError(error, 'Failed to record the invoice payment'));
    return (data || {}) as Record<string, unknown>;
}

export function usePayouts(initialRange: PayoutQueueRange = { start: null, end: null }) {
    const [queue, setQueue] = useState<VendorPayoutWorkspaceData[]>([]);
    const [range, setRange] = useState<PayoutQueueRange>(initialRange);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async (nextRange: PayoutQueueRange = range) => {
        setIsLoading(true);
        setError(null);
        try {
            const nextQueue = await getPayoutQueue(nextRange);
            setQueue(nextQueue);
            setRange(nextRange);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load payouts');
        } finally {
            setIsLoading(false);
        }
    }, [range]);

    useEffect(() => {
        void refetch(initialRange);
        // Initial range is intentionally captured once; subsequent changes go through refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { queue, range, isLoading, error, refetch };
}
