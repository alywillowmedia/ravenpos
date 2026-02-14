import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface MarketingFeeWithAllocations {
    id: string;
    title: string;
    description: string | null;
    amount: number;
    consignor_count: number;
    created_at: string;
    allocations: Array<{
        id: string;
        amount: number;
        deducted_payout_id: string | null;
    }>;
}

interface ActiveConsignorOption {
    id: string;
    consignor_number: string;
    name: string;
}

export function MarketingFees() {
    const [fees, setFees] = useState<MarketingFeeWithAllocations[]>([]);
    const [activeConsignors, setActiveConsignors] = useState<ActiveConsignorOption[]>([]);
    const [selectedConsignorIds, setSelectedConsignorIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        amount: '',
    });

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const [{ data: feesData, error: feesError }, { data: consignorData, error: consignorError }] = await Promise.all([
                supabase
                    .from('marketing_fees')
                    .select(`
                        id,
                        title,
                        description,
                        amount,
                        consignor_count,
                        created_at,
                        allocations:marketing_fee_allocations(
                            id,
                            amount,
                            deducted_payout_id
                        )
                    `)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('consignors')
                    .select('id, consignor_number, name')
                    .eq('is_active', true)
                    .order('consignor_number', { ascending: true }),
            ]);

            if (feesError) throw feesError;
            if (consignorError) throw consignorError;

            setFees((feesData || []) as MarketingFeeWithAllocations[]);
            const consignors = (consignorData || []) as ActiveConsignorOption[];
            setActiveConsignors(consignors);
            setSelectedConsignorIds((prev) => {
                if (prev.length === 0) {
                    return consignors.map((c) => c.id);
                }
                const valid = new Set(consignors.map((c) => c.id));
                const retained = prev.filter((id) => valid.has(id));
                return retained.length > 0 ? retained : consignors.map((c) => c.id);
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load marketing fees';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalOutstanding = useMemo(
        () => fees.reduce((sum, fee) => sum + fee.allocations.filter((a) => !a.deducted_payout_id).reduce((s, a) => s + Number(a.amount), 0), 0),
        [fees]
    );
    const activeConsignorCount = activeConsignors.length;
    const selectedCount = selectedConsignorIds.length;
    const isAllSelected = selectedCount > 0 && selectedCount === activeConsignorCount;

    const handleCreateFee = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const title = formData.title.trim();
        const description = formData.description.trim();
        const amount = Number(formData.amount);

        if (!title) {
            setError('Title is required.');
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            setError('Amount must be greater than 0.');
            return;
        }

        setIsSubmitting(true);

        try {
            if (activeConsignors.length === 0) {
                throw new Error('No active consignors found. Add active consignors before creating a marketing fee.');
            }
            if (selectedConsignorIds.length === 0) {
                throw new Error('Select at least one consignor.');
            }
            const selectedConsignors = activeConsignors.filter((c) => selectedConsignorIds.includes(c.id));
            if (selectedConsignors.length === 0) {
                throw new Error('Selected consignors are no longer active. Refresh and try again.');
            }

            const { data: fee, error: feeError } = await supabase
                .from('marketing_fees')
                .insert({
                    title,
                    description: description || null,
                    amount,
                    consignor_count: selectedConsignors.length,
                })
                .select('id')
                .single();

            if (feeError) throw feeError;

            const totalCents = Math.round(amount * 100);
            const baseCents = Math.floor(totalCents / selectedConsignors.length);
            const remainder = totalCents - (baseCents * selectedConsignors.length);

            const allocations = selectedConsignors.map((consignor, idx) => ({
                marketing_fee_id: fee.id,
                consignor_id: consignor.id,
                amount: (baseCents + (idx < remainder ? 1 : 0)) / 100,
            }));

            const { error: allocationError } = await supabase
                .from('marketing_fee_allocations')
                .insert(allocations);

            if (allocationError) throw allocationError;

            setFormData({ title: '', description: '', amount: '' });
            await fetchData();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create marketing fee';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fadeIn space-y-6">
            <Header
                title="Marketing Fees"
                description="Add marketing costs and spread them evenly across active consignors."
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Active Consignors</p>
                        <p className="text-2xl font-bold">{activeConsignorCount}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Outstanding Marketing Deductions</p>
                        <p className="text-2xl font-bold text-[var(--color-warning)]">{formatCurrency(totalOutstanding)}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Total Campaign Fees</p>
                        <p className="text-2xl font-bold">{formatCurrency(fees.reduce((sum, fee) => sum + Number(fee.amount), 0))}</p>
                    </CardContent>
                </Card>
            </div>

            <Card variant="outlined">
                <CardContent className="p-4">
                    <form onSubmit={handleCreateFee} className="space-y-4">
                        {error && (
                            <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                                {error}
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Title"
                                value={formData.title}
                                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Magazine ad"
                                required
                            />
                            <Input
                                label="Cost"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                                placeholder="20.00"
                                required
                            />
                        </div>
                        <Textarea
                            label="Short Description"
                            value={formData.description}
                            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Monthly local magazine placement"
                            rows={2}
                        />
                        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Consignors to Charge</p>
                                <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={(e) =>
                                            setSelectedConsignorIds(e.target.checked ? activeConsignors.map((c) => c.id) : [])
                                        }
                                        className="h-4 w-4 rounded border-[var(--color-border)]"
                                    />
                                    Select All
                                </label>
                            </div>
                            {activeConsignors.length === 0 ? (
                                <p className="text-sm text-[var(--color-muted)]">No active consignors available.</p>
                            ) : (
                                <div className="max-h-40 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {activeConsignors.map((consignor) => (
                                        <label
                                            key={consignor.id}
                                            className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded border border-[var(--color-border)]"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedConsignorIds.includes(consignor.id)}
                                                onChange={(e) => {
                                                    setSelectedConsignorIds((prev) =>
                                                        e.target.checked
                                                            ? [...prev, consignor.id]
                                                            : prev.filter((id) => id !== consignor.id)
                                                    );
                                                }}
                                                className="h-4 w-4 rounded border-[var(--color-border)]"
                                            />
                                            <span>{consignor.consignor_number} - {consignor.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-[var(--color-muted)]">
                                Estimated per-consignor deduction:{' '}
                                <span className="font-medium text-[var(--color-foreground)]">
                                    {selectedCount > 0 && Number(formData.amount) > 0
                                        ? formatCurrency(Number(formData.amount) / selectedCount)
                                        : formatCurrency(0)}
                                </span>
                            </p>
                            <Button type="submit" isLoading={isSubmitting}>
                                Add Marketing Fee
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardContent className="p-4">
                    {isLoading ? (
                        <div className="py-12 flex justify-center">
                            <LoadingSpinner size={28} />
                        </div>
                    ) : fees.length === 0 ? (
                        <EmptyState
                            title="No marketing fees yet"
                            description="Add your first fee above to distribute it across consignors."
                        />
                    ) : (
                        <div className="space-y-3">
                            {fees.map((fee) => {
                                const paidAllocations = fee.allocations.filter((a) => !!a.deducted_payout_id);
                                const unpaidAllocations = fee.allocations.filter((a) => !a.deducted_payout_id);
                                const paidAmount = paidAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
                                const unpaidAmount = unpaidAllocations.reduce((sum, a) => sum + Number(a.amount), 0);

                                return (
                                    <div key={fee.id} className="rounded-lg border border-[var(--color-border)] p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold">{fee.title}</p>
                                                {fee.description && (
                                                    <p className="text-sm text-[var(--color-muted)]">{fee.description}</p>
                                                )}
                                                <p className="text-xs text-[var(--color-muted)] mt-1">
                                                    Added {new Date(fee.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{formatCurrency(Number(fee.amount))}</p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    {fee.consignor_count} consignors
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                                            <div className="bg-[var(--color-surface)] rounded-lg p-2">
                                                <p className="text-[var(--color-muted)]">Per Consignor</p>
                                                <p className="font-medium">{formatCurrency(Number(fee.amount) / fee.consignor_count)}</p>
                                            </div>
                                            <div className="bg-[var(--color-surface)] rounded-lg p-2">
                                                <p className="text-[var(--color-muted)]">Deducted</p>
                                                <p className="font-medium text-[var(--color-success)]">{formatCurrency(paidAmount)}</p>
                                            </div>
                                            <div className="bg-[var(--color-surface)] rounded-lg p-2">
                                                <p className="text-[var(--color-muted)]">Remaining</p>
                                                <p className="font-medium text-[var(--color-warning)]">{formatCurrency(unpaidAmount)}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
