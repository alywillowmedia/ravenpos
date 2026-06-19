import { supabase } from './supabase';
import type { OfflineCashSalePayload, OfflineCashSaleQueueEntry, OfflineSalesSyncStatus } from '../types/offline';
import { getNetCashSaleCents, fromCurrencyCents } from './cashReconciliation';

function isElectronRuntime(): boolean {
    return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

function isDuplicateKeyError(error: unknown): boolean {
    const candidate = error as { code?: string; message?: string } | null;
    if (!candidate) return false;
    return candidate.code === '23505' || candidate.message?.toLowerCase().includes('duplicate key') === true;
}

function buildSyncErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message;
    const candidate = error as { message?: string; details?: string } | null;
    if (candidate?.details) return candidate.details;
    if (candidate?.message) return candidate.message;
    return fallback;
}

export async function enqueueOfflineCashSale(payload: OfflineCashSalePayload): Promise<{ queueId: string; error: string | null }> {
    if (!isElectronRuntime()) {
        return { queueId: '', error: 'Offline cash queue is only available in Electron.' };
    }

    try {
        const result = await window.electronAPI!.enqueueOfflineSale(payload);
        return { queueId: result.queueEntry.queue_id, error: null };
    } catch (error) {
        return { queueId: '', error: buildSyncErrorMessage(error, 'Failed to save offline sale locally.') };
    }
}

export async function getOfflineSalesSyncStatus(): Promise<OfflineSalesSyncStatus> {
    if (!isElectronRuntime()) {
        return { total: 0, pending: 0, syncing: 0, failed: 0 };
    }

    try {
        return await window.electronAPI!.getOfflineSalesStatus();
    } catch {
        return { total: 0, pending: 0, syncing: 0, failed: 0 };
    }
}

export async function getOfflineUnsyncedCashNetTotal(options?: {
    dateStart?: string | null;
    dateEnd?: string | null;
}): Promise<number> {
    if (!isElectronRuntime()) {
        return 0;
    }

    try {
        const queue = await window.electronAPI!.listOfflineSales();
        const totalCents = queue
            .filter((entry) => entry.status === 'pending' || entry.status === 'syncing' || entry.status === 'failed')
            .filter((entry) => {
                const completedAt = entry.payload.sale.completed_at;
                if (options?.dateStart && completedAt < options.dateStart) return false;
                if (options?.dateEnd && completedAt > options.dateEnd) return false;
                return true;
            })
            .reduce((sum, entry) => sum + getNetCashSaleCents(entry.payload.sale), 0);

        return fromCurrencyCents(totalCents);
    } catch {
        return 0;
    }
}

async function syncSingleQueueEntry(entry: OfflineCashSaleQueueEntry): Promise<void> {
    const { sale, sale_items, inventory_adjustments } = entry.payload;

    const { error: saleCreateError } = await supabase.rpc('create_pos_sale_with_items', {
        p_sale: sale,
        p_sale_items: sale_items,
    });

    if (saleCreateError) {
        if (!isDuplicateKeyError(saleCreateError)) {
            throw saleCreateError;
        }

        // The sale may already have synced before the local queue status updated.
        // Make a retry idempotent by ensuring the item rows exist.
        const { error: saleItemsError } = await supabase
            .from('sale_items')
            .upsert(sale_items, {
                onConflict: 'id',
                ignoreDuplicates: true,
            });

        if (saleItemsError) {
            throw saleItemsError;
        }
    }

    for (const adjustment of inventory_adjustments) {
        const { data: itemData, error: itemFetchError } = await supabase
            .from('items')
            .select('id, quantity, sync_enabled, shopify_inventory_item_id')
            .eq('id', adjustment.item_id)
            .single();

        if (itemFetchError) {
            throw itemFetchError;
        }

        if (itemData.sync_enabled && itemData.shopify_inventory_item_id) {
            try {
                await supabase
                    .from('items')
                    .update({
                        last_sync_source: 'ravenpos',
                        last_synced_at: new Date().toISOString(),
                    })
                    .eq('id', adjustment.item_id);

                await supabase.functions.invoke('push-to-shopify', {
                    body: {
                        item_id: adjustment.item_id,
                        adjustment: -adjustment.quantity_sold,
                    },
                });
            } catch (shopifyError) {
                console.error('Offline sync: failed to push inventory to Shopify', adjustment.item_id, shopifyError);
            }
        }
    }
}

export async function syncOfflineCashSalesQueue(options?: { failedOnly?: boolean }): Promise<{
    synced: number;
    failed: number;
    skipped: number;
}> {
    if (!isElectronRuntime()) {
        return { synced: 0, failed: 0, skipped: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { synced: 0, failed: 0, skipped: 0 };
    }

    const queue = await window.electronAPI!.listOfflineSales();
    const candidates = queue
        .filter((entry) => (options?.failedOnly ? entry.status === 'failed' : entry.status !== 'syncing'))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of candidates) {
        if (options?.failedOnly && entry.status !== 'failed') {
            skipped += 1;
            continue;
        }

        try {
            await window.electronAPI!.updateOfflineSale(entry.queue_id, {
                status: 'syncing',
                attempt_count: entry.attempt_count + 1,
                last_attempt_at: new Date().toISOString(),
                last_error: null,
            });

            await syncSingleQueueEntry(entry);

            await window.electronAPI!.removeOfflineSale(entry.queue_id);
            synced += 1;
        } catch (error) {
            const message = buildSyncErrorMessage(error, 'Failed syncing offline cash sale.');
            await window.electronAPI!.updateOfflineSale(entry.queue_id, {
                status: 'failed',
                last_error: message,
                last_attempt_at: new Date().toISOString(),
            });
            failed += 1;
        }
    }

    return { synced, failed, skipped };
}
