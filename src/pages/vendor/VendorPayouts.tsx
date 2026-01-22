import { useState, useEffect } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import type { Payout, Consignor } from '../../types';

interface SaleItemForPayout {
    id: string;
    sale_id: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    commission_split: number;
    completed_at: string;
    payment_method: 'cash' | 'card';
    sale_subtotal: number;
}

// Stripe Terminal fee constants (2.7% + $0.05 per transaction)
const STRIPE_FEE_PERCENT = 0.027;
const STRIPE_FEE_FIXED = 0.05;

export function VendorPayouts() {
    const { userRecord } = useAuth();
    const [consignor, setConsignor] = useState<Consignor | null>(null);
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [pendingSales, setPendingSales] = useState<SaleItemForPayout[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!userRecord?.consignor_id) return;

            // Fetch consignor info
            const { data: consignorData } = await supabase
                .from('consignors')
                .select('*')
                .eq('id', userRecord.consignor_id)
                .single();

            setConsignor(consignorData);

            // Fetch payout history
            const { data: payoutData } = await supabase
                .from('payouts')
                .select('*')
                .eq('consignor_id', userRecord.consignor_id)
                .order('paid_at', { ascending: false });

            setPayouts(payoutData || []);

            // Get last payout date
            const lastPayout = payoutData?.[0];
            const lastPayoutDate = lastPayout ? new Date(lastPayout.paid_at) : new Date(0);

            // Fetch sales since last payout (including payment_method for fee calc)
            const { data: saleItems } = await supabase
                .from('sale_items')
                .select('id, sale_id, name, sku, price, quantity, commission_split, sales!inner(completed_at, payment_method, subtotal)')
                .eq('consignor_id', userRecord.consignor_id);

            // Filter to items since last payout
            const pendingItems = (saleItems || [])
                .map((item) => {
                    const salesData = item.sales as unknown;
                    let completedAt = '';
                    let paymentMethod: 'cash' | 'card' = 'cash';
                    let saleSubtotal = Number(item.price) * item.quantity;
                    if (Array.isArray(salesData) && salesData.length > 0) {
                        const sale = salesData[0] as { completed_at: string; payment_method: string; subtotal: number };
                        completedAt = sale.completed_at;
                        paymentMethod = sale.payment_method as 'cash' | 'card';
                        saleSubtotal = sale.subtotal || saleSubtotal;
                    } else if (salesData && typeof salesData === 'object' && 'completed_at' in salesData) {
                        const sale = salesData as { completed_at: string; payment_method: string; subtotal: number };
                        completedAt = sale.completed_at;
                        paymentMethod = sale.payment_method as 'cash' | 'card';
                        saleSubtotal = sale.subtotal || saleSubtotal;
                    }
                    return {
                        id: item.id,
                        sale_id: item.sale_id,
                        name: item.name,
                        sku: item.sku,
                        price: Number(item.price),
                        quantity: item.quantity,
                        commission_split: Number(item.commission_split),
                        completed_at: completedAt,
                        payment_method: paymentMethod,
                        sale_subtotal: saleSubtotal,
                    };
                })
                .filter((item) => new Date(item.completed_at) > lastPayoutDate)
                .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

            setPendingSales(pendingItems);
            setIsLoading(false);
        };

        fetchData();
    }, [userRecord?.consignor_id]);

    // Calculate pending balance with credit card fee deductions
    const calculateItemEarnings = (item: SaleItemForPayout) => {
        const lineTotal = item.price * item.quantity;
        let fee = 0;
        if (item.payment_method === 'card') {
            const totalSaleFee = (item.sale_subtotal * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED;
            fee = item.sale_subtotal > 0 ? totalSaleFee * (lineTotal / item.sale_subtotal) : 0;
        }
        return (lineTotal * item.commission_split) - fee;
    };

    const pendingBalance = pendingSales.reduce(
        (sum, item) => sum + calculateItemEarnings(item),
        0
    );

    const pendingCreditCardFees = pendingSales.reduce(
        (sum, item) => {
            if (item.payment_method === 'card') {
                const lineTotal = item.price * item.quantity;
                const totalSaleFee = (item.sale_subtotal * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED;
                return sum + (item.sale_subtotal > 0 ? totalSaleFee * (lineTotal / item.sale_subtotal) : 0);
            }
            return sum;
        },
        0
    );

    const pendingGrossSales = pendingSales.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    const pendingItemCount = pendingSales.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate total paid all time
    const totalPaidAllTime = payouts.reduce((sum, p) => sum + Number(p.amount), 0);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn">
            <Header
                title="My Payouts"
                description="View your current balance and payment history"
            />

            {/* Current Balance Section */}
            <Card variant="elevated" className="mb-6 bg-gradient-to-br from-[var(--color-success)]/10 to-transparent border-[var(--color-success)]/30">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <p className="text-sm text-[var(--color-muted)] mb-1">Current Balance</p>
                            <p className="text-4xl font-bold text-[var(--color-success)]">
                                {formatCurrency(pendingBalance)}
                            </p>
                            <p className="text-sm text-[var(--color-muted)] mt-2">
                                {pendingItemCount} items sold since last payout
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-[var(--color-muted)]">Commission Rate</p>
                            <p className="text-lg font-semibold">
                                {Math.round((consignor?.commission_split || 0.6) * 100)}%
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Pending Gross</p>
                        <p className="text-xl font-bold">{formatCurrency(pendingGrossSales)}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Pending Items</p>
                        <p className="text-xl font-bold">{pendingItemCount}</p>
                    </CardContent>
                </Card>
                {pendingCreditCardFees > 0 && (
                    <Card variant="outlined" className="border-[var(--color-warning)]">
                        <CardContent className="p-4 text-center">
                            <p className="text-xs text-[var(--color-warning)] uppercase">Card Fees</p>
                            <p className="text-xl font-bold text-[var(--color-warning)]">-{formatCurrency(pendingCreditCardFees)}</p>
                        </CardContent>
                    </Card>
                )}
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Total Payouts</p>
                        <p className="text-xl font-bold">{payouts.length}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Earned All Time</p>
                        <p className="text-xl font-bold text-[var(--color-primary)]">
                            {formatCurrency(totalPaidAllTime + pendingBalance)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Sales Details */}
            {pendingSales.length > 0 && (
                <Card variant="outlined" className="mb-6">
                    <CardHeader>
                        <CardTitle>Sales Since Last Payout</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-[var(--color-surface)] sticky top-0">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-medium">Date</th>
                                        <th className="text-left px-3 py-2 font-medium">Item</th>
                                        <th className="text-center px-3 py-2 font-medium">Qty</th>
                                        <th className="text-right px-3 py-2 font-medium">Price</th>
                                        <th className="text-right px-3 py-2 font-medium">Your Earnings</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingSales.map((item) => (
                                        <tr key={item.id} className="border-t border-[var(--color-border)]">
                                            <td className="px-3 py-2 text-[var(--color-muted)]">
                                                {new Date(item.completed_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-3 py-2">
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-xs text-[var(--color-muted)] font-mono">
                                                    {item.sku}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2 text-center">{item.quantity}</td>
                                            <td className="px-3 py-2 text-right">
                                                {formatCurrency(item.price)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium text-[var(--color-success)]">
                                                {formatCurrency(item.price * item.quantity * item.commission_split)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payout History */}
            <Card variant="outlined">
                <CardHeader>
                    <CardTitle>Payout History</CardTitle>
                </CardHeader>
                <CardContent>
                    {payouts.length === 0 ? (
                        <EmptyState
                            icon={<HistoryIcon />}
                            title="No payouts yet"
                            description="Your payout history will appear here once you receive your first payment."
                        />
                    ) : (
                        <div className="space-y-3">
                            {payouts.map((payout) => (
                                <button
                                    key={payout.id}
                                    onClick={() => setSelectedPayout(payout)}
                                    className="w-full text-left p-4 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)] transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] flex items-center justify-center">
                                                <CheckIcon />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-[var(--color-success)]">
                                                    {formatCurrency(payout.amount)}
                                                </p>
                                                <p className="text-sm text-[var(--color-muted)]">
                                                    {new Date(payout.paid_at).toLocaleDateString('en-US', {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric',
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="success">Paid</Badge>
                                            <p className="text-xs text-[var(--color-muted)] mt-1">
                                                {payout.items_sold} items
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payout Detail Modal */}
            <Modal
                isOpen={!!selectedPayout}
                onClose={() => setSelectedPayout(null)}
                title="Payout Receipt"
                size="md"
            >
                {selectedPayout && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="text-center pb-4 border-b border-[var(--color-border)]">
                            <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] flex items-center justify-center mx-auto mb-3">
                                <CheckCircleIcon />
                            </div>
                            <p className="text-3xl font-bold text-[var(--color-success)]">
                                {formatCurrency(selectedPayout.amount)}
                            </p>
                            <p className="text-sm text-[var(--color-muted)] mt-1">
                                Paid on{' '}
                                {new Date(selectedPayout.paid_at).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </p>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <p className="text-xs text-[var(--color-muted)]">Period</p>
                                <p className="font-medium text-sm">
                                    {new Date(selectedPayout.period_start).toLocaleDateString()} -{' '}
                                    {new Date(selectedPayout.period_end).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <p className="text-xs text-[var(--color-muted)]">Transactions</p>
                                <p className="font-medium text-sm">{selectedPayout.sales_count} sales</p>
                            </div>
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <p className="text-xs text-[var(--color-muted)]">Items Sold</p>
                                <p className="font-medium text-sm">{selectedPayout.items_sold} items</p>
                            </div>
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <p className="text-xs text-[var(--color-muted)]">Gross Sales</p>
                                <p className="font-medium text-sm">{formatCurrency(selectedPayout.gross_sales)}</p>
                            </div>
                        </div>

                        {/* Breakdown */}
                        <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Gross Sales</span>
                                <span>{formatCurrency(selectedPayout.gross_sales)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Store Share</span>
                                <span className="text-[var(--color-muted)]">
                                    -{formatCurrency(selectedPayout.store_share)}
                                </span>
                            </div>
                            <div className="flex justify-between font-semibold pt-2 border-t border-[var(--color-border)]">
                                <span>Your Payout</span>
                                <span className="text-[var(--color-success)]">
                                    {formatCurrency(selectedPayout.amount)}
                                </span>
                            </div>
                        </div>

                        {/* Notes */}
                        {selectedPayout.notes && (
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <p className="text-xs text-[var(--color-muted)] mb-1">Notes</p>
                                <p className="text-sm">{selectedPayout.notes}</p>
                            </div>
                        )}
                    </div>
                )}
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setSelectedPayout(null)}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

// Icons
function HistoryIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function CheckCircleIcon() {
    return (
        <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    );
}
