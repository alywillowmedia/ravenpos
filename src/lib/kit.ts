import { supabase } from './supabase';

interface SyncCustomerKitPayload {
    customerId: string;
    email: string | null;
    name: string;
    acceptsMarketing: boolean;
}

export async function syncCustomerKitSubscriber(payload: SyncCustomerKitPayload): Promise<string | null> {
    if (!payload.email?.trim()) {
        return null;
    }

    try {
        const response = await supabase.functions.invoke('sync-kit-subscriber', {
            body: payload,
        });

        if (response.error) {
            return response.error.message || 'Failed to sync Kit subscriber';
        }

        return null;
    } catch (error) {
        return error instanceof Error ? error.message : 'Failed to sync Kit subscriber';
    }
}
