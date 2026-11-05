import { describe, expect, it } from 'vitest';
import { toSplitBarSegments } from '../../src/lib/splitBar';

const part = (value: number, tone: 1 | 2 | 3 = 1) => ({ label: 'x', value, display: '', tone });

describe('toSplitBarSegments', () => {
    it('gives each part its share of the whole', () => {
        expect(toSplitBarSegments([part(75), part(25, 2)]).map((segment) => segment.share)).toEqual([75, 25]);
    });

    it('returns nothing when every part is zero', () => {
        expect(toSplitBarSegments([part(0), part(0, 2)])).toEqual([]);
    });

    it('leaves out negative parts', () => {
        expect(toSplitBarSegments([part(50), part(-10, 2)]).map((segment) => segment.share)).toEqual([100]);
    });

    it('leaves out parts that are not numbers', () => {
        expect(toSplitBarSegments([part(Number.NaN), part(10, 2)]).map((segment) => segment.share)).toEqual([100]);
    });
});
