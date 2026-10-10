import { describe, expect, it } from 'vitest';
import { fetchAllRows, SUPABASE_PAGE_SIZE } from '../../src/lib/supabasePaging';

function pagedSource(total: number) {
    const rows = Array.from({ length: total }, (_, index) => index);
    const requestedRanges: Array<[number, number]> = [];
    const createQuery = () => ({
        range: async (from: number, to: number) => {
            requestedRanges.push([from, to]);
            return { data: rows.slice(from, to + 1), error: null };
        },
    });
    return { createQuery, requestedRanges };
}

describe('fetchAllRows smoke', () => {
    it('keeps paging past the 1000-row response cap', async () => {
        const { createQuery, requestedRanges } = pagedSource(SUPABASE_PAGE_SIZE * 2 + 5);
        const rows = await fetchAllRows<number>(createQuery);

        expect(rows).toHaveLength(SUPABASE_PAGE_SIZE * 2 + 5);
        expect(rows.at(-1)).toBe(SUPABASE_PAGE_SIZE * 2 + 4);
        expect(requestedRanges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    });

    it('stops after a single short page', async () => {
        const { createQuery, requestedRanges } = pagedSource(3);
        expect(await fetchAllRows<number>(createQuery)).toEqual([0, 1, 2]);
        expect(requestedRanges).toHaveLength(1);
    });

    it('throws query errors', async () => {
        const error = new Error('boom');
        await expect(fetchAllRows(() => ({ range: async () => ({ data: null, error }) }))).rejects.toBe(error);
    });
});
