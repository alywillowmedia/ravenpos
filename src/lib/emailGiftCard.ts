import { supabase } from './supabase';

export interface GiftCardEmailPayload {
    code: string;
    amount: number;
    toName?: string | null;
    toEmail: string;
    fromName?: string | null;
    message?: string | null;
}

export interface SendGiftCardEmailResult {
    success: boolean;
    error?: string;
}

export async function sendGiftCardEmail(
    payload: GiftCardEmailPayload
): Promise<SendGiftCardEmailResult> {
    try {
        const response = await supabase.functions.invoke('send-gift-card-email', {
            body: payload,
        });

        if (response.error) {
            return {
                success: false,
                error: response.error.message || 'Failed to send gift card email',
            };
        }

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown email error';
        return { success: false, error: message };
    }
}
