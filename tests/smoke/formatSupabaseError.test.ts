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

    it('falls back when unknown', () => {
        expect(formatSupabaseError(null, 'Fallback')).toBe('Fallback');
    });
});
