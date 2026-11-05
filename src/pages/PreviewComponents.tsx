import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { DetailCard } from '../components/ui/DetailCard';
import { DetailRow } from '../components/ui/DetailRow';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Money } from '../components/ui/Money';
import { Select } from '../components/ui/Select';
import { SplitBar } from '../components/ui/SplitBar';
import { Table, type Column } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import { getActiveTheme, setTheme, type ThemeMode } from '../lib/theme';

type PreviewWidth = 'narrow' | 'medium' | 'full';

interface PreviewRow {
    id: string;
    vendor: string;
    payable: string;
}

const PREVIEW_ROWS: PreviewRow[] = [
    { id: 'C-1042', vendor: 'Juniper & Moss', payable: '$720.40' },
    { id: 'C-1134', vendor: 'Field Day Finds', payable: '$267.51' },
];

const PREVIEW_COLUMNS: Column<PreviewRow>[] = [
    { key: 'vendor', header: 'Vendor' },
    { key: 'id', header: 'ID' },
    { key: 'payable', header: 'Payable' },
];

const WIDTH_CLASS: Record<PreviewWidth, string> = {
    narrow: 'max-w-md',
    medium: 'max-w-2xl',
    full: 'max-w-full',
};

export function PreviewComponents() {
    const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('full');
    const [theme, setThemeState] = useState<ThemeMode>(() => getActiveTheme());
    const [activeTab, setActiveTab] = useState('period');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleToggleTheme = () => {
        const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
        setThemeState(nextTheme);
    };

    return (
        <div className="min-h-screen bg-[var(--color-canvas)] p-4 sm:p-6 lg:p-8">
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
                            <Button variant="soft">Soft</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="success">Success</Button>
                            <Button variant="danger">Danger</Button>
                            <Button variant="dangerQuiet">Danger quiet</Button>
                            <Button disabled>Disabled</Button>
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

                <SectionHeader title="Cards" description="Surfaces, including a nested panel." />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Card variant="default">
                        <p className="mb-3 text-sm font-semibold">Default</p>
                        <Card variant="inset" padding="sm">Inset panel inside a card</Card>
                    </Card>
                    <Card variant="elevated">Elevated</Card>
                    <Card variant="outlined">Outlined</Card>
                </div>

                <SectionHeader title="Status" description="One shape everywhere: soft pill, dot, plain label." />
                <div className="flex flex-wrap gap-2">
                    <Badge dot variant="success">Ready to pay</Badge>
                    <Badge dot variant="info">Draft</Badge>
                    <Badge dot variant="warning">Needs review</Badge>
                    <Badge dot variant="default">Accruing</Badge>
                    <Badge dot variant="danger">Voided</Badge>
                    <Badge variant="secondary">No dot</Badge>
                    <Badge size="sm" variant="success">Small</Badge>
                </div>

                <SectionHeader title="Tabs" description="Segmented control." />
                <Tabs
                    className="max-w-md"
                    activeTab={activeTab}
                    onChange={setActiveTab}
                    tabs={[{ id: 'period', label: 'This period' }, { id: 'history', label: 'History' }, { id: 'setup', label: 'Tax setup' }]}
                />

                <SectionHeader title="Form controls" description="Default, error and disabled states." />
                <Card>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Input label="Check number" placeholder="e.g. 1042" />
                        <Input label="Amount" defaultValue="abc" error="Enter a number" />
                        <Input label="Locked" defaultValue="Not editable" disabled />
                        <Select label="Payment method" options={[{ value: 'check', label: 'Check' }, { value: 'cash', label: 'Cash' }]} />
                    </div>
                </Card>

                <SectionHeader title="Tables" description="Standalone, and flat inside a card." />
                <Table data={PREVIEW_ROWS} columns={PREVIEW_COLUMNS} keyExtractor={(row) => row.id} ariaLabel="Standalone table" />
                <Card>
                    <Table flat data={PREVIEW_ROWS} columns={PREVIEW_COLUMNS} keyExtractor={(row) => row.id} ariaLabel="Flat table" />
                </Card>

                <SectionHeader title="Dialog" description="Shared modal shell." />
                <Button variant="secondary" onClick={() => setIsModalOpen(true)}>Open modal</Button>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Discard this draft?" description="This can't be undone." size="sm">
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button variant="danger" onClick={() => setIsModalOpen(false)}>Discard</Button>
                    </div>
                </Modal>

                <SectionHeader title="Money and breakdowns" description="Headline figures and the one thin bar a page may use." />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <StatCard label="Positive" value={<Money amount={6325.45} />} subtext="+4.1% vs Oct 4 – 17, $6,078.20" />
                    <StatCard label="Refund" value={<Money amount={-22} />} subtext="Negative amounts keep their sign" />
                    <StatCard label="Zero" value={<Money amount={0} />} subtext="Nothing yet" />
                </div>
                <Card>
                    <SplitBar
                        label="Total cost this period"
                        parts={[
                            { label: 'Net pay', value: 5352.92, display: '78.4%', tone: 1 },
                            { label: 'Withholding', value: 972.53, display: '14.2%', tone: 2 },
                            { label: 'Employer taxes', value: 502.65, display: '7.4%', tone: 3 },
                        ]}
                    />
                </Card>
                <Card>
                    <SplitBar
                        label="Empty period"
                        parts={[
                            { label: 'Net pay', value: 0, display: '$0.00', tone: 1 },
                            { label: 'Withholding', value: 0, display: '$0.00', tone: 2 },
                        ]}
                    />
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
