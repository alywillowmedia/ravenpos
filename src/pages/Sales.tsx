import { useState, useMemo, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useSalesHistory, type SaleWithItems } from '../hooks/useSalesHistory';
import { useRefundHistory, type RefundWithDetails } from '../hooks/useRefundHistory';
import { useConsignors } from '../hooks/useConsignors';
import { useCustomers } from '../hooks/useCustomers';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { printReceipt } from '../lib/printReceipt';
import { printTillCountReceipt } from '../lib/printTillCountReceipt';
import type { ReceiptData } from '../types/receipt';
import type { Customer, CustomerInput } from '../types';

type DatePreset = 'all' | 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';
type SalesTab = 'sales' | 'refunds' | 'employeeAttribution';
const SALES_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const CASH_DENOMINATIONS = [
    { key: '100', label: '$100', value: 100 },
    { key: '50', label: '$50', value: 50 },
    { key: '20', label: '$20', value: 20 },
    { key: '10', label: '$10', value: 10 },
    { key: '5', label: '$5', value: 5 },
    { key: '1', label: '$1', value: 1 },
    { key: '0.25', label: '25¢', value: 0.25 },
    { key: '0.10', label: '10¢', value: 0.10 },
    { key: '0.05', label: '5¢', value: 0.05 },
    { key: '0.01', label: '1¢', value: 0.01 },
] as const;

interface AdminContact {
    id: string;
    email: string;
    full_name: string | null;
}

interface EmployeeDirectoryEntry {
    id: string;
    name: string;
}

interface EmployeeAttributionRow {
    actorType: 'employee' | 'admin';
    employeeId: string | null;
    userId: string | null;
    employeeName: string;
    salesCount: number;
    grossSales: number;
    averageTicket: number;
}

function escapeCsvValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function toLocalDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDateInput(value: string, endOfDay = false): Date {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (endOfDay) {
        parsed.setHours(23, 59, 59, 999);
    } else {
        parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
}

export function Sales() {
    const { userRecord } = useAuth();
    const toast = useToast();
    const { refunds, isLoading: isLoadingRefunds } = useRefundHistory();
    const { consignors } = useConsignors();
    const { searchCustomers, createCustomer } = useCustomers();

    const [activeTab, setActiveTab] = useState<SalesTab>('sales');
    const [salesPage, setSalesPage] = useState(1);
    const [salesPageSize, setSalesPageSize] = useState<number>(50);
    const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
    const [selectedSale, setSelectedSale] = useState<SaleWithItems | null>(null);
    const [filterConsignor, setFilterConsignor] = useState('');
    const [filterDatePreset, setFilterDatePreset] = useState<DatePreset>('all');
    const [customDateFrom, setCustomDateFrom] = useState(() => toLocalDateInput(new Date()));
    const [customDateTo, setCustomDateTo] = useState(() => toLocalDateInput(new Date()));
    const [checkNumberInput, setCheckNumberInput] = useState('');
    const [isSavingCheckNumber, setIsSavingCheckNumber] = useState(false);
    const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
    const [printError, setPrintError] = useState<string | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState<Customer[]>([]);
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
    const [isSavingCustomer, setIsSavingCustomer] = useState(false);
    const [customerError, setCustomerError] = useState<string | null>(null);
    const [newCustomerData, setNewCustomerData] = useState<CustomerInput>({
        name: '',
        email: null,
        phone: null,
        notes: null,
        accepts_marketing: false,
    });
    const [showCashReconciliation, setShowCashReconciliation] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [employeeDirectory, setEmployeeDirectory] = useState<EmployeeDirectoryEntry[]>([]);
    const [admins, setAdmins] = useState<AdminContact[]>([]);
    const [selectedAdminId, setSelectedAdminId] = useState('');
    const [isSendingTillEmail, setIsSendingTillEmail] = useState(false);
    const [openingFloatInput, setOpeningFloatInput] = useState('');
    const [manualCashAdjustmentInput, setManualCashAdjustmentInput] = useState('');
    const [checkCountInput, setCheckCountInput] = useState('');
    const [checkAmountInput, setCheckAmountInput] = useState('');
    const [denominationCounts, setDenominationCounts] = useState<Record<string, string>>(() =>
        CASH_DENOMINATIONS.reduce<Record<string, string>>((acc, denomination) => {
            acc[denomination.key] = '';
            return acc;
        }, {})
    );

    const dateRange = useMemo(() => {
        const now = new Date();

        switch (filterDatePreset) {
            case 'today': {
                const start = new Date(now);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'last7': {
                const end = new Date(now);
                end.setHours(23, 59, 59, 999);
                const start = new Date(end);
                start.setDate(end.getDate() - 6);
                start.setHours(0, 0, 0, 0);
                return { start, end };
            }
            case 'last30': {
                const end = new Date(now);
                end.setHours(23, 59, 59, 999);
                const start = new Date(end);
                start.setDate(end.getDate() - 29);
                start.setHours(0, 0, 0, 0);
                return { start, end };
            }
            case 'thisMonth': {
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'lastMonth': {
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'custom': {
                if (!customDateFrom || !customDateTo) return { start: null, end: null };
                const start = parseLocalDateInput(customDateFrom);
                const end = parseLocalDateInput(customDateTo, true);
                if (start > end) return { start: null, end: null };
                return { start, end };
            }
            case 'all':
            default:
                return { start: null, end: null };
        }
    }, [filterDatePreset, customDateFrom, customDateTo]);

    const dateStartIso = dateRange.start ? dateRange.start.toISOString() : null;
    const dateEndIso = dateRange.end ? dateRange.end.toISOString() : null;

    const { sales, totalCount: filteredSalesTotalCount, isLoading, calculateSalesSummary, refetch } = useSalesHistory({
        page: salesPage,
        pageSize: salesPageSize,
        dateStart: dateStartIso,
        dateEnd: dateEndIso,
        consignorId: filterConsignor || undefined,
    });

    const matchesDateRange = (dateValue: string) => {
        const targetDate = new Date(dateValue);
        if (dateRange.start && targetDate < dateRange.start) return false;
        if (dateRange.end && targetDate > dateRange.end) return false;
        return true;
    };

    const filteredSales = sales;

    const filteredRefunds = useMemo(
        () => refunds.filter((refund) => matchesDateRange(refund.created_at)),
        [refunds, dateRange.start, dateRange.end]
    );

    const salesTotalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredSalesTotalCount / salesPageSize)),
        [filteredSalesTotalCount, salesPageSize]
    );

    useEffect(() => {
        if (activeTab !== 'sales') return;
        setSalesPage(1);
        setExpandedSaleId(null);
    }, [activeTab, filterConsignor, filterDatePreset, customDateFrom, customDateTo]);

    useEffect(() => {
        setSalesPage((prev) => Math.min(prev, salesTotalPages));
    }, [salesTotalPages]);

    const cashReconciliation = useMemo(() => {
        const cashSales = filteredSales.filter((sale) => sale.payment_method === 'cash');
        const cashSalesCount = cashSales.length;
        const cashReceivedGross = cashSales.reduce(
            (sum, sale) => sum + Number(sale.cash_tendered ?? 0),
            0
        );
        const changeGiven = cashSales.reduce(
            (sum, sale) => sum + Number(sale.change_given ?? 0),
            0
        );
        const cashSalesNet = cashSales.reduce((sum, sale) => {
            const tendered = Number(sale.cash_tendered ?? 0);
            const change = Number(sale.change_given ?? 0);
            const fallback = Number(sale.total ?? 0);
            return sum + (tendered > 0 ? (tendered - change) : fallback);
        }, 0);
        const cashRefunds = filteredRefunds
            .filter((refund) => refund.payment_method === 'cash')
            .reduce((sum, refund) => sum + Number(refund.refund_amount || 0), 0);
        const expectedCashFromSales = cashSalesNet - cashRefunds;
        const openingFloat = Number.parseFloat(openingFloatInput) || 0;
        const manualAdjustment = Number.parseFloat(manualCashAdjustmentInput) || 0;
        const checkCount = Math.max(0, Number.parseInt(checkCountInput || '0', 10) || 0);
        const checkTotal = Math.max(0, Number.parseFloat(checkAmountInput) || 0);
        const expectedDrawerTotal = openingFloat + expectedCashFromSales + manualAdjustment;
        const countedTotal = CASH_DENOMINATIONS.reduce((sum, denomination) => {
            const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
            return sum + (quantity * denomination.value);
        }, 0);
        const variance = countedTotal - expectedDrawerTotal;

        return {
            cashSalesCount,
            cashReceivedGross,
            changeGiven,
            cashSalesNet,
            cashRefunds,
            checkCount,
            checkTotal,
            expectedCashFromSales,
            openingFloat,
            manualAdjustment,
            expectedDrawerTotal,
            countedTotal,
            variance,
        };
    }, [filteredSales, filteredRefunds, openingFloatInput, manualCashAdjustmentInput, checkCountInput, checkAmountInput, denominationCounts]);

    useEffect(() => {
        const loadAdmins = async () => {
            const { data, error: adminsError } = await supabase.rpc('get_chat_admin_contacts');
            if (adminsError) {
                toast.error('Failed to load admins', adminsError.message);
                return;
            }

            const adminList = (data || []) as AdminContact[];
            setAdmins(adminList);
            if (!selectedAdminId && adminList.length > 0) {
                const currentUserAdmin = adminList.find((admin) => admin.email === userRecord?.email);
                setSelectedAdminId(currentUserAdmin?.id || adminList[0].id);
            }
        };

        void loadAdmins();
    }, [toast, userRecord?.email]);

    useEffect(() => {
        const loadEmployees = async () => {
            const { data, error: employeeError } = await supabase
                .from('employees')
                .select('id, name')
                .order('name', { ascending: true });

            if (employeeError) {
                toast.error('Failed to load employees', employeeError.message);
                return;
            }

            setEmployeeDirectory((data || []) as EmployeeDirectoryEntry[]);
        };

        void loadEmployees();
    }, [toast]);

    const paymentTotals = useMemo(() => {
        const cashSalesTotal = filteredSales
            .filter((sale) => sale.payment_method === 'cash')
            .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const cardSalesTotal = filteredSales
            .filter((sale) => sale.payment_method === 'card')
            .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const checkSalesTotal = filteredSales
            .filter((sale) => sale.payment_method === 'check')
            .reduce((sum, sale) => sum + Number(sale.total || 0), 0);

        const cashRefundTotal = filteredRefunds
            .filter((refund) => refund.payment_method === 'cash')
            .reduce((sum, refund) => sum + Number(refund.refund_amount || 0), 0);
        const cardRefundTotal = filteredRefunds
            .filter((refund) => refund.payment_method === 'card')
            .reduce((sum, refund) => sum + Number(refund.refund_amount || 0), 0);
        const checkRefundTotal = filteredRefunds
            .filter((refund) => refund.payment_method === 'check')
            .reduce((sum, refund) => sum + Number(refund.refund_amount || 0), 0);

        const cardFeeTotal = filteredSales.reduce((sum, sale) => sum + Number(sale.card_fee_amount || 0), 0);

        return {
            cashNetTotal: cashSalesTotal - cashRefundTotal,
            cardNetTotal: cardSalesTotal - cardRefundTotal,
            checkNetTotal: checkSalesTotal - checkRefundTotal,
            cardFeeTotal,
        };
    }, [filteredSales, filteredRefunds]);

    const employeeAttribution = useMemo(() => {
        const employeeNameById = new Map(employeeDirectory.map((employee) => [employee.id, employee.name]));
        const adminNameById = new Map(
            admins.map((admin) => [admin.id, admin.full_name?.trim() || admin.email || 'Admin User'])
        );
        const rollup = new Map<string, {
            actorType: 'employee' | 'admin';
            employeeId: string | null;
            userId: string | null;
            employeeName: string;
            salesCount: number;
            grossSales: number;
        }>();

        for (const sale of filteredSales) {
            const employeeId = sale.processed_by_employee ?? null;
            const userId = sale.processed_by_user ?? null;
            const key = employeeId
                ? `emp:${employeeId}`
                : userId
                    ? `admin:${userId}`
                    : 'admin:legacy';
            const existing = rollup.get(key);
            const saleTotal = Number(sale.total || 0);
            const actorType = employeeId ? 'employee' : 'admin';
            const employeeName = employeeId
                ? (employeeNameById.get(employeeId) || 'Unknown Employee')
                : userId
                    ? (adminNameById.get(userId) || 'Admin User')
                    : 'Admin';

            if (existing) {
                existing.salesCount += 1;
                existing.grossSales += saleTotal;
                continue;
            }

            rollup.set(key, {
                actorType,
                employeeId,
                userId,
                employeeName,
                salesCount: 1,
                grossSales: saleTotal,
            });
        }

        const rows: EmployeeAttributionRow[] = Array.from(rollup.values())
            .map((row) => ({
                actorType: row.actorType,
                employeeId: row.employeeId,
                userId: row.userId,
                employeeName: row.employeeName,
                salesCount: row.salesCount,
                grossSales: row.grossSales,
                averageTicket: row.salesCount > 0 ? row.grossSales / row.salesCount : 0,
            }))
            .sort((a, b) => b.grossSales - a.grossSales);

        const attributedEmployees = rows.filter((row) => row.actorType === 'employee');
        const attributedAdmins = rows.filter((row) => row.actorType === 'admin');

        return { rows, attributedEmployees, attributedAdmins };
    }, [employeeDirectory, admins, filteredSales]);

    // Calculate totals (subtracting refunds)
    const totals = useMemo(() => {
        // Sum up all refunds
        const totalRefunded = filteredRefunds.reduce((sum, refund) => sum + Number(refund.refund_amount), 0);

        // Calculate raw sales totals
        const rawTotals = filteredSales.reduce(
            (acc, sale) => {
                const summary = calculateSalesSummary(sale);
                return {
                    subtotal: acc.subtotal + sale.subtotal,
                    tax: acc.tax + sale.tax_amount,
                    total: acc.total + sale.total,
                    consignorShare: acc.consignorShare + summary.consignorShare,
                    storeShare: acc.storeShare + summary.storeShare,
                };
            },
            { subtotal: 0, tax: 0, total: 0, consignorShare: 0, storeShare: 0 }
        );

        // Calculate refund proportions for consignor/store split
        // Assume refunds are split the same as sales (proportionally)
        const totalRevenueRatio = rawTotals.total > 0 ? totalRefunded / rawTotals.total : 0;
        const refundedConsignorShare = rawTotals.consignorShare * totalRevenueRatio;
        const refundedStoreShare = rawTotals.storeShare * totalRevenueRatio;

        return {
            subtotal: rawTotals.subtotal,
            tax: rawTotals.tax,
            total: rawTotals.total - totalRefunded,
            consignorShare: rawTotals.consignorShare - refundedConsignorShare,
            storeShare: rawTotals.storeShare - refundedStoreShare,
            totalRefunded,
        };
    }, [filteredSales, filteredRefunds, calculateSalesSummary]);

    const consignorOptions = [
        { value: '', label: 'All Consignors' },
        ...consignors.map((c) => ({ value: c.id, label: `${c.consignor_number} - ${c.name}` })),
    ];

    const dateRangeOptions = [
        { value: 'all', label: 'All Time' },
        { value: 'today', label: 'Today' },
        { value: 'last7', label: 'Last 7 Days' },
        { value: 'last30', label: 'Last 30 Days' },
        { value: 'thisMonth', label: 'This Month' },
        { value: 'lastMonth', label: 'Last Month' },
        { value: 'custom', label: 'Custom Range' },
    ];

    const toggleExpand = (saleId: string) => {
        setExpandedSaleId(expandedSaleId === saleId ? null : saleId);
    };

    const formatPaymentMethod = (method: string) => {
        if (method === 'cash') return 'Cash';
        if (method === 'check') return 'Check';
        return 'Card';
    };

    const handleSaveCheckNumber = async () => {
        if (!selectedSale) return;
        setIsSavingCheckNumber(true);
        const { error } = await supabase
            .from('sales')
            .update({ check_number: checkNumberInput.trim() || null })
            .eq('id', selectedSale.id);
        setIsSavingCheckNumber(false);

        if (!error) {
            setSelectedSale({
                ...selectedSale,
                check_number: checkNumberInput.trim() || null,
            });
            await refetch();
        }
    };

    const createReceiptDataFromSale = (sale: SaleWithItems): ReceiptData => ({
        transactionId: sale.id,
        date: new Date(sale.completed_at),
        items: sale.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: Number(item.price),
            lineTotal: Number(item.price) * item.quantity,
            consignorName: item.consignor?.name || 'Unknown Vendor',
            consignorId: item.consignor_id,
            imageUrl: null,
        })),
        subtotal: Number(sale.subtotal),
        tax: Number(sale.tax_amount),
        storeCreditUsed: sale.store_credit_used ? Number(sale.store_credit_used) : 0,
        giftCardUsed: sale.gift_card_used ? Number(sale.gift_card_used) : 0,
        total: Number(sale.total),
        cardFeeAmount: sale.card_fee_amount ? Number(sale.card_fee_amount) : 0,
        cardLast4: sale.card_last4 || undefined,
        paymentMethod: sale.payment_method,
        checkNumber: sale.check_number || undefined,
        cashTendered: sale.cash_tendered ? Number(sale.cash_tendered) : undefined,
        changeGiven: sale.change_given ? Number(sale.change_given) : undefined,
    });

    const handlePrintSelectedReceipt = async () => {
        if (!selectedSale) return;
        setIsPrintingReceipt(true);
        setPrintError(null);
        const result = await printReceipt(createReceiptDataFromSale(selectedSale));
        if (!result.success) {
            setPrintError(result.error || 'Unable to print receipt');
        }
        setIsPrintingReceipt(false);
    };

    useEffect(() => {
        if (!selectedSale || customerSearch.length < 2) {
            setCustomerResults([]);
            setShowCustomerDropdown(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingCustomer(true);
            const { data, error } = await searchCustomers(customerSearch);
            setIsSearchingCustomer(false);

            if (error) {
                setCustomerError(error);
                setCustomerResults([]);
                setShowCustomerDropdown(false);
                return;
            }

            setCustomerError(null);
            setCustomerResults(data.filter((customer) => customer.id !== selectedSale.customer?.id));
            setShowCustomerDropdown(true);
        }, 300);

        return () => clearTimeout(timer);
    }, [selectedSale, customerSearch, searchCustomers]);

    const resetCustomerAttachState = () => {
        setCustomerSearch('');
        setCustomerResults([]);
        setShowCustomerDropdown(false);
        setCustomerError(null);
        setShowNewCustomerModal(false);
        setNewCustomerData({ name: '', email: null, phone: null, notes: null, accepts_marketing: false });
    };

    const attachCustomerToSelectedSale = async (customer: Customer | null) => {
        if (!selectedSale) return;

        setIsSavingCustomer(true);
        setCustomerError(null);

        const { error } = await supabase
            .from('sales')
            .update({ customer_id: customer?.id || null })
            .eq('id', selectedSale.id);

        setIsSavingCustomer(false);

        if (error) {
            setCustomerError(error.message || 'Failed to update customer');
            return;
        }

        setSelectedSale({
            ...selectedSale,
            customer_id: customer?.id || null,
            customer: customer || undefined,
        });
        setCustomerSearch('');
        setCustomerResults([]);
        setShowCustomerDropdown(false);
        await refetch();
    };

    const handleCreateCustomer = async () => {
        if (!newCustomerData.name.trim()) return;

        setIsSavingCustomer(true);
        setCustomerError(null);
        const { data, error } = await createCustomer(newCustomerData);
        setIsSavingCustomer(false);

        if (error || !data) {
            setCustomerError(error || 'Failed to create customer');
            return;
        }

        setShowNewCustomerModal(false);
        setNewCustomerData({ name: '', email: null, phone: null, notes: null, accepts_marketing: false });
        await attachCustomerToSelectedSale(data);
    };

    const updateDenominationCount = (key: string, value: string) => {
        if (value !== '' && !/^\d+$/.test(value)) return;
        setDenominationCounts((prev) => ({ ...prev, [key]: value }));
    };

    const resetCashCount = () => {
        setDenominationCounts(
            CASH_DENOMINATIONS.reduce<Record<string, string>>((acc, denomination) => {
                acc[denomination.key] = '';
                return acc;
            }, {})
        );
        setCheckCountInput('');
        setCheckAmountInput('');
    };

    const buildDenominationBreakdown = () =>
        CASH_DENOMINATIONS.map((denomination) => {
            const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
            return {
                label: denomination.label,
                quantity,
                amount: quantity * denomination.value,
            };
        });

    const handleSendTillEmail = async () => {
        const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId);
        if (!selectedAdmin) {
            toast.error('Select an admin first');
            return;
        }

        setIsSendingTillEmail(true);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const countedAt = new Date().toISOString();
        const { error: invokeError } = await supabase.functions.invoke('send-till-count-report', {
            body: {
                adminEmail: selectedAdmin.email,
                adminName: selectedAdmin.full_name || selectedAdmin.email,
                employeeName: userRecord?.full_name || userRecord?.email || 'Admin',
                report: {
                    countedAt,
                    expectedFromSales: cashReconciliation.expectedCashFromSales,
                    checkCount: cashReconciliation.checkCount,
                    checkTotal: cashReconciliation.checkTotal,
                    openingFloat: cashReconciliation.openingFloat,
                    manualAdjustment: cashReconciliation.manualAdjustment,
                    expectedDrawerTotal: cashReconciliation.expectedDrawerTotal,
                    countedTotal: cashReconciliation.countedTotal,
                    variance: cashReconciliation.variance,
                    denominationBreakdown: buildDenominationBreakdown(),
                },
                timezone,
            },
        });
        setIsSendingTillEmail(false);

        if (invokeError) {
            toast.error('Failed to send till report', invokeError.message);
            return;
        }

        toast.success('Till report sent', `Sent to ${selectedAdmin.full_name || selectedAdmin.email}`);
    };

    const handlePrintTillReceipt = async () => {
        const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId);
        const result = await printTillCountReceipt(
            {
                submittedBy: userRecord?.full_name || userRecord?.email || 'Admin',
                recipientName: selectedAdmin?.full_name || selectedAdmin?.email,
            },
            {
                countedAt: new Date().toISOString(),
                expectedFromSales: cashReconciliation.expectedCashFromSales,
                checkCount: cashReconciliation.checkCount,
                checkTotal: cashReconciliation.checkTotal,
                openingFloat: cashReconciliation.openingFloat,
                manualAdjustment: cashReconciliation.manualAdjustment,
                expectedDrawerTotal: cashReconciliation.expectedDrawerTotal,
                countedTotal: cashReconciliation.countedTotal,
                variance: cashReconciliation.variance,
                denominationBreakdown: buildDenominationBreakdown(),
            }
        );

        if (!result.success) {
            toast.error('Failed to print till receipt', result.error || 'Please try again.');
            return;
        }

        toast.success('Print dialog opened');
    };

    const buildExportFilename = (mode: 'itemized' | 'summary') => {
        const dateFilterLabel = filterDatePreset === 'custom'
            ? `${customDateFrom}_to_${customDateTo}`
            : filterDatePreset;
        const generatedOn = toLocalDateInput(new Date());
        return `sales-export-${mode}-${dateFilterLabel}-${generatedOn}.csv`;
    };

    const downloadCsv = (filename: string, rows: string[]) => {
        const csvContent = `\uFEFF${rows.join('\n')}`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExportSalesCsvItemized = () => {
        if (filteredSales.length === 0) return;

        const headers = [
            'Sale Date',
            'Sale Time',
            'Receipt #',
            'Sale ID',
            'Payment Method',
            'Check Number',
            'Customer Name',
            'Customer Email',
            'Customer Phone',
            'Refund Status',
            'Sale Subtotal',
            'Sale Tax',
            'Sale Total',
            'Item SKU',
            'Item Name',
            'Item Quantity',
            'Item Unit Price',
            'Item Line Total',
            'Consignor Number',
            'Consignor Name',
            'Commission %',
            'Consignor Share',
            'Store Share',
        ];

        const rows: string[] = [headers.map(escapeCsvValue).join(',')];

        for (const sale of filteredSales) {
            const saleDate = new Date(sale.completed_at);
            const saleDateLabel = saleDate.toLocaleDateString();
            const saleTimeLabel = saleDate.toLocaleTimeString();
            const receiptNumber = sale.id.slice(0, 8);
            const paymentMethod = formatPaymentMethod(sale.payment_method);
            const refundStatus = sale.refund_status ?? 'none';
            const saleItems = sale.items.length > 0 ? sale.items : [null];

            for (const item of saleItems) {
                const quantity = item ? item.quantity : 0;
                const unitPrice = item ? Number(item.price) : 0;
                const lineTotal = quantity * unitPrice;
                const commissionSplit = item ? Number(item.commission_split) : 0;
                const consignorShare = lineTotal * commissionSplit;
                const storeShare = lineTotal - consignorShare;

                const rowValues = [
                    saleDateLabel,
                    saleTimeLabel,
                    receiptNumber,
                    sale.id,
                    paymentMethod,
                    sale.check_number ?? '',
                    sale.customer?.name ?? '',
                    sale.customer?.email ?? '',
                    sale.customer?.phone ?? '',
                    refundStatus,
                    Number(sale.subtotal).toFixed(2),
                    Number(sale.tax_amount).toFixed(2),
                    Number(sale.total).toFixed(2),
                    item?.sku ?? '',
                    item?.name ?? '',
                    quantity,
                    item ? unitPrice.toFixed(2) : '',
                    item ? lineTotal.toFixed(2) : '',
                    item?.consignor?.consignor_number ?? '',
                    item?.consignor?.name ?? '',
                    item ? (commissionSplit * 100).toFixed(2) : '',
                    item ? consignorShare.toFixed(2) : '',
                    item ? storeShare.toFixed(2) : '',
                ];

                rows.push(rowValues.map(escapeCsvValue).join(','));
            }
        }

        downloadCsv(buildExportFilename('itemized'), rows);
        setShowExportModal(false);
    };

    const handleExportSalesCsvSummary = () => {
        if (filteredSales.length === 0) return;

        const headers = [
            'Sale Date',
            'Sale Time',
            'Receipt #',
            'Sale ID',
            'Payment Method',
            'Check Number',
            'Customer Name',
            'Customer Email',
            'Customer Phone',
            'Refund Status',
            'Item Count',
            'Total Quantity',
            'Sale Subtotal',
            'Sale Tax',
            'Sale Total',
            'Consignor Share',
            'Store Share',
            'Consignors',
        ];

        const rows: string[] = [headers.map(escapeCsvValue).join(',')];

        for (const sale of filteredSales) {
            const saleDate = new Date(sale.completed_at);
            const saleDateLabel = saleDate.toLocaleDateString();
            const saleTimeLabel = saleDate.toLocaleTimeString();
            const receiptNumber = sale.id.slice(0, 8);
            const paymentMethod = formatPaymentMethod(sale.payment_method);
            const refundStatus = sale.refund_status ?? 'none';
            const itemCount = sale.items.length;
            const totalQuantity = sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            const summary = calculateSalesSummary(sale);

            const rowValues = [
                saleDateLabel,
                saleTimeLabel,
                receiptNumber,
                sale.id,
                paymentMethod,
                sale.check_number ?? '',
                sale.customer?.name ?? '',
                sale.customer?.email ?? '',
                sale.customer?.phone ?? '',
                refundStatus,
                itemCount,
                totalQuantity,
                Number(sale.subtotal).toFixed(2),
                Number(sale.tax_amount).toFixed(2),
                Number(sale.total).toFixed(2),
                Number(summary.consignorShare).toFixed(2),
                Number(summary.storeShare).toFixed(2),
                summary.consignorNames.join(' | '),
            ];

            rows.push(rowValues.map(escapeCsvValue).join(','));
        }

        downloadCsv(buildExportFilename('summary'), rows);
        setShowExportModal(false);
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Sales History"
                description={
                    activeTab === 'refunds'
                        ? `${filteredRefunds.length} refund${filteredRefunds.length !== 1 ? 's' : ''}`
                        : activeTab === 'employeeAttribution'
                            ? `${filteredSalesTotalCount} transaction${filteredSalesTotalCount !== 1 ? 's' : ''} in selected period`
                            : `${filteredSalesTotalCount} transaction${filteredSalesTotalCount !== 1 ? 's' : ''}`
                }
            />

            {/* Tabs */}
            <div className="mb-6">
                <Tabs
                    tabs={[
                        { id: 'sales', label: 'Sales', icon: <ReceiptSmallIcon /> },
                        { id: 'refunds', label: 'Refunds', icon: <RefundTabIcon /> },
                        { id: 'employeeAttribution', label: 'By Employee', icon: <EmployeesAttributionIcon /> },
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as SalesTab)}
                    className="max-w-md"
                />
            </div>

            {/* Summary Cards - Only show for sales tab */}
            {activeTab === 'sales' && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                        <SummaryCard label="Net Sales" value={formatCurrency(totals.total)} />
                        <SummaryCard label="Refunded" value={`-${formatCurrency(totals.totalRefunded)}`} variant="danger" />
                        <SummaryCard label="Tax Collected" value={formatCurrency(totals.tax)} />
                        <SummaryCard label="Consignor Payouts" value={formatCurrency(totals.consignorShare)} variant="success" />
                        <SummaryCard label="Store Revenue" value={formatCurrency(totals.storeShare)} variant="primary" />
                        <SummaryCard label="Gross Sales" value={formatCurrency(totals.subtotal)} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <SummaryCard label="Cash Total" value={formatCurrency(paymentTotals.cashNetTotal)} />
                        <SummaryCard label="Card Total" value={formatCurrency(paymentTotals.cardNetTotal)} />
                        <SummaryCard label="Card Fees" value={`-${formatCurrency(paymentTotals.cardFeeTotal)}`} variant="warning" />
                        <SummaryCard label="Check Total" value={formatCurrency(paymentTotals.checkNetTotal)} />
                    </div>
                    <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <p className="text-xs text-[var(--color-muted)] mb-1">Cash Reconciliation</p>
                            <p className="text-lg font-semibold">
                                Expected From Sales: {formatCurrency(cashReconciliation.expectedCashFromSales)}
                            </p>
                            <p className="text-xs text-[var(--color-muted)]">
                                {cashReconciliation.cashSalesCount} cash sale{cashReconciliation.cashSalesCount !== 1 ? 's' : ''} in current filter
                            </p>
                        </div>
                        <Button variant="secondary" onClick={() => setShowCashReconciliation(true)}>
                            Count Drawer
                        </Button>
                    </div>
                </>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
                <div className="w-48">
                    <Select
                        options={dateRangeOptions}
                        value={filterDatePreset}
                        onChange={(e) => setFilterDatePreset(e.target.value as DatePreset)}
                        selectSize="sm"
                    />
                </div>
                {filterDatePreset === 'custom' && (
                    <>
                        <div className="w-44">
                            <input
                                type="date"
                                value={customDateFrom}
                                onChange={(e) => setCustomDateFrom(e.target.value)}
                                max={customDateTo || undefined}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm"
                            />
                        </div>
                        <div className="w-44">
                            <input
                                type="date"
                                value={customDateTo}
                                onChange={(e) => setCustomDateTo(e.target.value)}
                                min={customDateFrom || undefined}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm"
                            />
                        </div>
                    </>
                )}
                {activeTab === 'sales' && (
                    <div className="w-48">
                        <Select
                            options={consignorOptions}
                            value={filterConsignor}
                            onChange={(e) => setFilterConsignor(e.target.value)}
                            selectSize="sm"
                        />
                    </div>
                )}
                {activeTab === 'sales' && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowExportModal(true)}
                        disabled={isLoading || filteredSalesTotalCount === 0}
                    >
                        Export CSV
                    </Button>
                )}
                {(filterConsignor || filterDatePreset !== 'all') && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setFilterConsignor('');
                            setFilterDatePreset('all');
                            const today = toLocalDateInput(new Date());
                            setCustomDateFrom(today);
                            setCustomDateTo(today);
                        }}
                    >
                        Clear Filters
                    </Button>
                )}
            </div>

            {/* Sales Tab Content */}
            {activeTab === 'sales' && (
                <>
                    {sales.length === 0 && !isLoading ? (
                        <EmptyState
                            icon={<ReceiptIcon />}
                            title="No sales yet"
                            description="Complete your first sale in the Point of Sale to see it here."
                        />
                    ) : isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                        </div>
                    ) : filteredSales.length === 0 ? (
                        <div className="text-center py-12 text-[var(--color-muted)]">
                            No sales match your filters
                        </div>
                    ) : (
                        <div>
                            {/* Header Row */}
                            <div className="bg-[var(--color-surface)] rounded-t-xl border border-[var(--color-border)] px-4 py-2 flex items-center gap-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-[16px]" /> {/* Expand icon spacer */}
                                    <div className="w-[90px] text-xs font-medium text-[var(--color-muted)]">Date</div>
                                    <div className="w-[140px] text-xs font-medium text-[var(--color-muted)]">Receipt #</div>
                                    <div className="w-[120px] text-xs font-medium text-[var(--color-muted)]">Consignor</div>
                                    <div className="w-[100px] text-xs font-medium text-[var(--color-muted)]">Customer</div>
                                    <div className="w-[70px] text-xs font-medium text-[var(--color-muted)]">Status</div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="w-[70px] text-right text-xs font-medium text-[var(--color-muted)]">Subtotal</div>
                                    <div className="w-[50px] text-right text-xs font-medium text-[var(--color-muted)]">Tax</div>
                                    <div className="w-[100px] text-right text-xs font-medium text-[var(--color-muted)]">Commission</div>
                                    <div className="w-[70px] text-right text-xs font-medium text-[var(--color-muted)]">Total</div>
                                </div>
                            </div>
                            {/* Sales List */}
                            <div className="space-y-2 mt-2">
                                {filteredSales.map((sale) => (
                                    <SaleRow
                                        key={sale.id}
                                        sale={sale}
                                        isExpanded={expandedSaleId === sale.id}
                                        onToggle={() => toggleExpand(sale.id)}
                                        onViewReceipt={() => {
                                            setSelectedSale(sale);
                                            setCheckNumberInput(sale.check_number || '');
                                            setPrintError(null);
                                            resetCustomerAttachState();
                                        }}
                                        calculateSalesSummary={calculateSalesSummary}
                                    />
                                ))}
                            </div>
                            {filteredSalesTotalCount > 0 && (
                                <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="text-xs text-[var(--color-muted)]">
                                        Showing {(salesPage - 1) * salesPageSize + 1}-{Math.min(salesPage * salesPageSize, filteredSalesTotalCount)} of {filteredSalesTotalCount}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <label className="text-xs text-[var(--color-muted)] flex items-center gap-2">
                                            Rows
                                            <select
                                                value={salesPageSize}
                                                onChange={(e) => {
                                                    setSalesPageSize(Number(e.target.value));
                                                    setSalesPage(1);
                                                    setExpandedSaleId(null);
                                                }}
                                                className="px-2 py-1 rounded border border-[var(--color-border)] bg-white text-xs"
                                            >
                                                {SALES_PAGE_SIZE_OPTIONS.map((size) => (
                                                    <option key={size} value={size}>
                                                        {size}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => {
                                                    setSalesPage((prev) => Math.max(1, prev - 1));
                                                    setExpandedSaleId(null);
                                                }}
                                                disabled={salesPage === 1}
                                            >
                                                Previous
                                            </Button>
                                            <span className="text-xs text-[var(--color-muted)] min-w-[80px] text-center">
                                                Page {salesPage} of {salesTotalPages}
                                            </span>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => {
                                                    setSalesPage((prev) => Math.min(salesTotalPages, prev + 1));
                                                    setExpandedSaleId(null);
                                                }}
                                                disabled={salesPage === salesTotalPages}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Refunds Tab Content */}
            {activeTab === 'refunds' && (
                <>
                    {filteredRefunds.length === 0 && !isLoadingRefunds ? (
                        <EmptyState
                            icon={<RefundTabIcon />}
                            title="No refunds yet"
                            description={filterDatePreset === 'all' ? 'Refunds processed from the POS will appear here.' : 'No refunds match your date filter.'}
                        />
                    ) : isLoadingRefunds ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredRefunds.map((refund) => (
                                <RefundRow key={refund.id} refund={refund} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Employee Attribution Tab Content */}
            {activeTab === 'employeeAttribution' && (
                <>
                    {sales.length === 0 && !isLoading ? (
                        <EmptyState
                            icon={<EmployeesAttributionIcon />}
                            title="No sales yet"
                            description="Complete sales in the POS to view employee attribution."
                        />
                    ) : isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                        </div>
                    ) : employeeAttribution.rows.length === 0 ? (
                        <div className="text-center py-12 text-[var(--color-muted)]">
                            No sales match your date filter
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <SummaryCard
                                    label="Employees"
                                    value={String(employeeAttribution.attributedEmployees.length)}
                                />
                                <SummaryCard
                                    label="Admin Users"
                                    value={String(employeeAttribution.attributedAdmins.length)}
                                />
                                <SummaryCard
                                    label="Attributed Sales"
                                    value={String(
                                        employeeAttribution.rows.reduce((sum, row) => sum + row.salesCount, 0)
                                    )}
                                />
                                <SummaryCard
                                    label="Attributed Revenue"
                                    value={formatCurrency(
                                        employeeAttribution.rows.reduce((sum, row) => sum + row.grossSales, 0)
                                    )}
                                />
                            </div>

                            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-white">
                                <table className="w-full text-sm">
                                    <thead className="bg-[var(--color-surface)]">
                                        <tr>
                                            <th className="text-left px-4 py-2 font-medium text-[var(--color-muted)]">Team Member</th>
                                            <th className="text-right px-4 py-2 font-medium text-[var(--color-muted)]">Sales Count</th>
                                            <th className="text-right px-4 py-2 font-medium text-[var(--color-muted)]">Gross Sales</th>
                                            <th className="text-right px-4 py-2 font-medium text-[var(--color-muted)]">Avg Ticket</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employeeAttribution.rows.map((row) => (
                                            <tr key={row.employeeId || row.userId || 'unattributed'} className="border-t border-[var(--color-border)]">
                                                <td className="px-4 py-3">
                                                    <div className="inline-flex items-center gap-2">
                                                        <span className={
                                                        row.actorType === 'admin'
                                                                ? 'text-[var(--color-primary)] font-medium'
                                                                : ''
                                                        }>
                                                            {row.employeeName}
                                                        </span>
                                                        {row.actorType === 'admin' && <Badge variant="info">Admin</Badge>}
                                                        {row.actorType === 'employee' && <Badge variant="default">Employee</Badge>}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">{row.salesCount}</td>
                                                <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.grossSales)}</td>
                                                <td className="px-4 py-3 text-right">{formatCurrency(row.averageTicket)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Receipt Preview Modal */}
            <Modal
                isOpen={!!selectedSale}
                onClose={() => {
                    setSelectedSale(null);
                    setCheckNumberInput('');
                    setPrintError(null);
                    resetCustomerAttachState();
                }}
                title="Receipt Preview"
                size="3xl"
            >
                {selectedSale && (() => {
                    // Calculate refund amounts for this sale
                    const saleRefunds = refunds.filter(r => r.sale_id === selectedSale.id);
                    const refundedItemQty: Record<string, number> = {};
                    let totalRefundedAmount = 0;

                    for (const refund of saleRefunds) {
                        totalRefundedAmount += Number(refund.refund_amount);
                        const items = refund.items as Array<{ sale_item_id: string; quantity: number }>;
                        for (const item of items) {
                            refundedItemQty[item.sale_item_id] = (refundedItemQty[item.sale_item_id] || 0) + item.quantity;
                        }
                    }

                    const hasRefunds = totalRefundedAmount > 0;
                    const summary = calculateSalesSummary(selectedSale);

                    // Calculate adjusted commission split
                    const refundRatio = selectedSale.subtotal > 0 ? totalRefundedAmount / selectedSale.subtotal : 0;
                    const adjustedConsignorShare = summary.consignorShare * (1 - refundRatio);
                    const adjustedStoreShare = summary.storeShare * (1 - refundRatio);

                    return (
                        <div className="space-y-4">
                            {/* Sale Header */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <p className="text-xs text-[var(--color-muted)]">Receipt #</p>
                                        <p className="font-mono text-sm">{selectedSale.id.slice(0, 8)}</p>
                                    </div>
                                    {selectedSale.refund_status === 'full' && (
                                        <Badge variant="danger">Fully Refunded</Badge>
                                    )}
                                    {selectedSale.refund_status === 'partial' && (
                                        <Badge variant="warning">Partial Refund</Badge>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-[var(--color-muted)]">Date</p>
                                    <p className="text-sm">
                                        {new Date(selectedSale.completed_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            {printError && (
                                <p className="text-sm text-[var(--color-danger)]">
                                    {printError}
                                </p>
                            )}

                            {/* Customer Info */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">Customer</p>
                                    {isSavingCustomer && (
                                        <span className="text-xs text-[var(--color-muted)] flex items-center gap-2">
                                            <LoadingSpinner size={14} />
                                            Saving...
                                        </span>
                                    )}
                                </div>
                                {selectedSale.customer ? (
                                    <div className="bg-[var(--color-primary)]/5 rounded-lg p-3 border border-[var(--color-primary)]/20">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{selectedSale.customer.name}</p>
                                                {(selectedSale.customer.phone || selectedSale.customer.email) && (
                                                    <p className="text-sm text-[var(--color-muted)]">
                                                        {selectedSale.customer.phone}
                                                        {selectedSale.customer.phone && selectedSale.customer.email && ' • '}
                                                        {selectedSale.customer.email}
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => attachCustomerToSelectedSale(null)}
                                                disabled={isSavingCustomer}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-[var(--color-muted)]">
                                        No customer attached.
                                    </p>
                                )}

                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            placeholder={selectedSale.customer ? 'Replace customer...' : 'Search by name, phone, or email...'}
                                            leftIcon={isSearchingCustomer ? <LoadingSpinner size={16} /> : <SearchIcon />}
                                        />
                                        {showCustomerDropdown && customerResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] z-50 max-h-48 overflow-y-auto">
                                                {customerResults.map((customer) => (
                                                    <button
                                                        key={customer.id}
                                                        onClick={() => attachCustomerToSelectedSale(customer)}
                                                        className="w-full px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
                                                    >
                                                        <p className="font-medium text-sm">{customer.name}</p>
                                                        <p className="text-xs text-[var(--color-muted)]">
                                                            {customer.phone || customer.email || 'No contact'}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showCustomerDropdown && customerResults.length === 0 && customerSearch.length >= 2 && !isSearchingCustomer && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] z-50 p-3">
                                                <p className="text-sm text-[var(--color-muted)] mb-2">No customers found</p>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        setNewCustomerData({ name: customerSearch, email: null, phone: null, notes: null, accepts_marketing: false });
                                                        setShowNewCustomerModal(true);
                                                        setShowCustomerDropdown(false);
                                                    }}
                                                >
                                                    + Add "{customerSearch}"
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setNewCustomerData({ name: '', email: null, phone: null, notes: null, accepts_marketing: false });
                                            setShowNewCustomerModal(true);
                                        }}
                                        className="shrink-0"
                                        title="Create New Customer"
                                    >
                                        <UserPlusIcon />
                                    </Button>
                                </div>
                                {customerError && (
                                    <p className="text-sm text-[var(--color-danger)]">{customerError}</p>
                                )}
                            </div>

                            {/* Line Items */}
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Items</h4>
                                <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-[var(--color-surface)]">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-medium">Item</th>
                                                <th className="text-left px-3 py-2 font-medium">Consignor</th>
                                                <th className="text-center px-3 py-2 font-medium">Qty</th>
                                                <th className="text-right px-3 py-2 font-medium">Price</th>
                                                <th className="text-right px-3 py-2 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedSale.items.map((item, idx) => {
                                                const refundedQty = refundedItemQty[item.id] || 0;
                                                const isFullyRefunded = refundedQty >= item.quantity;
                                                const isPartiallyRefunded = refundedQty > 0 && refundedQty < item.quantity;

                                                return (
                                                    <tr
                                                        key={idx}
                                                        className={`border-t border-[var(--color-border)] ${isFullyRefunded ? 'bg-[var(--color-danger)]/5' : ''}`}
                                                    >
                                                        <td className={`px-3 py-2 ${isFullyRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                            {item.name}
                                                        </td>
                                                        <td className={`px-3 py-2 text-[var(--color-muted)] ${isFullyRefunded ? 'line-through' : ''}`}>
                                                            {item.consignor?.name || '—'}
                                                        </td>
                                                        <td className={`px-3 py-2 text-center ${isFullyRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                            {item.quantity}
                                                            {isPartiallyRefunded && (
                                                                <span className="text-xs text-[var(--color-danger)] block">
                                                                    (-{refundedQty})
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right ${isFullyRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                            {formatCurrency(Number(item.price))}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            {isFullyRefunded ? (
                                                                <Badge variant="danger">Refunded</Badge>
                                                            ) : isPartiallyRefunded ? (
                                                                <Badge variant="warning">Partial</Badge>
                                                            ) : (
                                                                <Badge variant="success">Paid</Badge>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Totals - Side by Side for Original vs Adjusted */}
                            <div className={`grid ${hasRefunds ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                                {/* Original Totals */}
                                <div className={`border border-[var(--color-border)] rounded-lg p-3 ${hasRefunds ? 'opacity-60' : ''}`}>
                                    <p className="text-xs font-medium text-[var(--color-muted)] mb-2">
                                        {hasRefunds ? 'Original' : 'Totals'}
                                    </p>
                                    <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-muted)]">Subtotal</span>
                                            <span className={hasRefunds ? 'line-through' : ''}>{formatCurrency(selectedSale.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-muted)]">Tax</span>
                                            <span className={hasRefunds ? 'line-through' : ''}>{formatCurrency(selectedSale.tax_amount)}</span>
                                        </div>
                                        <div className="flex justify-between font-semibold pt-1 border-t border-[var(--color-border)]">
                                            <span>Total</span>
                                            <span className={hasRefunds ? 'line-through' : ''}>{formatCurrency(selectedSale.total)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Adjusted Totals (only show if refunds exist) */}
                                {hasRefunds && (
                                    <div className="border-2 border-[var(--color-primary)] rounded-lg p-3 bg-[var(--color-primary)]/5">
                                        <p className="text-xs font-medium text-[var(--color-primary)] mb-2">After Refunds</p>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                                <span>{formatCurrency(selectedSale.subtotal - totalRefundedAmount)}</span>
                                            </div>
                                            <div className="flex justify-between text-[var(--color-danger)]">
                                                <span>Refunded</span>
                                                <span>-{formatCurrency(totalRefundedAmount)}</span>
                                            </div>
                                            <div className="flex justify-between font-semibold pt-1 border-t border-[var(--color-primary)]/30">
                                                <span>Net Total</span>
                                                <span className="text-[var(--color-primary)]">
                                                    {formatCurrency(selectedSale.total - totalRefundedAmount)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Commission Breakdown - Side by Side */}
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <h4 className="text-sm font-semibold mb-2">Commission Split</h4>
                                <div className={`grid ${hasRefunds ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                                    {/* Original Commission */}
                                    <div className={hasRefunds ? 'opacity-60' : ''}>
                                        {hasRefunds && <p className="text-xs text-[var(--color-muted)] mb-1">Original</p>}
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Consignor</span>
                                                <span className={`font-medium ${hasRefunds ? 'line-through' : 'text-[var(--color-success)]'}`}>
                                                    {formatCurrency(summary.consignorShare)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Store</span>
                                                <span className={`font-medium ${hasRefunds ? 'line-through' : ''}`}>
                                                    {formatCurrency(summary.storeShare)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Adjusted Commission */}
                                    {hasRefunds && (
                                        <div>
                                            <p className="text-xs text-[var(--color-primary)] mb-1">After Refunds</p>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-[var(--color-muted)]">Consignor</span>
                                                    <span className="font-medium text-[var(--color-success)]">
                                                        {formatCurrency(adjustedConsignorShare)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[var(--color-muted)]">Store</span>
                                                    <span className="font-medium">
                                                        {formatCurrency(adjustedStoreShare)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="text-sm text-[var(--color-muted)] space-y-2">
                                <div>
                                    Payment Method: <span className="font-medium text-[var(--color-foreground)]">{formatPaymentMethod(selectedSale.payment_method)}</span>
                                </div>
                                {selectedSale.payment_method === 'card' && (
                                    <div>
                                        Card Fee: {formatCurrency(Number(selectedSale.card_fee_amount || 0))}
                                    </div>
                                )}
                                {selectedSale.cash_tendered !== null && (
                                    <div className="flex gap-4">
                                        <span>Cash Tendered: {formatCurrency(selectedSale.cash_tendered)}</span>
                                        <span>Change Given: {formatCurrency(selectedSale.change_given || 0)}</span>
                                    </div>
                                )}
                                {selectedSale.payment_method === 'check' && (
                                    <div className="flex items-end gap-2 max-w-sm">
                                        <Input
                                            label="Check Number"
                                            value={checkNumberInput}
                                            onChange={(e) => setCheckNumberInput(e.target.value)}
                                            placeholder="Enter check #"
                                        />
                                        <Button
                                            size="sm"
                                            onClick={handleSaveCheckNumber}
                                            isLoading={isSavingCheckNumber}
                                        >
                                            Save
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
                <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={handlePrintSelectedReceipt}
                        isLoading={isPrintingReceipt}
                    >
                        <PrinterSmallIcon />
                        Print Receipt
                    </Button>
                    <Button variant="secondary" onClick={() => {
                        setSelectedSale(null);
                        setCheckNumberInput('');
                        setPrintError(null);
                        resetCustomerAttachState();
                    }}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                title="Export Sales CSV"
                size="md"
            >
                <div className="space-y-3">
                    <p className="text-sm text-[var(--color-muted)]">
                        Choose export format:
                    </p>
                    <button
                        type="button"
                        onClick={handleExportSalesCsvItemized}
                        className="w-full text-left rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface)] transition-colors"
                    >
                        <p className="font-medium text-sm">Itemized (Current)</p>
                        <p className="text-xs text-[var(--color-muted)] mt-1">
                            One row per sale item, including SKU, item name, quantity, and commission splits.
                        </p>
                    </button>
                    <button
                        type="button"
                        onClick={handleExportSalesCsvSummary}
                        className="w-full text-left rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface)] transition-colors"
                    >
                        <p className="font-medium text-sm">One Row Per Sale (New)</p>
                        <p className="text-xs text-[var(--color-muted)] mt-1">
                            One row per sale with totals, payment method, customer, item count, and consignor summary.
                        </p>
                    </button>
                </div>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setShowExportModal(false)}>
                        Cancel
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={showCashReconciliation}
                onClose={() => setShowCashReconciliation(false)}
                title="Cash Drawer Reconciliation"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <SummaryCard
                            label="Expected Cash From Sales"
                            value={formatCurrency(cashReconciliation.expectedCashFromSales)}
                        />
                        <SummaryCard
                            label="Cash Refunds"
                            value={`-${formatCurrency(cashReconciliation.cashRefunds)}`}
                            variant="danger"
                        />
                        <SummaryCard
                            label="Cash Sales (Count)"
                            value={String(cashReconciliation.cashSalesCount)}
                        />
                        <SummaryCard
                            label="Check Qty"
                            value={String(cashReconciliation.checkCount)}
                        />
                        <SummaryCard
                            label="Check Amount"
                            value={formatCurrency(cashReconciliation.checkTotal)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Opening Float"
                            type="number"
                            min="0"
                            step="0.01"
                            value={openingFloatInput}
                            onChange={(e) => setOpeningFloatInput(e.target.value)}
                            placeholder="0.00"
                        />
                        <Input
                            label="Manual Adjustment (+/-)"
                            type="number"
                            step="0.01"
                            value={manualCashAdjustmentInput}
                            onChange={(e) => setManualCashAdjustmentInput(e.target.value)}
                            placeholder="0.00"
                        />
                        <Input
                            label="Check Qty (Manual)"
                            type="number"
                            min="0"
                            step="1"
                            value={checkCountInput}
                            onChange={(e) => setCheckCountInput(e.target.value)}
                            placeholder="0"
                        />
                        <Input
                            label="Check Amount (Manual)"
                            type="number"
                            min="0"
                            step="0.01"
                            value={checkAmountInput}
                            onChange={(e) => setCheckAmountInput(e.target.value)}
                            placeholder="0.00"
                        />
                    </div>

                    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--color-surface)]">
                                <tr>
                                    <th className="text-left px-3 py-2 font-medium">Denomination</th>
                                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {CASH_DENOMINATIONS.map((denomination) => {
                                    const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
                                    const amount = quantity * denomination.value;

                                    return (
                                        <tr key={denomination.key} className="border-t border-[var(--color-border)]">
                                            <td className="px-3 py-2">{denomination.label}</td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    value={denominationCounts[denomination.key]}
                                                    onChange={(e) => updateDenominationCount(denomination.key, e.target.value)}
                                                    placeholder="0"
                                                    className="w-20 ml-auto px-2 py-1 rounded border border-[var(--color-border)] text-right"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(amount)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
                        <div className="flex justify-between text-sm">
                            <span className="text-[var(--color-muted)]">Expected Drawer Total</span>
                            <span className="font-medium">{formatCurrency(cashReconciliation.expectedDrawerTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-[var(--color-muted)]">Counted Drawer Total</span>
                            <span className="font-medium">{formatCurrency(cashReconciliation.countedTotal)}</span>
                        </div>
                        <div className="flex justify-between text-base mt-2 pt-2 border-t border-[var(--color-border)]">
                            <span className="font-medium">Over / Short</span>
                            <span
                                className={`font-semibold ${
                                    cashReconciliation.variance > 0
                                        ? 'text-[var(--color-success)]'
                                        : cashReconciliation.variance < 0
                                            ? 'text-[var(--color-danger)]'
                                            : 'text-[var(--color-foreground)]'
                                }`}
                            >
                                {cashReconciliation.variance > 0 ? '+' : ''}
                                {formatCurrency(cashReconciliation.variance)}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <Select
                            label="Email Till Report To"
                            options={[
                                { value: '', label: admins.length > 0 ? 'Select admin' : 'No admins available' },
                                ...admins.map((admin) => ({
                                    value: admin.id,
                                    label: admin.full_name?.trim() || admin.email,
                                })),
                            ]}
                            value={selectedAdminId}
                            onChange={(event) => setSelectedAdminId(event.target.value)}
                            disabled={admins.length === 0}
                        />
                        <div className="flex gap-2 justify-start md:justify-end">
                            <Button
                                variant="secondary"
                                onClick={handlePrintTillReceipt}
                            >
                                Print Till Receipt
                            </Button>
                            <Button
                                onClick={handleSendTillEmail}
                                isLoading={isSendingTillEmail}
                                disabled={!selectedAdminId || isSendingTillEmail}
                            >
                                Email Till Receipt
                            </Button>
                        </div>
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={resetCashCount}>
                        Clear Counts
                    </Button>
                    <Button variant="secondary" onClick={() => setShowCashReconciliation(false)}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={showNewCustomerModal}
                onClose={() => setShowNewCustomerModal(false)}
                title="Add New Customer"
                size="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Name *"
                        value={newCustomerData.name}
                        onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                        placeholder="Customer name"
                    />
                    <Input
                        label="Phone"
                        value={newCustomerData.phone || ''}
                        onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value || null })}
                        placeholder="(555) 123-4567"
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={newCustomerData.email || ''}
                        onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value || null })}
                        placeholder="customer@example.com"
                    />
                    <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                        <input
                            type="checkbox"
                            checked={newCustomerData.accepts_marketing}
                            onChange={(e) => setNewCustomerData({ ...newCustomerData, accepts_marketing: e.target.checked })}
                            className="h-4 w-4 rounded border-[var(--color-border)]"
                        />
                        Accepts marketing emails
                    </label>
                    <div className="flex gap-3 pt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setShowNewCustomerModal(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateCustomer}
                            disabled={!newCustomerData.name.trim() || isSavingCustomer}
                            isLoading={isSavingCustomer}
                            className="flex-1"
                        >
                            Add Customer
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

// Individual Sale Row Component with expandable details
function SaleRow({
    sale,
    isExpanded,
    onToggle,
    onViewReceipt,
    calculateSalesSummary,
}: {
    sale: SaleWithItems;
    isExpanded: boolean;
    onToggle: () => void;
    onViewReceipt: () => void;
    calculateSalesSummary: (sale: SaleWithItems) => { consignorNames: string[]; consignorShare: number; storeShare: number };
}) {
    const summary = calculateSalesSummary(sale);
    const consignorDisplay = summary.consignorNames.length > 1
        ? 'Multiple'
        : summary.consignorNames[0] || '—';

    return (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            {/* Main Row - Clickable Header */}
            <button
                onClick={onToggle}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface-hover)] transition-colors text-left gap-4"
            >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Expand Icon */}
                    <div className={`w-[16px] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronIcon />
                    </div>

                    {/* Date & Time */}
                    <div className="w-[90px] flex-shrink-0">
                        <p className="font-medium text-[var(--color-foreground)] text-sm">
                            {new Date(sale.completed_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                            {new Date(sale.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    {/* Receipt # & Items Count */}
                    <div className="w-[140px] flex-shrink-0 flex items-center gap-2">
                        <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                            {sale.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-[var(--color-muted)]">
                            {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Consignor */}
                    <div className="w-[120px] flex-shrink-0 truncate">
                        {summary.consignorNames.length > 1 ? (
                            <Badge variant="warning">Multiple</Badge>
                        ) : (
                            <span className="text-sm truncate">{consignorDisplay}</span>
                        )}
                    </div>

                    {/* Customer */}
                    <div className="w-[100px] flex-shrink-0 truncate">
                        {sale.customer ? (
                            <span className="text-sm text-[var(--color-primary)] truncate">
                                {sale.customer.name}
                            </span>
                        ) : (
                            <span className="text-xs text-[var(--color-muted)]">Walk-in</span>
                        )}
                    </div>

                    {/* Status Badge */}
                    <div className="w-[70px] flex-shrink-0">
                        {sale.refund_status === 'full' ? (
                            <Badge variant="danger">Refunded</Badge>
                        ) : sale.refund_status === 'partial' ? (
                            <Badge variant="warning">Partial</Badge>
                        ) : (
                            <Badge variant="success">Paid</Badge>
                        )}
                    </div>
                </div>

                {/* Right Side - Totals */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right w-[70px]">
                        <p className="text-sm">{formatCurrency(sale.subtotal)}</p>
                    </div>
                    <div className="text-right w-[50px]">
                        <p className="text-sm">{formatCurrency(sale.tax_amount)}</p>
                    </div>
                    <div className="text-right w-[100px]">
                        <p className="text-sm">
                            <span className="text-[var(--color-success)]">{formatCurrency(summary.consignorShare)}</span>
                            <span className="text-[var(--color-muted)]"> / </span>
                            <span>{formatCurrency(summary.storeShare)}</span>
                        </p>
                    </div>
                    <div className="text-right w-[70px]">
                        <p className="font-semibold">{formatCurrency(sale.total)}</p>
                    </div>
                </div>
            </button>

            {/* Expanded Content - Item Details */}
            {isExpanded && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="px-4 py-3">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[var(--color-muted)] text-xs">
                                    <th className="text-left py-2 font-medium">Item</th>
                                    <th className="text-left py-2 font-medium">SKU</th>
                                    <th className="text-left py-2 font-medium">Consignor</th>
                                    <th className="text-center py-2 font-medium">Qty</th>
                                    <th className="text-right py-2 font-medium">Price</th>
                                    <th className="text-right py-2 font-medium">Split</th>
                                    <th className="text-right py-2 font-medium">Consignor $</th>
                                    <th className="text-right py-2 font-medium">Store $</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sale.items.map((item, idx) => {
                                    const itemTotal = Number(item.price) * item.quantity;
                                    const consignorAmount = itemTotal * item.commission_split;
                                    const storeAmount = itemTotal - consignorAmount;

                                    return (
                                        <tr key={idx} className="border-t border-[var(--color-border)]">
                                            <td className="py-2 font-medium">{item.name}</td>
                                            <td className="py-2">
                                                <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded">
                                                    {item.sku}
                                                </span>
                                            </td>
                                            <td className="py-2 text-[var(--color-muted)]">
                                                {item.consignor?.name || '—'}
                                            </td>
                                            <td className="py-2 text-center">{item.quantity}</td>
                                            <td className="py-2 text-right">{formatCurrency(Number(item.price))}</td>
                                            <td className="py-2 text-right">
                                                <Badge variant="default">
                                                    {Math.round(item.commission_split * 100)}%
                                                </Badge>
                                            </td>
                                            <td className="py-2 text-right text-[var(--color-success)]">
                                                {formatCurrency(consignorAmount)}
                                            </td>
                                            <td className="py-2 text-right">
                                                {formatCurrency(storeAmount)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Payment Info */}
                        <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-sm text-[var(--color-muted)] space-y-1">
                            <div>
                                Payment: {sale.payment_method === 'cash' ? 'Cash' : sale.payment_method === 'check' ? 'Check' : 'Card'}
                            </div>
                            {sale.payment_method === 'card' && (
                                <div>Card Fee: {formatCurrency(Number(sale.card_fee_amount || 0))}</div>
                            )}
                            {sale.cash_tendered !== null && (
                                <div className="flex gap-4">
                                    <span>Cash Tendered: {formatCurrency(sale.cash_tendered)}</span>
                                    <span>Change Given: {formatCurrency(sale.change_given || 0)}</span>
                                </div>
                            )}
                            {sale.payment_method === 'check' && (
                                <div>Check #: {sale.check_number || 'N/A'}</div>
                            )}
                        </div>

                        {/* View Receipt Button */}
                        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex justify-end">
                            <Button size="sm" variant="secondary" onClick={onViewReceipt}>
                                <ReceiptSmallIcon />
                                View Receipt
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Summary Card Component
function SummaryCard({
    label,
    value,
    variant = 'default',
}: {
    label: string;
    value: string;
    variant?: 'default' | 'success' | 'primary' | 'danger' | 'warning';
}) {
    const valueColor =
        variant === 'success'
            ? 'text-[var(--color-success)]'
            : variant === 'primary'
                ? 'text-[var(--color-primary)]'
                : variant === 'danger'
                    ? 'text-[var(--color-danger)]'
                    : variant === 'warning'
                        ? 'text-[var(--color-warning)]'
                    : 'text-[var(--color-foreground)]';

    return (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-lg font-semibold ${valueColor}`}>{value}</p>
        </div>
    );
}

// Icons
function ReceiptIcon() {
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
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

// RefundRow Component for refunds tab
function RefundRow({ refund }: { refund: RefundWithDetails }) {
    const items = refund.items as Array<{ name: string; quantity: number; restocked: boolean }>;

    return (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    {/* Date & Time */}
                    <div className="min-w-[120px]">
                        <p className="font-medium text-[var(--color-foreground)]">
                            {new Date(refund.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                            {new Date(refund.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    {/* Refund # */}
                    <div className="min-w-[100px]">
                        <span className="font-mono text-xs bg-[var(--color-danger)]/10 text-[var(--color-danger)] px-2 py-1 rounded">
                            {refund.id.slice(0, 8)}
                        </span>
                    </div>

                    {/* Original Sale # */}
                    <div className="text-sm">
                        <span className="text-[var(--color-muted)]">Original: </span>
                        <span className="font-mono text-xs">{refund.sale_id.slice(0, 8)}</span>
                    </div>

                    {/* Customer */}
                    <div className="min-w-[100px]">
                        {refund.customer ? (
                            <span className="text-sm text-[var(--color-primary)]">
                                {refund.customer.name}
                            </span>
                        ) : (
                            <span className="text-xs text-[var(--color-muted)]">Walk-in</span>
                        )}
                    </div>

                    {/* Items Count */}
                    <div className="text-sm text-[var(--color-muted)]">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Right Side - Total & Method */}
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-xs text-[var(--color-muted)]">Method</p>
                        <Badge variant={refund.payment_method === 'card' ? 'info' : 'default'}>
                            {refund.payment_method.toUpperCase()}
                        </Badge>
                    </div>
                    <div className="text-right min-w-[100px]">
                        <p className="text-xs text-[var(--color-muted)]">Refund Amount</p>
                        <p className="font-semibold text-[var(--color-danger)]">
                            -{formatCurrency(Number(refund.refund_amount))}
                        </p>
                    </div>
                </div>
            </div>

            {/* Items Preview */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-wrap gap-2">
                {items.map((item, idx) => (
                    <span key={idx} className="text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                        {item.quantity}× {item.name}
                        {item.restocked && <span className="text-[var(--color-success)] ml-1">↻</span>}
                    </span>
                ))}
            </div>
        </div>
    );
}

function ChevronIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

function ReceiptSmallIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

function PrinterSmallIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
        </svg>
    );
}

function UserPlusIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
        </svg>
    );
}

function EmployeesAttributionIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function RefundTabIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}
