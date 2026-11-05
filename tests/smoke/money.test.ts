import { describe, expect, it } from 'vitest';
import { splitMoney } from '../../src/lib/money';

describe('splitMoney', () => {
    it('splits thousands and cents', () => {
        expect(splitMoney(1284.5)).toEqual({ whole: '$1,284', cents: '.50' });
    });

    it('handles zero', () => {
        expect(splitMoney(0)).toEqual({ whole: '$0', cents: '.00' });
    });

    it('keeps the sign on refunds', () => {
        expect(splitMoney(-22)).toEqual({ whole: '-$22', cents: '.00' });
    });

    it('never shows NaN while data loads', () => {
        expect(splitMoney(Number.NaN)).toEqual({ whole: '$0', cents: '.00' });
    });
});
