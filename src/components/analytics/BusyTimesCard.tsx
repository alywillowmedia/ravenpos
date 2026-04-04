import { formatCurrency } from '../../lib/utils';
import type { BusyTimeAnalyticsData } from '../../hooks/useAnalytics';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface BusyTimesCardProps {
    data: BusyTimeAnalyticsData | null;
}

function topThreeByCount(items: BusyTimeAnalyticsData['hourlyBreakdown']) {
    return [...items]
        .sort((a, b) => b.count - a.count || b.amount - a.amount)
        .slice(0, 3);
}

export function BusyTimesCard({ data }: BusyTimesCardProps) {
    if (!data) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--color-muted)]">
                <p>No sales data available</p>
            </div>
        );
    }

    const hasAnySales = data.hourlyBreakdown.some((bucket) => bucket.count > 0);
    if (!hasAnySales) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--color-muted)]">
                <p>No sales data available</p>
            </div>
        );
    }

    const topHours = topThreeByCount(data.hourlyBreakdown);
    const topWeekdays = topThreeByCount(data.weekdayBreakdown);

    return (
        <div className="h-full flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Busiest Hour</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--color-foreground)]">{data.busiestHour?.label ?? 'N/A'}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                        {data.busiestHour ? `${data.busiestHour.count} sales · ${formatCurrency(data.busiestHour.amount)}` : 'No sales in range'}
                    </p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Busiest Day</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--color-foreground)]">{data.busiestWeekday?.label ?? 'N/A'}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                        {data.busiestWeekday ? `${data.busiestWeekday.count} sales · ${formatCurrency(data.busiestWeekday.amount)}` : 'No sales in range'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Average Sales by Hour</p>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.hourlyBreakdown}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                <XAxis
                                    dataKey="label"
                                    stroke="var(--color-muted-foreground)"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={2}
                                    tickMargin={6}
                                />
                                <YAxis
                                    stroke="var(--color-muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--color-background)',
                                        borderColor: 'var(--color-border)',
                                        color: 'var(--color-foreground)'
                                    }}
                                    formatter={(value, name) => {
                                        if (name === 'Avg Revenue') return formatCurrency(Number(value) || 0);
                                        return Number(value).toFixed(2);
                                    }}
                                />
                                <Bar dataKey="averageCount" name="Avg Sales" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1">
                        {topHours.map((bucket) => (
                            <p key={bucket.label} className="text-xs text-[var(--color-muted)]">
                                {bucket.label}: {bucket.count} sales ({bucket.averageCount.toFixed(2)} avg/day)
                            </p>
                        ))}
                    </div>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Average Sales by Weekday</p>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.weekdayBreakdown}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                <XAxis
                                    dataKey="label"
                                    stroke="var(--color-muted-foreground)"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={0}
                                    tickMargin={6}
                                />
                                <YAxis
                                    stroke="var(--color-muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--color-background)',
                                        borderColor: 'var(--color-border)',
                                        color: 'var(--color-foreground)'
                                    }}
                                    formatter={(value, name) => {
                                        if (name === 'Avg Revenue') return formatCurrency(Number(value) || 0);
                                        return Number(value).toFixed(2);
                                    }}
                                />
                                <Bar dataKey="averageCount" name="Avg Sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1">
                        {topWeekdays.map((bucket) => (
                            <p key={bucket.label} className="text-xs text-[var(--color-muted)]">
                                {bucket.label}: {bucket.count} sales ({bucket.averageCount.toFixed(2)} avg/{bucket.label})
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
