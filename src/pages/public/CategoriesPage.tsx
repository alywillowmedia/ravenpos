import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export function CategoriesPage() {
    const [categories, setCategories] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const { data, error: fetchError } = await supabase
                    .from('categories')
                    .select('name')
                    .order('name', { ascending: true });

                if (fetchError) throw fetchError;

                const names = (data || []).map((row) => row.name).filter(Boolean);
                setCategories(names);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load categories');
            } finally {
                setIsLoading(false);
            }
        };

        void fetchCategories();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
            <div className="mb-10">
                <p className="ravenlia-eyebrow mb-2">Browse</p>
                <h1 className="text-4xl text-[var(--color-foreground)]">Categories</h1>
                <p className="text-[var(--color-muted)] mt-2">Browse every category in the marketplace.</p>
            </div>

            {error ? (
                <div className="text-center py-16 text-[var(--color-error)]">{error}</div>
            ) : categories.length === 0 ? (
                <div className="text-center py-16 text-[var(--color-muted)]">No categories available.</div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {categories.map((category) => (
                        <Link
                            key={category}
                            to={`/shop/category/${encodeURIComponent(category)}`}
                            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-5 py-7 text-center text-[var(--color-foreground)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-foreground)] hover:shadow-[var(--shadow-gallery)]"
                        >
                            {category}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
