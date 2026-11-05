import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { localDateString } from '../lib/payoutRun';
import { formatSupabaseError } from '../lib/supabaseError';
import type {
    FinalizePayoutInput,
    InvoiceWorkspaceData,
    PayoutHistoryRow,
    PayoutRunData,
    PayoutRunRow,
    PayoutStatementData,
    PrepareRunResult,
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

export async function getPayoutRun(through: string): Promise<PayoutRunData> {
    const { data, error } = await supabase.rpc('get_payout_run', { p_through: through });
    if (error) throw new Error(rpcError(error, 'Failed to load the payout run'));
    return data as unknown as PayoutRunData;
}

export async function getVendorPayoutPreview(consignorId: string, through: string): Promise<PayoutRunRow> {
    const { data, error } = await supabase.rpc('get_vendor_payout_preview', {
        p_consignor_id: consignorId,
        p_through: through,
    });
    if (error) throw new Error(rpcError(error, 'Failed to load the payout preview'));
    return data as unknown as PayoutRunRow;
}

export async function preparePayoutRun(through: string, consignorIds: string[]): Promise<PrepareRunResult[]> {
    const { data, error } = await supabase.rpc('prepare_payout_run', {
        p_through: through,
        p_consignor_ids: consignorIds,
    });
    if (error) throw new Error(rpcError(error, 'Failed to prepare the payouts'));
    return (data || []) as unknown as PrepareRunResult[];
}

export async function discardPayoutDraft(id: string): Promise<void> {
    const { error } = await supabase.rpc('discard_payout_draft', { p_payout_id: id });
    if (error) throw new Error(rpcError(error, 'Failed to discard the payout draft'));
}

export interface PayoutHistoryQuery {
    /** 'YYYY-MM', or null for all months. */
    month: string | null;
    status: 'paid' | 'voided' | 'all';
    page: number;
    pageSize: number;
}

function monthBounds(month: string): { start: string; next: string } {
    const [year, mon] = month.split('-').map(Number);
    const pad = (value: number) => String(value).padStart(2, '0');
    const nextYear = mon === 12 ? year + 1 : year;
    const nextMonth = mon === 12 ? 1 : mon + 1;
    return { start: `${year}-${pad(mon)}-01`, next: `${nextYear}-${pad(nextMonth)}-01` };
}

export async function getPayoutHistory(query: PayoutHistoryQuery): Promise<{ rows: PayoutHistoryRow[]; total: number }> {
    let request = supabase
        .from('payouts')
        .select(
            'id, status, amount, paid_at, payment_method, payment_reference, historical_confidence, consignor:consignors(name, business_name, consignor_number)',
            { count: 'exact' },
        )
        .in('status', query.status === 'all' ? ['paid', 'voided'] : [query.status])
        .order('paid_at', { ascending: false });

    if (query.month) {
        // Matches the server's paid_in_month rule: COALESCE(payment_date, paid_at date).
        const { start, next } = monthBounds(query.month);
        request = request.or(
            `and(payment_date.gte.${start},payment_date.lt.${next}),` +
            `and(payment_date.is.null,paid_at.gte.${start},paid_at.lt.${next})`,
        );
    }

    const from = query.page * query.pageSize;
    const { data, error, count } = await request.range(from, from + query.pageSize - 1);
    if (error) throw new Error(rpcError(error, 'Failed to load payout history'));
    return { rows: (data || []) as unknown as PayoutHistoryRow[], total: count ?? 0 };
}

export async function getVendorSaleEarnings(consignorId: string): Promise<Map<string, number>> {
    const { data, error } = await supabase.rpc('get_vendor_sale_earnings', { p_consignor_id: consignorId });
    if (error) throw new Error(rpcError(error, 'Failed to load sale earnings'));
    const earnings = new Map<string, number>();
    for (const entry of (data || []) as unknown as Array<{ sale_item_id: string; vendor_earnings: number }>) {
        earnings.set(entry.sale_item_id, Number(entry.vendor_earnings));
    }
    return earnings;
}

export async function sendPayoutStatement(payoutId: string): Promise<'sent' | 'failed' | 'no_email'> {
    try {
        const { data, error } = await supabase.functions.invoke('send-payout-statement', { body: { payoutId } });
        if (error || !data) return 'failed';
        const status = (data as { status?: string }).status;
        return status === 'sent' || status === 'no_email' ? status : 'failed';
    } catch {
        return 'failed';
    }
}

export type MarkPaidEmailOutcome = 'sent' | 'failed' | 'skipped' | 'no_email';

/** Finalizes the payout, then optionally emails the statement. Only a finalize error throws. */
export async function markPayoutPaid(
    input: FinalizePayoutInput & { sendEmail: boolean },
): Promise<{ email: MarkPaidEmailOutcome }> {
    const { sendEmail, ...finalize } = input;
    await finalizePayout(finalize);
    if (!sendEmail) return { email: 'skipped' };
    return { email: await sendPayoutStatement(finalize.payoutId) };
}

export async function downloadReconciliationCsv(): Promise<void> {
    const report = await getPayoutReconciliationReport();
    const lines = [
        ['Payout ID', 'Vendor', 'Paid at', 'Amount', 'Explanation'],
        ...report.unresolved.map((row) => [
            String(row.payout_id || ''),
            String(row.vendor_name || ''),
            String(row.paid_at || ''),
            String(row.amount || ''),
            String(row.explanation || ''),
        ]),
    ];
    const csv = lines.map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `payout-reconciliation-${localDateString(new Date())}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

export async function getDefaultThreshold(): Promise<number> {
    const { data, error } = await supabase
        .from('payout_settings')
        .select('default_threshold')
        .eq('singleton', true)
        .single();
    if (error) throw new Error(rpcError(error, 'Failed to load the default payout threshold'));
    return Number(data.default_threshold);
}

export async function updateDefaultThreshold(amount: number): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
        .from('payout_settings')
        .update({
            default_threshold: amount,
            updated_at: new Date().toISOString(),
            updated_by: auth.user?.id ?? null,
        })
        .eq('singleton', true);
    if (error) throw new Error(rpcError(error, 'Failed to update the default payout threshold'));
}

export async function updateVendorThreshold(consignorId: string, amount: number | null): Promise<void> {
    const { error } = await supabase
        .from('consignors')
        .update({ payout_threshold_override: amount })
        .eq('id', consignorId);
    if (error) throw new Error(rpcError(error, 'Failed to update the vendor payout threshold'));
}

export function usePayoutRun(through: string) {
    const [loaded, setLoaded] = useState<{ through: string; data: PayoutRunData } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const latestRequest = useRef(0);

    const refetch = useCallback(async () => {
        // A slow reply for an older date must never overwrite a newer one.
        const request = ++latestRequest.current;
        setIsLoading(true);
        setError(null);
        try {
            const next = await getPayoutRun(through);
            if (request === latestRequest.current) setLoaded({ through, data: next });
        } catch (err) {
            if (request === latestRequest.current) {
                setError(err instanceof Error ? err.message : 'Failed to load the payout run');
            }
        } finally {
            if (request === latestRequest.current) setIsLoading(false);
        }
    }, [through]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    // Figures for a different date are never shown under this one.
    const data = loaded?.through === through ? loaded.data : null;
    return { data, isLoading, error, refetch };
}
