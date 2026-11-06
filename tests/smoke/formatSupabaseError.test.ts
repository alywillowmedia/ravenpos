import { describe, expect, it } from 'vitest';
import { formatSupabaseError } from '../../src/lib/supabaseError';

describe('formatSupabaseError smoke', () => {
    it('maps duplicate SKU errors to a friendly message', () => {
        const message = formatSupabaseError(
            { code: '23505', message: 'duplicate key value violates unique constraint "items_sku_key"' },
            'Fallback'
        );
        expect(message).toBe('This SKU already exists. Please use a different SKU.');
    });

    it('does not show a browser stack trace when the network request fails', () => {
        const message = formatSupabaseError(
            {
                message: 'TypeError: Failed to fetch',
                details: 'TypeError: Failed to fetch\n    at window.fetch (<anonymous>:1:786)',
                hint: '',
                code: '',
            },
            'Fallback'
        );
        expect(message).toBe('Could not reach the server. Check the connection and try again.');
    });

    it('falls back when unknown', () => {
        expect(formatSupabaseError(null, 'Fallback')).toBe('Fallback');
    });
});
