import { useEffect, useMemo, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../contexts/ToastContext';
import { useEmployee } from '../../contexts/EmployeeContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { printTillCountReceipt } from '../../lib/printTillCountReceipt';
import { getOfflineUnsyncedCashNetTotal } from '../../lib/offlineCashSales';
import {
    fromCurrencyCents,
    getCountedDrawerCents,
    toCurrencyCents,
} from '../../lib/cashReconciliation';
import { calculateTillAccountabilityMetrics, type TillAccountabilityMetrics } from '../../lib/tillAccountability';

interface AdminContact {
    id: string;
    email: string;
    full_name: string | null;
}

interface TillFloatRecord {
    id: string;
    business_date: string;
    opening_float: number | null;
    ending_float: number | null;
    opening_recorded_at: string | null;
    ending_recorded_at: string | null;
    opening_recorded_by_name: string | null;
    ending_recorded_by_name: string | null;
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

function getLocalDateInputValue(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDateFromInputValue(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return new Date();
    return new Date(year, month - 1, day);
}

function getDayRangeIso(dateValue: string): { startIso: string; endIso: string } {
    const day = getDateFromInputValue(dateValue);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function formatBusinessDate(dateValue: string): string {
    return getDateFromInputValue(dateValue).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function EmployeeTillCount() {
    const { employee } = useEmployee();
    const { userRecord } = useAuth();
    const toast = useToast();
    const staffName = employee?.name || userRecord?.full_name || userRecord?.email || 'Staff member';

    const [isLoading, setIsLoading] = useState(true);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [savingFloatType, setSavingFloatType] = useState<'opening' | 'ending' | 'report' | null>(null);
    const [openingFloatInput, setOpeningFloatInput] = useState('');
    const [floatHistory, setFloatHistory] = useState<TillFloatRecord[]>([]);
    const [floatRefreshKey, setFloatRefreshKey] = useState(0);
    const [selectedDate, setSelectedDate] = useState(() => getLocalDateInputValue());
    const [expectedCashFromSales, setExpectedCashFromSales] = useState(0);
    const [offlineUnsyncedCashNetTotal, setOfflineUnsyncedCashNetTotal] = useState(0);
    const [accountability, setAccountability] = useState<TillAccountabilityMetrics>(() =>
        calculateTillAccountabilityMetrics({ sales: [], refunds: [], giftCardsSold: [] })
    );
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
            const { startIso, endIso } = getDayRangeIso(selectedDate);

            const [adminsResult, salesResult, refundsResult, dealerPurchasesResult, giftCardsResult, floatRecordResult, floatHistoryResult, offlineUnsyncedCashTotal] = await Promise.all([
                supabase.rpc('get_chat_admin_contacts'),
                supabase
                    .from('sales')
                    .select('subtotal, tax_amount, total, discount_total, card_fee_amount, store_credit_used, payment_method, payment_breakdown, cash_tendered, change_given')
                    .gte('completed_at', startIso)
                    .lte('completed_at', endIso),
                supabase
                    .from('refunds')
                    .select('refund_amount, payment_method')
                    .gte('created_at', startIso)
                    .lte('created_at', endIso),
                supabase
                    .from('dealer_purchases')
                    .select('total')
                    .eq('payment_method', 'cash')
                    .gte('purchased_at', startIso)
                    .lte('purchased_at', endIso),
                supabase
                    .from('gift_cards')
                    .select('original_amount, purchase_payment_method')
                    .gte('issued_at', startIso)
                    .lte('issued_at', endIso),
                supabase
                    .from('till_float_records')
                    .select('id, business_date, opening_float, ending_float, opening_recorded_at, ending_recorded_at, opening_recorded_by_name, ending_recorded_by_name')
                    .eq('business_date', selectedDate)
                    .maybeSingle(),
                supabase
                    .from('till_float_records')
                    .select('id, business_date, opening_float, ending_float, opening_recorded_at, ending_recorded_at, opening_recorded_by_name, ending_recorded_by_name')
                    .order('business_date', { ascending: false })
                    .limit(31),
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

            if (floatRecordResult.error || floatHistoryResult.error) {
                toast.error(
                    'Failed to load float history',
                    floatRecordResult.error?.message || floatHistoryResult.error?.message || 'Please refresh and try again.'
                );
            } else {
                const selectedRecord = floatRecordResult.data as TillFloatRecord | null;
                setOpeningFloatInput(
                    selectedRecord?.opening_float == null ? '' : Number(selectedRecord.opening_float).toFixed(2)
                );
                setFloatHistory((floatHistoryResult.data || []) as TillFloatRecord[]);
            }

            if (salesResult.error || refundsResult.error || giftCardsResult.error) {
                toast.error(
                    'Failed to load till totals',
                    salesResult.error?.message
                    || refundsResult.error?.message
                    || giftCardsResult.error?.message
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

            const metrics = calculateTillAccountabilityMetrics({
                sales: salesResult.data || [],
                refunds: refundsResult.data || [],
                giftCardsSold: giftCardsResult.data || [],
                dealerCashPurchases,
                offlineUnsyncedCashSales: offlineUnsyncedCashTotal,
            });
            const expectedFromSalesCents = toCurrencyCents(metrics.expectedCashFromSales);
            setOfflineUnsyncedCashNetTotal(offlineUnsyncedCashTotal);
            setAccountability(metrics);
            setExpectedCashFromSales(fromCurrencyCents(expectedFromSalesCents));
            setIsLoading(false);
        };

        void loadPageData();
    }, [floatRefreshKey, selectedDate, toast]);

    const countedTotal = useMemo(() => fromCurrencyCents(
        getCountedDrawerCents(CASH_DENOMINATIONS, denominationCounts)
    ), [denominationCounts]);

    const openingFloat = Number.parseFloat(openingFloatInput) || 0;
    const checkCount = Math.max(0, Number.parseInt(checkCountInput || '0', 10) || 0);
    const checkTotal = Math.max(0, Number.parseFloat(checkAmountInput) || 0);
    const expectedDrawerTotal = fromCurrencyCents(toCurrencyCents(openingFloat) + toCurrencyCents(expectedCashFromSales));
    const variance = fromCurrencyCents(toCurrencyCents(countedTotal) - toCurrencyCents(expectedDrawerTotal));
    const selectedBusinessDateLabel = formatBusinessDate(selectedDate);

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

    const persistFloatRecord = async (
        openingAmount: number | null,
        endingAmount: number | null,
        savingType: 'opening' | 'ending' | 'report'
    ): Promise<boolean> => {
        setSavingFloatType(savingType);
        const { error } = await supabase.rpc('save_till_float_record', {
            p_business_date: selectedDate,
            p_opening_float: openingAmount,
            p_ending_float: endingAmount,
        });
        setSavingFloatType(null);

        if (error) {
            toast.error('Failed to save till floats', error.message);
            return false;
        }

        setFloatRefreshKey((key) => key + 1);
        return true;
    };

    const handleSaveOpeningFloat = async () => {
        if (openingFloatInput.trim() === '' || !Number.isFinite(Number(openingFloatInput)) || Number(openingFloatInput) < 0) {
            toast.error('Enter a valid opening float');
            return;
        }
        if (await persistFloatRecord(openingFloat, null, 'opening')) {
            toast.success('Opening float saved', `${selectedBusinessDateLabel}: ${formatCurrency(openingFloat)}`);
        }
    };

    const handleSaveEndingFloat = async () => {
        if (await persistFloatRecord(null, countedTotal, 'ending')) {
            toast.success('Ending float saved', `${selectedBusinessDateLabel}: ${formatCurrency(countedTotal)}`);
        }
    };

    const handleSendEmail = async () => {
        const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId);
        if (!selectedAdmin) {
            toast.error('Select an admin first');
            return;
        }

        setIsSendingEmail(true);
        const saved = await persistFloatRecord(openingFloat, countedTotal, 'report');
        if (!saved) {
            setIsSendingEmail(false);
            return;
        }
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
                employeeName: staffName,
                report: {
                    countedAt,
                    businessDate: selectedDate,
                    expectedFromSales: expectedCashFromSales,
                    checkCount,
                    checkTotal,
                    openingFloat,
                    expectedDrawerTotal,
                    countedTotal,
                    variance,
                    denominationBreakdown,
                    accountability: {
                        grossProductSales: accountability.grossProductSales,
                        discounts: accountability.discounts,
                        returns: accountability.returns,
                        allowances: accountability.allowances,
                        netSales: accountability.netSales,
                        salesTax: accountability.salesTax,
                        creditCardFeesCharged: accountability.creditCardFeesCharged,
                        giftCertificatesSold: accountability.giftCertificatesSold,
                        totalCollected: accountability.totalCollected,
                        cashInDrawer: accountability.cashInDrawer,
                        checksInHand: accountability.checksInHand,
                        creditCardsBatchTotal: accountability.creditCardsBatchTotal,
                        storeCreditRedeemed: accountability.storeCreditRedeemed,
                        totalReceived: accountability.totalReceived,
                        difference: accountability.difference,
                        dealerCashPurchases: accountability.dealerCashPurchases,
                    },
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
        const saved = await persistFloatRecord(openingFloat, countedTotal, 'report');
        if (!saved) return;

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
                submittedBy: staffName,
                recipientName: selectedAdmin?.full_name || selectedAdmin?.email,
            },
            {
                countedAt: new Date().toISOString(),
                businessDate: selectedDate,
                expectedFromSales: expectedCashFromSales,
                checkCount,
                checkTotal,
                openingFloat,
                expectedDrawerTotal,
                countedTotal,
                variance,
                denominationBreakdown,
                accountability: {
                    grossProductSales: accountability.grossProductSales,
                    discounts: accountability.discounts,
                    returns: accountability.returns,
                    allowances: accountability.allowances,
                    netSales: accountability.netSales,
                    salesTax: accountability.salesTax,
                    creditCardFeesCharged: accountability.creditCardFeesCharged,
                    giftCertificatesSold: accountability.giftCertificatesSold,
                    totalCollected: accountability.totalCollected,
                    cashInDrawer: accountability.cashInDrawer,
                    checksInHand: accountability.checksInHand,
                    creditCardsBatchTotal: accountability.creditCardsBatchTotal,
                    storeCreditRedeemed: accountability.storeCreditRedeemed,
                    totalReceived: accountability.totalReceived,
                    difference: accountability.difference,
                    dealerCashPurchases: accountability.dealerCashPurchases,
                },
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
                description="Record opening and ending floats, count the drawer, and send a till-count receipt."
            />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                <Card className="xl:col-span-1">
                    <CardHeader>
                        <CardTitle>Expected Cash</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <div className="mb-3 max-w-56">
                                <Input
                                    type="date"
                                    label="Till Date"
                                    value={selectedDate}
                                    onChange={(event) => setSelectedDate(event.target.value || getLocalDateInputValue())}
                                    disabled={isLoading}
                                />
                            </div>
                            <p className="text-xs text-[var(--color-muted)]">From {selectedBusinessDateLabel} Cash Activity (sales - refunds - dealer buys)</p>
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
                        <Button
                            variant="secondary"
                            onClick={handleSaveOpeningFloat}
                            isLoading={savingFloatType === 'opening'}
                            disabled={isLoading || savingFloatType !== null}
                            className="w-full"
                        >
                            Save Opening Float
                        </Button>
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <p className="text-xs text-[var(--color-muted)]">Total Collected = Total Received</p>
                            <p className="text-sm mt-1">
                                {formatCurrency(accountability.totalCollected)} = {formatCurrency(accountability.totalReceived)}
                            </p>
                            <p className="text-xs text-[var(--color-muted)] mt-1">
                                Difference: {accountability.difference >= 0 ? '+' : ''}{formatCurrency(accountability.difference)}
                            </p>
                        </div>
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
                            <p className="font-semibold text-[var(--color-foreground)]">What Customers Paid For</p>
                            <div className="mt-2 space-y-1 text-[var(--color-muted)]">
                                <p>Gross Product Sales: {formatCurrency(accountability.grossProductSales)}</p>
                                <p>Discounts: -{formatCurrency(accountability.discounts)}</p>
                                <p>Returns: -{formatCurrency(accountability.returns)}</p>
                                <p>Allowances: -{formatCurrency(accountability.allowances)}</p>
                                <p>Net Sales: {formatCurrency(accountability.netSales)}</p>
                                <p>Sales Tax: {formatCurrency(accountability.salesTax)}</p>
                                <p>Credit Card Fees: {formatCurrency(accountability.creditCardFeesCharged)}</p>
                                <p>Gift Certificates Sold: {formatCurrency(accountability.giftCertificatesSold)}</p>
                            </div>
                            <p className="font-semibold text-[var(--color-foreground)] mt-3">How Customers Paid</p>
                            <div className="mt-2 space-y-1 text-[var(--color-muted)]">
                                <p>Cash in Drawer: {formatCurrency(accountability.cashInDrawer)}</p>
                                <p>Checks in Hand: {formatCurrency(accountability.checksInHand)}</p>
                                <p>Credit Cards (Batch): {formatCurrency(accountability.creditCardsBatchTotal)}</p>
                                <p>Store Credit Redeemed: {formatCurrency(accountability.storeCreditRedeemed)}</p>
                                <p>Dealer Purchases (Cash Out): -{formatCurrency(accountability.dealerCashPurchases)}</p>
                            </div>
                        </div>
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
                                variant="secondary"
                                onClick={handleSaveEndingFloat}
                                isLoading={savingFloatType === 'ending'}
                                disabled={isLoading || savingFloatType !== null}
                            >
                                Save Ending Float
                            </Button>
                            <Button
                                onClick={handleSendEmail}
                                disabled={isLoading || isSendingEmail || savingFloatType !== null || !selectedAdminId}
                            >
                                {isSendingEmail ? 'Sending...' : 'Email Till Receipt'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handlePrintReceipt}
                                disabled={isLoading || savingFloatType !== null}
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

            <Card>
                <CardHeader>
                    <CardTitle>Float History</CardTitle>
                </CardHeader>
                <CardContent>
                    {floatHistory.length === 0 ? (
                        <p className="text-sm text-[var(--color-muted)]">No opening or ending floats have been saved yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                                        <th className="px-3 py-3 font-medium">Business date</th>
                                        <th className="px-3 py-3 font-medium">Opening float</th>
                                        <th className="px-3 py-3 font-medium">Recorded by</th>
                                        <th className="px-3 py-3 font-medium">Ending float</th>
                                        <th className="px-3 py-3 font-medium">Recorded by</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {floatHistory.map((record) => (
                                        <tr key={record.id} className="border-b border-[var(--color-border)] last:border-0">
                                            <td className="px-3 py-3 font-medium text-[var(--color-foreground)]">
                                                {formatBusinessDate(record.business_date)}
                                            </td>
                                            <td className="px-3 py-3 tabular-nums">
                                                {record.opening_float == null ? '—' : formatCurrency(Number(record.opening_float))}
                                            </td>
                                            <td className="px-3 py-3 text-[var(--color-muted)]">
                                                {record.opening_recorded_by_name || '—'}
                                            </td>
                                            <td className="px-3 py-3 tabular-nums">
                                                {record.ending_float == null ? '—' : formatCurrency(Number(record.ending_float))}
                                            </td>
                                            <td className="px-3 py-3 text-[var(--color-muted)]">
                                                {record.ending_recorded_by_name || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
