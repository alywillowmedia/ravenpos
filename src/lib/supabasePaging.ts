// PostgREST caps every response at 1000 rows, so larger result sets must be paged.
export const SUPABASE_PAGE_SIZE = 1000;

export type SupabasePagedQuery<T> = {
    range: (from: number, to: number) => PromiseLike<{
        data: T[] | null;
        error: unknown;
    }>;
};

// createQuery must return a freshly built, deterministically ordered query on each call.
export async function fetchAllRows<T>(createQuery: () => SupabasePagedQuery<T>): Promise<T[]> {
    const rows: T[] = [];

    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
        const to = from + SUPABASE_PAGE_SIZE - 1;
        const { data, error } = await createQuery().range(from, to);

        if (error) throw error;

        const page = data || [];
        rows.push(...page);

        if (page.length < SUPABASE_PAGE_SIZE) break;
    }

    return rows;
}
