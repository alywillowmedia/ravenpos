import { describe, expect, it } from 'vitest';
import { changedFields } from '../../src/lib/changedFields';

describe('changedFields', () => {
    const initial = { email: 'old@example.test', notes: '', commission_split: 0.6, is_active: true };

    it('returns nothing when nothing changed', () => {
        expect(changedFields(initial, { ...initial })).toEqual({});
    });

    it('returns only the edited field, so a notes save leaves the email alone', () => {
        expect(changedFields(initial, { ...initial, notes: 'Called Tuesday' })).toEqual({ notes: 'Called Tuesday' });
    });

    it('keeps a field cleared to an empty or false value', () => {
        expect(changedFields(initial, { ...initial, email: '', is_active: false })).toEqual({ email: '', is_active: false });
    });
});
