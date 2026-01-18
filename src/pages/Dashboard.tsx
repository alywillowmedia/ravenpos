import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { AnalyticsCard } from '../components/analytics/AnalyticsCard';
import { SalesTrendChart } from '../components/analytics/SalesTrendChart';
import { SalesByCategoryChart } from '../components/analytics/SalesByCategoryChart';
import { CustomerGrowthChart } from '../components/analytics/CustomerGrowthChart';
import { useConsignors } from '../hooks/useConsignors';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useAnalytics, type SalesTrendData, type SalesByCategoryData, type CustomerGrowthData } from '../hooks/useAnalytics';
import { formatCurrency } from '../lib/utils';
import type { DashboardStats } from '../types';

export function Dashboard() {
    const { consignors, isLoading: consignorsLoading } = useConsignors();
    const { items, isLoading: itemsLoading } = useInventory();
    const { getTodaysSales } = useSales();
    const { getSalesTrend, getSalesByCategory, getCustomerGrowth, isLoading: analyticsLoading } = useAnalytics();

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [salesTrend, setSalesTrend] = useState<SalesTrendData[]>([]);
    const [salesByCategory, setSalesByCategory] = useState<SalesByCategoryData[]>([]);
    const [customerGrowth, setCustomerGrowth] = useState<CustomerGrowthData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [analyticsExpanded, setAnalyticsExpanded] = useState(false);
    const [dateRange, setDateRange] = useState<string>('30');

    // Fetch dashboard stats when consignors/items finish loading
    useEffect(() => {
        const fetchStats = async () => {
            const { data: sales } = await getTodaysSales();

            setStats({
                totalConsignors: consignors.length,
                activeConsignors: consignors.filter((c) => c.is_active).length,
                totalItems: items.length,
                totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
                todaySalesCount: sales.length,
                todaySalesTotal: sales.reduce((sum, sale) => sum + Number(sale.total), 0),
            });
            setIsLoading(false);
        };

        if (!consignorsLoading && !itemsLoading) {
            fetchStats();
        }
    }, [consignors, items, consignorsLoading, itemsLoading, getTodaysSales]);

    // Fetch analytics data when expanded or date range changes
    useEffect(() => {
        if (!analyticsExpanded) return;

        let isMounted = true;
        const isHourly = dateRange === '24h';
        const days = isHourly ? 1 : Number(dateRange);

        const fetchAnalytics = async () => {
            const [trendRes, categoryRes, growthRes] = await Promise.all([
                getSalesTrend(days, isHourly),
                getSalesByCategory(),
                getCustomerGrowth(days, isHourly)
            ]);

            if (isMounted) {
                if (trendRes.data) setSalesTrend(trendRes.data);
                if (categoryRes.data) setSalesByCategory(categoryRes.data);
                if (growthRes.data) setCustomerGrowth(growthRes.data);
            }
        };

        fetchAnalytics();

        return () => {
            isMounted = false;
        };
    }, [analyticsExpanded, dateRange, getSalesTrend, getSalesByCategory, getCustomerGrowth]);

    const quickLinks = [
        { href: '/pos', label: 'Open Register', icon: RegisterIcon, color: 'bg-[var(--color-primary)]' },
        { href: '/add-items', label: 'Add Items', icon: PlusIcon, color: 'bg-emerald-500' },
        { href: '/consignors', label: 'Consignors', icon: UsersIcon, color: 'bg-violet-500' },
        { href: '/labels', label: 'Print Labels', icon: TagIcon, color: 'bg-amber-500' },
    ];

    if (isLoading || consignorsLoading || itemsLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn space-y-8">
            <Header
                title="Dashboard"
                description="Welcome to RavenPOS. Here's your store at a glance."
            />

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Active Consignors"
                    value={stats?.activeConsignors ?? 0}
                    subtext={`${stats?.totalConsignors ?? 0} total`}
                    icon={<UsersIcon />}
                />
                <StatCard
                    label="Inventory Items"
                    value={stats?.totalItems ?? 0}
                    subtext={`${stats?.totalQuantity ?? 0} total qty`}
                    icon={<PackageIcon />}
                />
                <StatCard
                    label="Today's Sales"
                    value={stats?.todaySalesCount ?? 0}
                    subtext="transactions"
                    icon={<ReceiptIcon />}
                />
                <StatCard
                    label="Today's Revenue"
                    value={formatCurrency(stats?.todaySalesTotal ?? 0)}
                    subtext="total sales"
                    icon={<DollarIcon />}
                    highlight
                />
            </div>

            {/* Analytics Section */}
            <div>
                <button
                    onClick={() => setAnalyticsExpanded(!analyticsExpanded)}
                    className="flex items-center gap-2 text-lg font-semibold text-[var(--color-foreground)] mb-4 hover:text-[var(--color-primary)] transition-colors"
                >
                    <ChevronIcon expanded={analyticsExpanded} />
                    Analytics
                </button>
                {analyticsExpanded && (
                    <>
                        <div className="flex justify-end mb-4">
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value)}
                                className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            >
                                <option value="24h">Last 24 hours</option>
                                <option value="7">Last 7 days</option>
                                <option value="14">Last 14 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="60">Last 60 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            <AnalyticsCard title={`Sales Trend (${dateRange === '24h' ? 'Last 24 Hours' : `Last ${dateRange} Days`})`} className="col-span-1 lg:col-span-2">
                                {analyticsLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <LoadingSpinner />
                                    </div>
                                ) : (
                                    <SalesTrendChart data={salesTrend} />
                                )}
                            </AnalyticsCard>
                            <AnalyticsCard title="Sales by Category" className="col-span-1">
                                {analyticsLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <LoadingSpinner />
                                    </div>
                                ) : (
                                    <SalesByCategoryChart data={salesByCategory} />
                                )}
                            </AnalyticsCard>
                            <AnalyticsCard title="Customer Growth" className="col-span-1 lg:col-span-3">
                                {analyticsLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <LoadingSpinner />
                                    </div>
                                ) : (
                                    <CustomerGrowthChart data={customerGrowth} />
                                )}
                            </AnalyticsCard>
                        </div>
                    </>
                )}
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-4">
                    Quick Actions
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {quickLinks.map((link) => (
                        <Link key={link.href} to={link.href}>
                            <Card
                                variant="outlined"
                                className="group hover:border-[var(--color-primary)] hover:shadow-md transition-all cursor-pointer"
                            >
                                <CardContent className="flex flex-col items-center py-6 text-center">
                                    <div
                                        className={`w-12 h-12 rounded-xl ${link.color} flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform`}
                                    >
                                        <link.icon />
                                    </div>
                                    <span className="font-medium text-[var(--color-foreground)]">
                                        {link.label}
                                    </span>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Recent Activity Placeholder */}
            <div>
                <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-4">
                    Getting Started
                </h2>
                <Card variant="outlined">
                    <CardContent>
                        <ol className="space-y-3 text-sm text-[var(--color-muted)]">
                            <li className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-medium">
                                    1
                                </span>
                                <span>
                                    <strong className="text-[var(--color-foreground)]">Add consignors</strong> — Register your vendors with their contact info and commission splits.
                                </span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-medium">
                                    2
                                </span>
                                <span>
                                    <strong className="text-[var(--color-foreground)]">Add inventory</strong> — Enter items individually, in batch, or import from CSV.
                                </span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-medium">
                                    3
                                </span>
                                <span>
                                    <strong className="text-[var(--color-foreground)]">Print labels</strong> — Generate barcode labels for your items.
                                </span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-medium">
                                    4
                                </span>
                                <span>
                                    <strong className="text-[var(--color-foreground)]">Start selling</strong> — Open the register and scan items to complete sales.
                                </span>
                            </li>
                        </ol>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    icon: React.ReactNode;
    highlight?: boolean;
}

function StatCard({ label, value, subtext, icon, highlight }: StatCardProps) {
    return (
        <Card variant="elevated" className={highlight ? 'ring-2 ring-[var(--color-primary)]/20' : ''}>
            <CardContent>
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm text-[var(--color-muted)]">{label}</p>
                        <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'}`}>
                            {value}
                        </p>
                        {subtext && (
                            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{subtext}</p>
                        )}
                    </div>
                    <div className="text-[var(--color-muted-foreground)]">{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}

// Icons
function RegisterIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function UsersIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

function TagIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
        </svg>
    );
}

function PackageIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
        </svg>
    );
}

function ReceiptIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 17.5v-11" />
        </svg>
    );
}

function DollarIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    );
}
