import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useCategories } from '../hooks/useCategories';
import { supabase } from '../lib/supabase';

type Notice = {
    type: 'success' | 'error';
    message: string;
} | null;

function decimalRateToPercent(rate: number): string {
    return (rate * 100).toFixed(3).replace(/\.?0+$/, '');
}

function parsePercentInput(value: string): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0 || parsed > 100) return null;
    return parsed;
}

export function CategoryTaxSettings() {
    const { categories, isLoading, error, fetchCategories } = useCategories();

    const [taxInputs, setTaxInputs] = useState<Record<string, string>>({});
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryTaxPercent, setNewCategoryTaxPercent] = useState('5.3');
    const [isAdding, setIsAdding] = useState(false);
    const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);

    const categoryNamesLower = useMemo(
        () => new Set(categories.map((c) => c.name.trim().toLowerCase())),
        [categories]
    );

    useEffect(() => {
        const nextInputs: Record<string, string> = {};
        categories.forEach((category) => {
            nextInputs[category.id] = decimalRateToPercent(category.tax_rate);
        });
        setTaxInputs(nextInputs);
    }, [categories]);

    const handleAddCategory = async (event: FormEvent) => {
        event.preventDefault();
        setNotice(null);

        const name = newCategoryName.trim();
        if (!name) {
            setNotice({ type: 'error', message: 'Category name is required.' });
            return;
        }
        if (categoryNamesLower.has(name.toLowerCase())) {
            setNotice({ type: 'error', message: 'A category with that name already exists.' });
            return;
        }

        const taxPercent = parsePercentInput(newCategoryTaxPercent.trim());
        if (taxPercent === null) {
            setNotice({ type: 'error', message: 'Tax rate must be a number from 0 to 100.' });
            return;
        }

        try {
            setIsAdding(true);
            const { error: insertError } = await supabase.from('categories').insert({
                name,
                tax_rate: taxPercent / 100,
            });

            if (insertError) throw insertError;

            setNewCategoryName('');
            setNewCategoryTaxPercent('5.3');
            setNotice({ type: 'success', message: `Added category "${name}".` });
            await fetchCategories();
        } catch (err) {
            setNotice({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to add category.',
            });
        } finally {
            setIsAdding(false);
        }
    };

    const handleSaveTaxRate = async (categoryId: string) => {
        setNotice(null);

        const rawValue = (taxInputs[categoryId] ?? '').trim();
        const taxPercent = parsePercentInput(rawValue);
        if (taxPercent === null) {
            setNotice({ type: 'error', message: 'Tax rate must be a number from 0 to 100.' });
            return;
        }

        try {
            setSavingCategoryId(categoryId);
            const { error: updateError } = await supabase
                .from('categories')
                .update({ tax_rate: taxPercent / 100 })
                .eq('id', categoryId);

            if (updateError) throw updateError;

            setNotice({ type: 'success', message: 'Tax rate updated.' });
            await fetchCategories();
        } catch (err) {
            setNotice({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to update tax rate.',
            });
        } finally {
            setSavingCategoryId(null);
        }
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Category Tax Settings"
                description="Add item categories and set sales tax rates by category."
            />

            {notice && (
                <div
                    className={`mb-4 rounded-lg p-3 ${notice.type === 'error'
                        ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        }`}
                >
                    {notice.message}
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]">
                    {error}
                </div>
            )}

            <div className="space-y-6">
                <Card variant="outlined">
                    <CardContent>
                        <h2 className="mb-4 text-lg font-semibold text-[var(--color-foreground)]">
                            Add Category
                        </h2>
                        <form
                            className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
                            onSubmit={handleAddCategory}
                        >
                            <Input
                                label="Category Name"
                                placeholder="e.g. Home Decor"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                required
                            />
                            <Input
                                label="Tax Rate (%)"
                                inputMode="decimal"
                                placeholder="5.3"
                                value={newCategoryTaxPercent}
                                onChange={(e) => setNewCategoryTaxPercent(e.target.value)}
                                required
                            />
                            <div className="flex items-end">
                                <Button type="submit" className="w-full sm:w-auto" isLoading={isAdding}>
                                    Add Category
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <Card variant="outlined" padding="none">
                    <div className="border-b border-[var(--color-border)] px-5 py-4">
                        <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
                            Existing Categories
                        </h2>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <LoadingSpinner size={28} />
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="px-5 py-8 text-sm text-[var(--color-muted)]">
                            No categories found.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Category
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Tax Rate (%)
                                        </th>
                                        <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map((category) => (
                                        <tr
                                            key={category.id}
                                            className="border-b border-[var(--color-border)] last:border-b-0"
                                        >
                                            <td className="px-5 py-3 text-sm font-medium text-[var(--color-foreground)]">
                                                {category.name}
                                            </td>
                                            <td className="px-5 py-3">
                                                <Input
                                                    inputSize="sm"
                                                    inputMode="decimal"
                                                    value={taxInputs[category.id] ?? ''}
                                                    onChange={(e) =>
                                                        setTaxInputs((prev) => ({
                                                            ...prev,
                                                            [category.id]: e.target.value,
                                                        }))
                                                    }
                                                    aria-label={`${category.name} tax rate`}
                                                />
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveTaxRate(category.id)}
                                                    isLoading={savingCategoryId === category.id}
                                                >
                                                    Save
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
