import { useEffect, useMemo, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../contexts/ToastContext';
import { useEmployee } from '../../contexts/EmployeeContext';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { printTillCountReceipt } from '../../lib/printTillCountReceipt';
import { getOfflineUnsyncedCashNetTotal } from '../../lib/offlineCashSales';
import {
    fromCurrencyCents,
    getCountedDrawerCents,
    getExpectedCashFromSalesCents,
    sumCashSalesNetCents,
    toCurrencyCents,
} from '../../lib/cashReconciliation';

interface AdminContact {
    id: string;
    email: string;
    full_name: string | null;
}

const CASH_DENOMINATIONS = [
    { key: '100', label: '$100', value: 100 },
    { key: '50', label: '$50', value: 50 },
    { key: '20', label: '$20', value: 20 },
    { key: '10', label: '$10', value: 10 },
    { key: '5', label: '$5', value: 5 },
    { key: '1', label: '$1', value: 1 },
    { key: '0.25', label: '25¢', value: 0.25 },
    { key: '0.10', label: '10¢', value: 0.1 },
    { key: '0.05', label: '5¢', value: 0.05 },
    { key: '0.01', label: '1¢', value: 0.01 },
] as const;

function isMissingDealerPurchasesTableError(message?: string): boolean {
    const text = (message || '').toLowerCase();
    return text.includes('dealer_purchases') && (text.includes('does not exist') || text.includes('not found'));
}

function getTodayRangeIso(): { startIso: string; endIso: string } {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function EmployeeTillCount() {
    const { employee } = useEmployee();
    const toast = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [openingFloatInput, setOpeningFloatInput] = useState('');
    const [expectedCashFromSales, setExpectedCashFromSales] = useState(0);
    const [offlineUnsyncedCashNetTotal, setOfflineUnsyncedCashNetTotal] = useState(0);
    const [checkCountInput, setCheckCountInput] = useState('');
    const [checkAmountInput, setCheckAmountInput] = useState('');
    const [admins, setAdmins] = useState<AdminContact[]>([]);
    const [selectedAdminId, setSelectedAdminId] = useState('');
    const [denominationCounts, setDenominationCounts] = useState<Record<string, string>>(() =>
        CASH_DENOMINATIONS.reduce<Record<string, string>>((acc, denomination) => {
            acc[denomination.key] = '';
            return acc;
        }, {})
    );

    useEffect(() => {
        const loadPageData = async () => {
            setIsLoading(true);
            const { startIso, endIso } = getTodayRangeIso();

            const [adminsResult, cashSalesResult, cashRefundsResult, dealerPurchasesResult, offlineUnsyncedCashTotal] = await Promise.all([
                supabase.rpc('get_chat_admin_contacts'),
                supabase
                    .from('sales')
                    .select('total, cash_tendered, change_given')
                    .eq('payment_method', 'cash')
                    .gte('completed_at', startIso)
                    .lte('completed_at', endIso),
                supabase
                    .from('refunds')
                    .select('refund_amount')
                    .eq('payment_method', 'cash')
                    .gte('created_at', startIso)
                    .lte('created_at', endIso),
                supabase
                    .from('dealer_purchases')
                    .select('total')
                    .eq('payment_method', 'cash')
                    .gte('purchased_at', startIso)
                    .lte('purchased_at', endIso),
                getOfflineUnsyncedCashNetTotal({
                    dateStart: startIso,
                    dateEnd: endIso,
                }),
            ]);

            if (adminsResult.error) {
                toast.error('Failed to load admins', adminsResult.error.message);
            } else {
                setAdmins((adminsResult.data || []) as AdminContact[]);
            }

            if (cashSalesResult.error || cashRefundsResult.error) {
                toast.error(
                    'Failed to load till totals',
                    cashSalesResult.error?.message
                    || cashRefundsResult.error?.message
                    || 'Please refresh and try again.'
                );
                setExpectedCashFromSales(0);
                setIsLoading(false);
                return;
            }

            let dealerCashPurchases = 0;
            if (dealerPurchasesResult.error) {
                if (!isMissingDealerPurchasesTableError(dealerPurchasesResult.error.message)) {
                    toast.error('Failed to load dealer purchases', dealerPurchasesResult.error.message);
                }
            } else {
                dealerCashPurchases = (dealerPurchasesResult.data || []).reduce(
                    (sum, purchase) => sum + Number(purchase.total || 0),
                    0
                );
            }

            const cashSalesNetCents = sumCashSalesNetCents(cashSalesResult.data || []);
            const cashRefundsCents = (cashRefundsResult.data || []).reduce(
                (sum, refund) => sum + toCurrencyCents(refund.refund_amount || 0),
                0
            );
            const expectedFromSalesCents = getExpectedCashFromSalesCents({
                cashSalesNetCents,
                cashRefundsCents,
                dealerCashPurchasesCents: toCurrencyCents(dealerCashPurchases),
                offlineUnsyncedCashSalesCents: toCurrencyCents(offlineUnsyncedCashTotal),
            });

            setOfflineUnsyncedCashNetTotal(offlineUnsyncedCashTotal);
            setExpectedCashFromSales(fromCurrencyCents(expectedFromSalesCents));
            setIsLoading(false);
        };

        void loadPageData();
    }, [toast]);

    const countedTotal = useMemo(() => fromCurrencyCents(
        getCountedDrawerCents(CASH_DENOMINATIONS, denominationCounts)
    ), [denominationCounts]);

    const openingFloat = Number.parseFloat(openingFloatInput) || 0;
    const checkCount = Math.max(0, Number.parseInt(checkCountInput || '0', 10) || 0);
    const checkTotal = Math.max(0, Number.parseFloat(checkAmountInput) || 0);
    const expectedDrawerTotal = fromCurrencyCents(toCurrencyCents(openingFloat) + toCurrencyCents(expectedCashFromSales));
    const variance = fromCurrencyCents(toCurrencyCents(countedTotal) - toCurrencyCents(expectedDrawerTotal));

    const adminOptions = [
        { value: '', label: admins.length > 0 ? 'Select admin' : 'No admins available' },
        ...admins.map((admin) => ({
            value: admin.id,
            label: admin.full_name?.trim() || admin.email,
        })),
    ];

    const updateDenominationCount = (key: string, value: string) => {
        if (value !== '' && !/^\d+$/.test(value)) return;
        setDenominationCounts((prev) => ({ ...prev, [key]: value }));
    };

    const resetCount = () => {
        setDenominationCounts(
            CASH_DENOMINATIONS.reduce<Record<string, string>>((acc, denomination) => {
                acc[denomination.key] = '';
                return acc;
            }, {})
        );
        setCheckCountInput('');
        setCheckAmountInput('');
    };

    const handleSendEmail = async () => {
        const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId);
        if (!selectedAdmin) {
            toast.error('Select an admin first');
            return;
        }

        setIsSendingEmail(true);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const denominationBreakdown = CASH_DENOMINATIONS.map((denomination) => {
            const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
            return {
                label: denomination.label,
                quantity,
                amount: quantity * denomination.value,
            };
        });
        const countedAt = new Date().toISOString();

        const { error } = await supabase.functions.invoke('send-till-count-report', {
            body: {
                adminEmail: selectedAdmin.email,
                adminName: selectedAdmin.full_name || selectedAdmin.email,
                employeeName: employee?.name || 'Employee',
                report: {
                    countedAt,
                    expectedFromSales: expectedCashFromSales,
                    checkCount,
                    checkTotal,
                    openingFloat,
                    expectedDrawerTotal,
                    countedTotal,
                    variance,
                    denominationBreakdown,
                },
                timezone,
            },
        });
        setIsSendingEmail(false);

        if (error) {
            toast.error('Failed to send till report', error.message);
            return;
        }

        toast.success('Till report sent', `Sent to ${selectedAdmin.full_name || selectedAdmin.email}`);
    };

    const handlePrintReceipt = async () => {
        const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId);
        const denominationBreakdown = CASH_DENOMINATIONS.map((denomination) => {
            const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
            return {
                label: denomination.label,
                quantity,
                amount: quantity * denomination.value,
            };
        });

        const result = await printTillCountReceipt(
            {
                submittedBy: employee?.name || 'Employee',
                recipientName: selectedAdmin?.full_name || selectedAdmin?.email,
            },
            {
                countedAt: new Date().toISOString(),
                expectedFromSales: expectedCashFromSales,
                checkCount,
                checkTotal,
                openingFloat,
                expectedDrawerTotal,
                countedTotal,
                variance,
                denominationBreakdown,
            }
        );

        if (!result.success) {
            toast.error('Failed to print till receipt', result.error || 'Please try again.');
            return;
        }

        toast.success('Print dialog opened');
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Cash Till Counter"
                description="Count the drawer and send a till-count receipt to an admin."
            />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                <Card className="xl:col-span-1">
                    <CardHeader>
                        <CardTitle>Expected Cash</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <p className="text-xs text-[var(--color-muted)]">From Today&apos;s Cash Activity (sales - refunds - dealer buys)</p>
                            <p className="text-2xl font-bold">
                                {isLoading ? 'Loading...' : formatCurrency(expectedCashFromSales)}
                            </p>
                            {offlineUnsyncedCashNetTotal > 0.009 && (
                                <p className="text-xs text-[var(--color-muted)] mt-1">
                                    Includes offline unsynced cash sales: +{formatCurrency(offlineUnsyncedCashNetTotal)}
                                </p>
                            )}
                        </div>
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <p className="text-xs text-[var(--color-muted)]">Checks (Manual Entry)</p>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                                <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    label="Check Qty"
                                    value={checkCountInput}
                                    onChange={(event) => setCheckCountInput(event.target.value)}
                                    placeholder="0"
                                />
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    label="Check Amount"
                                    value={checkAmountInput}
                                    onChange={(event) => setCheckAmountInput(event.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            label="Opening Float"
                            value={openingFloatInput}
                            onChange={(event) => setOpeningFloatInput(event.target.value)}
                            placeholder="0.00"
                        />
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <p className="text-xs text-[var(--color-muted)]">Expected Drawer Total</p>
                            <p className="text-xl font-semibold">{formatCurrency(expectedDrawerTotal)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle>Counter Tool</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {CASH_DENOMINATIONS.map((denomination) => (
                                <Input
                                    key={denomination.key}
                                    label={denomination.label}
                                    value={denominationCounts[denomination.key]}
                                    onChange={(event) => updateDenominationCount(denomination.key, event.target.value)}
                                    placeholder="0"
                                />
                            ))}
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-[var(--color-border)] p-3">
                                <p className="text-xs text-[var(--color-muted)]">Counted Total</p>
                                <p className="text-lg font-semibold">{formatCurrency(countedTotal)}</p>
                            </div>
                            <div className="rounded-lg border border-[var(--color-border)] p-3">
                                <p className="text-xs text-[var(--color-muted)]">Expected Total</p>
                                <p className="text-lg font-semibold">{formatCurrency(expectedDrawerTotal)}</p>
                            </div>
                            <div className="rounded-lg border border-[var(--color-border)] p-3">
                                <p className="text-xs text-[var(--color-muted)]">Variance</p>
                                <p
                                    className={`text-lg font-semibold ${
                                        variance > 0.009
                                            ? 'text-[var(--color-success)]'
                                            : variance < -0.009
                                                ? 'text-[var(--color-danger)]'
                                                : ''
                                    }`}
                                >
                                    {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 items-end">
                            <div className="w-full sm:w-72">
                                <Select
                                    label="Send To Admin"
                                    options={adminOptions}
                                    value={selectedAdminId}
                                    onChange={(event) => setSelectedAdminId(event.target.value)}
                                    disabled={admins.length === 0 || isLoading}
                                />
                            </div>
                            <Button
                                onClick={handleSendEmail}
                                disabled={isLoading || isSendingEmail || !selectedAdminId}
                            >
                                {isSendingEmail ? 'Sending...' : 'Email Till Receipt'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handlePrintReceipt}
                                disabled={isLoading}
                            >
                                Print Till Receipt
                            </Button>
                            <Button variant="secondary" onClick={resetCount}>
                                Reset Counter
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
