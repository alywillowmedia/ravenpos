import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatCurrency } from '../../lib/utils';
import type { SalesTrendData } from '../../hooks/useAnalytics';

interface SalesTrendChartProps {
    data: SalesTrendData[];
    /** 'area' is the dashboard default. 'line' is one thin line with no fill. */
    variant?: 'area' | 'line';
    /** Tooltip label for the value; defaults to Sales. */
    valueLabel?: string;
}

export function SalesTrendChart({ data, variant = 'area', valueLabel = 'Sales' }: SalesTrendChartProps) {
    const hasData = data && data.length > 0 && data.some(d => d.amount > 0);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--color-muted)]">
                <p>No sales data available</p>
            </div>
        );
    }

    if (variant === 'line') {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--color-muted-foreground)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={32}
                        tickMargin={8}
                    />
                    <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        tickFormatter={(value) => `$${value}`}
                        domain={hasData ? [0, 'auto'] : [0, 100]}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'var(--color-background)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-foreground)'
                        }}
                        formatter={(value) => [formatCurrency(Number(value) || 0), valueLabel]}
                    />
                    <Line
                        type="linear"
                        dataKey="amount"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                </defs>
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
                    tickFormatter={(value) => `$${value}`}
                    domain={hasData ? ['auto', 'auto'] : [0, 100]}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-foreground)'
                    }}
                    formatter={(value) => [formatCurrency(Number(value) || 0), valueLabel]}
                />
                <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--color-primary)"
                    fillOpacity={1}
                    fill="url(#colorAmount)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
