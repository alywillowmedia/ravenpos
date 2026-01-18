import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { CustomerGrowthData } from '../../hooks/useAnalytics';

interface CustomerGrowthChartProps {
    data: CustomerGrowthData[];
}

export function CustomerGrowthChart({ data }: CustomerGrowthChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--color-muted)]">
                <p>No customer data available</p>
            </div>
        );
    }

    const hasGrowth = data.some(d => d.cumulative > 0 || d.count > 0);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tickMargin={8}
                />
                <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={hasGrowth ? ['auto', 'auto'] : [0, 5]}
                    allowDecimals={false}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-foreground)'
                    }}
                />
                <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Total Customers"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                />
                <Line
                    type="monotone"
                    dataKey="count"
                    name="New Customers"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
