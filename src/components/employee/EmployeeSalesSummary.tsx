import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

type EmployeeSaleRecord = {
    id: string;
    completed_at: string;
    total: number;
    payment_method: 'cash' | 'card' | 'check' | string;
};

interface EmployeeSalesSummaryProps {
    employeeId: string | null;
    employeeName?: string | null;
    days?: number;
    startDate?: Date;
    endDateExclusive?: Date;
    rangeLabel?: string;
}

const DEFAULT_DAYS = 7;

function startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
}

function formatPaymentMethod(method: string) {
    if (method === 'cash') return 'Cash';
    if (method === 'check') return 'Check';
    return 'Card';
}

export function EmployeeSalesSummary({
    employeeId,
    employeeName,
    days = DEFAULT_DAYS,
    startDate,
    endDateExclusive,
    rangeLabel,
}: EmployeeSalesSummaryProps) {
    const [sales, setSales] = useState<EmployeeSaleRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const periodLabel = rangeLabel || `Last ${days} Days`;

    useEffect(() => {
        const loadSales = async () => {
            if (!employeeId) {
                setSales([]);
                setError('Missing employee identity.');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);

            const now = new Date();
            const start = startDate ? startOfDay(startDate) : startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)));
            const endExclusive = endDateExclusive || now;

            const { data, error: salesError } = await supabase
                .from('sales')
                .select('id, completed_at, total, payment_method')
                .eq('processed_by_employee', employeeId)
                .gte('completed_at', start.toISOString())
                .lt('completed_at', endExclusive.toISOString())
                .order('completed_at', { ascending: false });

            if (salesError) {
                setError(salesError.message);
                setSales([]);
                setIsLoading(false);
                return;
            }

            setSales((data || []) as EmployeeSaleRecord[]);
            setIsLoading(false);
        };

        void loadSales();
    }, [days, employeeId, endDateExclusive, startDate]);

    const totals = useMemo(() => {
        return sales.reduce(
            (acc, sale) => {
                const total = Number(sale.total || 0);
                acc.total += total;
                if (sale.payment_method === 'cash') acc.cash += total;
                if (sale.payment_method === 'card') acc.card += total;
                if (sale.payment_method === 'check') acc.check += total;
                return acc;
            },
            { total: 0, cash: 0, card: 0, check: 0 }
        );
    }, [sales]);

    const averageTicket = sales.length > 0 ? totals.total / sales.length : 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Sales</p>
                        <p className="text-2xl font-semibold mt-1">{sales.length}</p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">{periodLabel}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Total Attributed</p>
                        <p className="text-2xl font-semibold mt-1">{formatCurrency(totals.total)}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Average Ticket</p>
                        <p className="text-2xl font-semibold mt-1">{formatCurrency(averageTicket)}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Card / Cash / Check</p>
                        <p className="text-sm font-semibold mt-2">
                            {formatCurrency(totals.card)} / {formatCurrency(totals.cash)} / {formatCurrency(totals.check)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card variant="outlined">
                <CardHeader>
                    <CardTitle className="text-base">
                        {employeeName ? `${employeeName}'s` : 'My'} Attributed Sales ({periodLabel})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <LoadingSpinner size={24} />
                        </div>
                    ) : error ? (
                        <div className="rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                            {error}
                        </div>
                    ) : sales.length === 0 ? (
                        <EmptyState
                            title="No attributed sales yet"
                            description="Sales you process in POS will appear here."
                        />
                    ) : (
                        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                            {sales.map((sale) => (
                                <div
                                    key={sale.id}
                                    className="rounded-lg border border-[var(--color-border)] p-3 flex items-center justify-between gap-3"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-[var(--color-foreground)]">
                                            Receipt #{sale.id.slice(0, 8)}
                                        </p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {new Date(sale.completed_at).toLocaleString()} · {formatPaymentMethod(sale.payment_method)}
                                        </p>
                                    </div>
                                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                        {formatCurrency(Number(sale.total || 0))}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
