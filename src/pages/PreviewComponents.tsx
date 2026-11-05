import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { DetailCard } from '../components/ui/DetailCard';
import { DetailRow } from '../components/ui/DetailRow';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { getActiveTheme, setTheme, type ThemeMode } from '../lib/theme';

type PreviewWidth = 'narrow' | 'medium' | 'full';

const WIDTH_CLASS: Record<PreviewWidth, string> = {
    narrow: 'max-w-md',
    medium: 'max-w-2xl',
    full: 'max-w-full',
};

export function PreviewComponents() {
    const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('full');
    const [theme, setThemeState] = useState<ThemeMode>(() => getActiveTheme());

    const handleToggleTheme = () => {
        const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
        setThemeState(nextTheme);
    };

    return (
        <div className="min-h-screen bg-[var(--color-background)] p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-8">
                <Header
                    title="Component Preview"
                    description="Live sandbox for reusable RavenPOS components."
                    actions={(
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleToggleTheme}
                                leftIcon={theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                            >
                                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                            </Button>
                            <Button
                                size="sm"
                                variant={previewWidth === 'narrow' ? 'primary' : 'secondary'}
                                onClick={() => setPreviewWidth('narrow')}
                            >
                                Narrow
                            </Button>
                            <Button
                                size="sm"
                                variant={previewWidth === 'medium' ? 'primary' : 'secondary'}
                                onClick={() => setPreviewWidth('medium')}
                            >
                                Medium
                            </Button>
                            <Button
                                size="sm"
                                variant={previewWidth === 'full' ? 'primary' : 'secondary'}
                                onClick={() => setPreviewWidth('full')}
                            >
                                Full
                            </Button>
                        </div>
                    )}
                />

                <SectionHeader
                    title="Analytical Cards"
                    description="Adaptive cards for KPIs and quick stats."
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Today's Revenue"
                        value="$2,847.32"
                        subtext="36 transactions"
                    />
                    <StatCard
                        label="Pending Payouts"
                        value="$1,325.10"
                        subtext="11 consignors"
                    />
                    <StatCard
                        label="Items Sold"
                        value="94"
                        subtext="Last 24 hours"
                    />
                    <StatCard
                        label="Avg Ticket"
                        value="$79.09"
                        subtext="Rolling 30 days"
                    />
                </div>

                <SectionHeader
                    title="Detail Rows"
                    description="One-line adaptive rows for lists, receipts, and payout details."
                />
                <Card variant="outlined">
                    <CardContent className={`mx-auto w-full ${WIDTH_CLASS[previewWidth]}`}>
                        <DetailRow
                            label="Vendor"
                            value="ALY-032 • Aly's Vintage"
                            description="Last payout: Mar 31, 2026"
                        />
                        <DetailRow
                            label="Gross Sales"
                            value="$582.00"
                            rightMeta="7 items"
                        />
                        <DetailRow
                            label="Store Share"
                            value="$174.60"
                            tone="info"
                            description="30% commission"
                        />
                        <DetailRow
                            label="Amount Due"
                            value="$407.40"
                            tone="success"
                            leftMeta="Includes card fees"
                            rightMeta={<Badge variant="success">Ready</Badge>}
                        />
                    </CardContent>
                </Card>

                <SectionHeader
                    title="Detail Cards"
                    description="Reusable card containers for payout/sales/customer summaries."
                />
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <DetailCard
                        title="Payout Summary"
                        subtitle="Current cycle totals"
                        actions={<Button size="sm">Mark Paid</Button>}
                        items={[
                            { label: 'Gross Sales', value: '$1,980.00' },
                            { label: 'Tax Collected', value: '$156.40' },
                            { label: 'Store Share', value: '$594.00', tone: 'info' },
                            { label: 'Amount Due', value: '$1,230.60', tone: 'success' },
                        ]}
                    />
                    <DetailCard title="Recent Sale #RV-10394" subtitle="Apr 8, 2026 at 4:32 PM">
                        <div className={`w-full ${WIDTH_CLASS[previewWidth]}`}>
                            <DetailRow label="Customer" value="Walk-in" />
                            <DetailRow label="Payment" value="Card" />
                            <DetailRow label="Discount" value="-$8.00" tone="warning" />
                            <DetailRow label="Total" value="$82.00" tone="success" />
                        </div>
                    </DetailCard>
                </div>

                <SectionHeader title="Buttons" description="Shared action buttons with common variants and sizes." />
                <Card variant="outlined">
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Button variant="primary">Primary</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="success">Success</Button>
                            <Button variant="danger">Danger</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm">Small</Button>
                            <Button size="md">Medium</Button>
                            <Button size="lg">Large</Button>
                            <Button size="xl">XL</Button>
                            <Button isLoading>Loading</Button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Button fullWidth>Adaptive Full Width</Button>
                            <Button fullWidth variant="secondary">Secondary Full Width</Button>
                            <Button fullWidth variant="ghost">Ghost Full Width</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a7.5 7.5 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
    );
}
