import { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor as MonitorIcon } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Receipt } from '../components/pos/Receipt';
import { RefundModal } from '../components/pos/RefundModal';
import { DiscountModal } from '../components/pos/DiscountModal';
import { GiftCardSaleModal } from '../components/pos/GiftCardSaleModal';
import { ReceiptDeliveryModal } from '../components/receipt/ReceiptDeliveryModal';
import { InvoiceDeliveryModal } from '../components/invoice/InvoiceDeliveryModal';
import { StripeReaderSetupModal } from '../components/pos/StripeReaderSetupModal';
import { SmartSearch } from '../components/pos/SmartSearch';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useInventory } from '../hooks/useInventory';
import { useInventoryPricingDiscounts } from '../hooks/useInventoryPricingDiscounts';
import { useConsignors } from '../hooks/useConsignors';
import { useSales } from '../hooks/useSales';
import { useInvoices } from '../hooks/useInvoices';
import { useCategories } from '../hooks/useCategories';
import { useCustomers } from '../hooks/useCustomers';
import { useStripeTerminal } from '../hooks/useStripeTerminal';
import { createCartItem, calculateCartTotals, calculateVendorSubtotal } from '../lib/tax';
import { createDiscount, formatDiscountLabel } from '../lib/discounts';
import { calculateCardSurchargeAmount } from '../lib/cardFees';
import { formatCurrency } from '../lib/utils';
import { createReceiptData } from '../lib/printReceipt';
import { createInvoiceEmailDataFromCart } from '../lib/invoice';
import { supabase } from '../lib/supabase';
import { getOfflineSalesSyncStatus, syncOfflineCashSalesQueue } from '../lib/offlineCashSales';
import type { CartItem, Item, Sale, Customer, CustomerInput, PaymentMethod, Discount, DiscountType, Invoice, InvoiceRecipientType } from '../types';
import type { ReceiptData } from '../types/receipt';
import type { InvoiceEmailData } from '../types/invoice';
import type { OfflineSalesSyncStatus } from '../types/offline';

const STRIPE_READER_MODE_KEY = 'ravenpos-stripe-reader-mode';
const STRIPE_READER_LOCATION_KEY = 'ravenpos-stripe-reader-location-id';
const STRIPE_READER_AUTO_RECONNECT_KEY = 'ravenpos-stripe-reader-auto-reconnect';
const STRIPE_READER_PREFERRED_ID_KEY = 'ravenpos-stripe-reader-preferred-id';

export function POS() {
    const { isAdmin, userRecord } = useAuth();
    const { employee } = useEmployee();
    const scannerRef = useRef<HTMLInputElement>(null);
    const { getItemBySku } = useInventory({ autoFetch: false });
    const { getApplicableDiscountForItem } = useInventoryPricingDiscounts();
    const { consignors } = useConsignors();
    const { completeSale, isProcessing } = useSales();
    const { createInvoice, isLoading: isCreatingInvoice } = useInvoices();
    const { searchCustomers, createCustomer, updateCustomer } = useCustomers();

    // Stripe Terminal
    const {
        status: terminalStatus,
        error: terminalError,
        discoveredReaders,
        connectedReader,
        discoverReaders,
        reconnectReaderById,
        registerReaderByCode,
        connectReader,
        disconnectReader,
        collectCardPayment,
    } = useStripeTerminal();

    // Fetch categories to ensure tax rates are synced from database
    useCategories();

    const [cart, setCart] = useState<CartItem[]>(() => {
        const saved = sessionStorage.getItem('ravenpos-cart');
        return saved ? JSON.parse(saved) : [];
    });
    const [scanInput, setScanInput] = useState('');
    const [scanError, setScanError] = useState<string | null>(null);
    const [cashTendered, setCashTendered] = useState<string>('');
    const [completedSale, setCompletedSale] = useState<Sale | null>(null);
    const [completedReceiptData, setCompletedReceiptData] = useState<ReceiptData | null>(null);
    const [completedCart, setCompletedCart] = useState<CartItem[]>([]);
    const [showReceiptDelivery, setShowReceiptDelivery] = useState(false);

    // Invoice state
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [showInvoiceDelivery, setShowInvoiceDelivery] = useState(false);
    const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
    const [completedInvoiceEmail, setCompletedInvoiceEmail] = useState<InvoiceEmailData | null>(null);
    const [invoiceRecipientType, setInvoiceRecipientType] = useState<InvoiceRecipientType>('customer');
    const [selectedInvoiceVendorId, setSelectedInvoiceVendorId] = useState('');
    const [invoiceNote, setInvoiceNote] = useState('');

    // Payment method state
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
    const [checkNumber, setCheckNumber] = useState('');
    const [isCollectingCard, setIsCollectingCard] = useState(false);
    const [showReaderModal, setShowReaderModal] = useState(false);
    const [showReaderSetupModal, setShowReaderSetupModal] = useState(false);
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [showGiftCardSaleModal, setShowGiftCardSaleModal] = useState(false);
    const [showCustomItemModal, setShowCustomItemModal] = useState(false);
    const [showSmartSearch, setShowSmartSearch] = useState(false);
    const [customItemForm, setCustomItemForm] = useState({
        name: '',
        price: '',
        quantity: '1',
        category: 'Other',
        consignorId: '',
    });

    // Discount state
    const [orderDiscounts, setOrderDiscounts] = useState<Discount[]>(() => {
        const saved = sessionStorage.getItem('ravenpos-order-discounts');
        return saved ? JSON.parse(saved) : [];
    });
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [discountTarget, setDiscountTarget] = useState<{
        scope: 'order' | 'item';
        itemIndex?: number;
    } | null>(null);

    // Customer state
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState<Customer[]>([]);
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
    const [useStoreCredit, setUseStoreCredit] = useState(true);
    const [giftCardInput, setGiftCardInput] = useState('');
    const [giftCardError, setGiftCardError] = useState<string | null>(null);
    const [isApplyingGiftCard, setIsApplyingGiftCard] = useState(false);
    const [appliedGiftCard, setAppliedGiftCard] = useState<{ code: string; balance: number } | null>(null);
    const [newCustomerData, setNewCustomerData] = useState<CustomerInput>({
        name: '',
        email: null,
        phone: null,
        notes: null,
        accepts_marketing: false,
    });
    const [readerMode, setReaderMode] = useState<'simulated' | 'live'>(() => {
        if (typeof window === 'undefined') return 'simulated';
        const saved = localStorage.getItem(STRIPE_READER_MODE_KEY);
        return saved === 'live' ? 'live' : 'simulated';
    });
    const [readerLocationId, setReaderLocationId] = useState(() => {
        if (typeof window === 'undefined') return '';
        return localStorage.getItem(STRIPE_READER_LOCATION_KEY) || '';
    });
    const [autoReconnectReader, setAutoReconnectReader] = useState(() => {
        if (typeof window === 'undefined') return true;
        return localStorage.getItem(STRIPE_READER_AUTO_RECONNECT_KEY) !== 'false';
    });
    const [autoReconnectPaused, setAutoReconnectPaused] = useState(false);
    const [hasLoadedSharedReaderSettings, setHasLoadedSharedReaderSettings] = useState(false);
    const [preferredReaderId, setPreferredReaderId] = useState(() => {
        if (typeof window === 'undefined') return '';
        return localStorage.getItem(STRIPE_READER_PREFERRED_ID_KEY) || '';
    });

    const [dealerDiscountEnabled, setDealerDiscountEnabled] = useState(false);
    const [offlineSalesStatus, setOfflineSalesStatus] = useState<OfflineSalesSyncStatus>({
        total: 0,
        pending: 0,
        syncing: 0,
        failed: 0,
    });
    const [isSyncingOfflineSales, setIsSyncingOfflineSales] = useState(false);

    const isElectronRuntime = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
    const isOfflineMode = isElectronRuntime && typeof navigator !== 'undefined' && !navigator.onLine;

    const getDealerDiscountPercentForItem = (item: Item): number => {
        if (!dealerDiscountEnabled) return 0;
        const raw = Number((item.consignor as { dealer_discount_percent?: number } | undefined)?.dealer_discount_percent || 0);
        return Math.max(0, Math.min(100, raw));
    };

    const getAutomaticCatalogDiscount = useCallback((item: Item): Discount | undefined => {
        const applicable = getApplicableDiscountForItem(item);
        if (!applicable) return undefined;

        const scopeLabel = applicable.source.scope === 'item'
            ? `item ${item.name}`
            : `category ${item.category}`;
        const titleLabel = applicable.source.title?.trim();
        const reason = titleLabel
            ? `Catalog discount: ${titleLabel}`
            : `Catalog discount: ${Number(applicable.percentOff).toFixed(2)}% off ${scopeLabel}`;

        return {
            ...createDiscount('percentage', applicable.percentOff, 'item', undefined, reason),
            source: 'catalog',
        };
    }, [getApplicableDiscountForItem]);

    const getDefaultItemDiscount = useCallback((item: Item, existing?: Discount): Discount | undefined => {
        if (existing?.source !== 'catalog') return existing;
        return getAutomaticCatalogDiscount(item);
    }, [getAutomaticCatalogDiscount]);

    const { subtotal, taxTotal, total, itemDiscountTotal, dealerDiscountTotal, discountTotal } = calculateCartTotals(cart, orderDiscounts);
    const alySubtotal = calculateVendorSubtotal(cart, 'ALY');
    const eligibleSubtotalAfterDiscounts = cart.reduce((sum, cartItem) => {
        const consignorPays = (cartItem.item.consignor as { consignor_pays_card_fee?: boolean } | undefined)?.consignor_pays_card_fee ?? false;
        return consignorPays ? sum : sum + cartItem.discountedLineTotal;
    }, 0);
    const subtotalAfterItemDiscounts = cart.reduce((sum, cartItem) => sum + cartItem.discountedLineTotal, 0);
    const cardFeeRatio = subtotalAfterItemDiscounts > 0 ? eligibleSubtotalAfterDiscounts / subtotalAfterItemDiscounts : 0;
    const appliedGiftCardAmount = appliedGiftCard
        ? Math.min(Math.max(0, appliedGiftCard.balance), total)
        : 0;
    const remainingAfterGiftCard = Math.max(0, total - appliedGiftCardAmount);
    const availableStoreCredit = Number(selectedCustomer?.store_credit || 0);
    const appliedStoreCredit = selectedCustomer && useStoreCredit
        ? Math.min(availableStoreCredit, remainingAfterGiftCard)
        : 0;
    const cashPrice = Math.max(0, Math.round((total - appliedGiftCardAmount - appliedStoreCredit) * 100) / 100);
    const cardFeeAmount = calculateCardSurchargeAmount(cashPrice, cardFeeRatio);
    const cardPrice = Math.max(0, Math.round((cashPrice + cardFeeAmount) * 100) / 100);
    const amountDue = paymentMethod === 'card' ? cardPrice : cashPrice;
    const cardFeeDifference = Math.max(0, Math.round((cardPrice - cashPrice) * 100) / 100);
    const cashAmount = parseFloat(cashTendered) || 0;
    const change = cashAmount - amountDue;

    const refreshOfflineSalesStatus = useCallback(async () => {
        if (!isElectronRuntime) return;
        const status = await getOfflineSalesSyncStatus();
        setOfflineSalesStatus(status);
    }, [isElectronRuntime]);

    const runOfflineQueueSync = useCallback(async (failedOnly = false) => {
        if (!isElectronRuntime) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        setIsSyncingOfflineSales(true);
        try {
            await syncOfflineCashSalesQueue({ failedOnly });
        } finally {
            await refreshOfflineSalesStatus();
            setIsSyncingOfflineSales(false);
        }
    }, [isElectronRuntime, refreshOfflineSalesStatus]);

    // Auto-focus scanner input
    useEffect(() => {
        scannerRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!isElectronRuntime) return;

        void refreshOfflineSalesStatus();

        const onOnline = () => {
            void runOfflineQueueSync(false);
        };

        window.addEventListener('online', onOnline);
        const timer = window.setInterval(() => {
            void refreshOfflineSalesStatus();
            if (typeof navigator !== 'undefined' && navigator.onLine) {
                void runOfflineQueueSync(false);
            }
        }, 15000);

        return () => {
            window.removeEventListener('online', onOnline);
            window.clearInterval(timer);
        };
    }, [isElectronRuntime, refreshOfflineSalesStatus, runOfflineQueueSync]);

    useEffect(() => {
        if (!isOfflineMode) return;
        if (paymentMethod !== 'cash') {
            setPaymentMethod('cash');
        }
    }, [isOfflineMode, paymentMethod]);

    useEffect(() => {
        if (!isOfflineMode) return;
        setUseStoreCredit(false);
        setAppliedGiftCard(null);
        setGiftCardInput('');
    }, [isOfflineMode]);

    // Persist cart to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('ravenpos-cart', JSON.stringify(cart));
    }, [cart]);

    // Persist order discounts to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('ravenpos-order-discounts', JSON.stringify(orderDiscounts));
    }, [orderDiscounts]);

    useEffect(() => {
        setCart((prev) =>
            prev.map((cartItem) =>
                createCartItem(
                    cartItem.item,
                    cartItem.quantity,
                    getDefaultItemDiscount(cartItem.item, cartItem.discount),
                    getDealerDiscountPercentForItem(cartItem.item)
                )
            )
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dealerDiscountEnabled]);

    useEffect(() => {
        if (customItemForm.consignorId || consignors.length === 0) return;
        setCustomItemForm((prev) => ({ ...prev, consignorId: consignors[0].id }));
    }, [customItemForm.consignorId, consignors]);

    useEffect(() => {
        localStorage.setItem(STRIPE_READER_MODE_KEY, readerMode);
        localStorage.setItem(STRIPE_READER_LOCATION_KEY, readerLocationId.trim());
        localStorage.setItem(STRIPE_READER_AUTO_RECONNECT_KEY, autoReconnectReader ? 'true' : 'false');
    }, [readerMode, readerLocationId, autoReconnectReader]);

    // Load shared reader setup (store-wide) so employee/admin accounts use the same Stripe location/mode.
    useEffect(() => {
        let isMounted = true;

        const loadSharedReaderSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('pos_terminal_settings')
                    .select('reader_mode, stripe_location_id, auto_reconnect')
                    .eq('id', true)
                    .maybeSingle();

                if (error) {
                    console.error('Failed to load shared POS terminal settings:', error);
                    return;
                }

                if (!isMounted || !data) return;

                const nextMode = data.reader_mode === 'live' ? 'live' : 'simulated';
                const nextLocationId = (data.stripe_location_id || '').trim();
                const nextAutoReconnect = data.auto_reconnect !== false;

                setReaderMode(nextMode);
                setReaderLocationId(nextLocationId);
                setAutoReconnectReader(nextAutoReconnect);
            } finally {
                if (isMounted) {
                    setHasLoadedSharedReaderSettings(true);
                }
            }
        };

        void loadSharedReaderSettings();

        return () => {
            isMounted = false;
        };
    }, []);

    // Persist shared reader setup in DB once an admin has configured it.
    useEffect(() => {
        if (!hasLoadedSharedReaderSettings) return;
        if (!isAdmin) return;

        const syncSharedReaderSettings = async () => {
            const { error } = await supabase
                .from('pos_terminal_settings')
                .upsert({
                    id: true,
                    reader_mode: readerMode,
                    stripe_location_id: readerMode === 'live' ? readerLocationId.trim() : '',
                    auto_reconnect: autoReconnectReader,
                }, { onConflict: 'id' });

            if (error) {
                console.error('Failed to save shared POS terminal settings:', error);
            }
        };

        void syncSharedReaderSettings();
    }, [autoReconnectReader, hasLoadedSharedReaderSettings, isAdmin, readerLocationId, readerMode]);

    useEffect(() => {
        if (!preferredReaderId) return;
        localStorage.setItem(STRIPE_READER_PREFERRED_ID_KEY, preferredReaderId);
    }, [preferredReaderId]);

    useEffect(() => {
        if (!connectedReader) return;
        setPreferredReaderId(connectedReader.id);
        setShowReaderModal(false);
    }, [connectedReader]);

    useEffect(() => {
        if (!autoReconnectReader) return;
        if (autoReconnectPaused) return;
        if (!preferredReaderId.trim()) return;
        if (connectedReader) return;
        if (readerMode === 'live' && !readerLocationId.trim()) return;

        const timer = setTimeout(async () => {
            await reconnectReaderById({
                simulated: readerMode === 'simulated',
                locationId: readerLocationId.trim() || undefined,
                readerId: preferredReaderId.trim(),
            });
        }, 500);

        return () => clearTimeout(timer);
    }, [
        autoReconnectReader,
        autoReconnectPaused,
        connectedReader,
        preferredReaderId,
        readerLocationId,
        readerMode,
        reconnectReaderById,
    ]);

    // Refocus on click anywhere, unless clicking an interactive element
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (completedSale || showCustomItemModal || showSmartSearch) return;

            const target = e.target as HTMLElement;
            const isInteractive =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.tagName === 'OPTION' ||
                target.tagName === 'BUTTON' ||
                target.tagName === 'A' ||
                target.closest('select') ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('[role="button"]'); // Handle semantic buttons

            if (!isInteractive) {
                scannerRef.current?.focus();
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [completedSale, showCustomItemModal, showSmartSearch]);

    // Broadcast cart updates to customer display
    useEffect(() => {
        const channel = new BroadcastChannel('ravenpos-cart');
        channel.postMessage({
            cart,
            subtotal,
            taxTotal,
            discountTotal,
            total,
            cashPrice,
            cardFeeAmount,
            cardPrice,
            amountDue,
            paymentMethod,
            appliedStoreCredit,
            appliedGiftCard: appliedGiftCardAmount,
            orderDiscounts,
            completedSale
        });

        return () => channel.close();
    }, [
        cart,
        subtotal,
        taxTotal,
        discountTotal,
        total,
        cashPrice,
        cardFeeAmount,
        cardPrice,
        amountDue,
        paymentMethod,
        appliedStoreCredit,
        appliedGiftCardAmount,
        orderDiscounts,
        completedSale,
    ]);

    const openCustomerDisplay = () => {
        const isElectron = typeof window !== 'undefined' && (
            window.electronAPI?.isElectron === true || window.location.protocol === 'file:'
        );
        const displayUrl = !isElectron
            ? '/display'
            : window.location.protocol.startsWith('http')
                ? `${window.location.origin}/#/display`
                : `${window.location.href.split('#')[0]}#/display`;
        window.open(displayUrl, 'CustomerDisplay', 'width=1000,height=800,menubar=no,toolbar=no');
    };

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        const sku = scanInput.trim();
        if (!sku) return;

        setScanError(null);

        // Check if item already in cart
        const existingIndex = cart.findIndex((ci) => ci.item.sku === sku);
        if (existingIndex >= 0) {
            // Increment quantity
            const existing = cart[existingIndex];
            if (existing.quantity >= existing.item.quantity) {
                setScanError('No more in stock');
                setScanInput('');
                return;
            }
            const updated = createCartItem(
                existing.item,
                existing.quantity + 1,
                getDefaultItemDiscount(existing.item, existing.discount),
                getDealerDiscountPercentForItem(existing.item)
            );
            setCart((prev) => prev.map((ci, i) => (i === existingIndex ? updated : ci)));
            setScanInput('');
            return;
        }

        // Fetch item
        const { data: item, error } = await getItemBySku(sku);
        if (error || !item) {
            setScanError('Item not found');
            setScanInput('');
            return;
        }

        if (item.quantity <= 0) {
            setScanError('Out of stock');
            setScanInput('');
            return;
        }

        const cartItem = createCartItem(
            item,
            1,
            getAutomaticCatalogDiscount(item),
            getDealerDiscountPercentForItem(item)
        );
        setCart((prev) => [...prev, cartItem]);
        setScanInput('');
    };

    const isCustomSaleItem = (item: Item) => item.is_custom_sale_item === true;

    const openCustomItemModal = () => {
        setScanError(null);
        setCustomItemForm((prev) => ({
            ...prev,
            name: '',
            price: '',
            quantity: '1',
            category: prev.category || 'Other',
            consignorId: prev.consignorId || consignors[0]?.id || '',
        }));
        setShowCustomItemModal(true);
    };

    const handleAddCustomItem = () => {
        const name = customItemForm.name.trim();
        const price = Number(customItemForm.price);
        const quantity = Number(customItemForm.quantity);
        const consignor = consignors.find((c) => c.id === customItemForm.consignorId);

        if (!name) {
            setScanError('Custom item name is required');
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            setScanError('Custom item price must be greater than 0');
            return;
        }
        if (!Number.isFinite(quantity) || quantity < 1) {
            setScanError('Custom item quantity must be at least 1');
            return;
        }
        if (!consignor) {
            setScanError('Select a consignor for this custom item');
            return;
        }

        const nowIso = new Date().toISOString();
        const customId = `custom-sale-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const customItem: Item = {
            id: customId,
            consignor_id: consignor.id,
            sku: `CUSTOM-${Date.now().toString().slice(-6)}`,
            name,
            variant_summary: null,
            other_details_1: null,
            other_details_2: null,
            category: customItemForm.category || 'Other',
            quantity: 99999,
            qty_unlabeled: 0,
            price,
            image_url: null,
            is_listed: false,
            show_in_public_browse: false,
            storefront_featured: false,
            created_at: nowIso,
            updated_at: nowIso,
            shopify_product_id: null,
            shopify_variant_id: null,
            shopify_inventory_item_id: null,
            sync_enabled: false,
            last_sync_source: null,
            last_synced_at: null,
            is_custom_sale_item: true,
            consignor,
        };

        const cartItem = createCartItem(customItem, quantity, undefined, getDealerDiscountPercentForItem(customItem));
        setCart((prev) => [...prev, cartItem]);
        setShowCustomItemModal(false);
    };

    const updateQuantity = (index: number, newQty: number) => {
        if (newQty <= 0) {
            removeItem(index);
            return;
        }

        const item = cart[index];
        if (!isCustomSaleItem(item.item) && newQty > item.item.quantity) {
            setScanError(`Only ${item.item.quantity} in stock`);
            return;
        }

        // Preserve existing discount (recalculate amount for new quantity)
        const updated = createCartItem(
            item.item,
            newQty,
            getDefaultItemDiscount(item.item, item.discount),
            getDealerDiscountPercentForItem(item.item)
        );
        setCart((prev) => prev.map((ci, i) => (i === index ? updated : ci)));
    };

    const removeItem = (index: number) => {
        setCart((prev) => prev.filter((_, i) => i !== index));
    };

    const handleCompleteCashSale = async () => {
        if (cart.length === 0) return;
        if (cashAmount < amountDue) {
            setScanError('Insufficient cash');
            return;
        }

        const { data: sale, error, queuedOffline } = await completeSale(
            cart,
            subtotal,
            taxTotal,
            cashPrice,
            cashAmount,
            change,
            selectedCustomer?.id,
            'cash',
            undefined,
            orderDiscounts,
            appliedStoreCredit,
            0,
            appliedGiftCard?.code,
            appliedGiftCardAmount,
            undefined,
            userRecord?.id,
            employee?.id
        );

        if (error) {
            setScanError(error);
            return;
        }

        // Store data for receipt delivery modal
        if (sale) {
            const receiptData = createReceiptData(sale, cart);
            setCompletedReceiptData(receiptData);
            setCompletedCart([...cart]);
            setShowReceiptDelivery(true);
            if (selectedCustomer && appliedStoreCredit > 0) {
                setSelectedCustomer({
                    ...selectedCustomer,
                    store_credit: Math.max(0, availableStoreCredit - appliedStoreCredit),
                });
            }
            if (appliedGiftCard && appliedGiftCardAmount > 0) {
                const remaining = Math.max(0, appliedGiftCard.balance - appliedGiftCardAmount);
                setAppliedGiftCard(remaining > 0 ? { ...appliedGiftCard, balance: remaining } : null);
            }
        }

        setCompletedSale(sale);
        if (queuedOffline) {
            setScanError('Sale saved locally. It will sync to Supabase automatically when internet returns.');
            await refreshOfflineSalesStatus();
        }
    };

    const handleCompleteCardSale = async () => {
        if (isOfflineMode) {
            setScanError('Offline mode supports cash sales only.');
            return;
        }
        if (cart.length === 0) return;
        if (amountDue > 0 && !connectedReader) {
            setScanError('No card reader connected');
            return;
        }

        setScanError(null);

        let paymentIntentId: string | undefined;
        let cardLast4: string | undefined;

        if (amountDue > 0) {
            setIsCollectingCard(true);
            // Convert total due to cents for Stripe
            const amountInCents = Math.round(amountDue * 100);
            const cardResult = await collectCardPayment(amountInCents);
            if (cardResult.error) {
                setScanError(cardResult.error);
                setIsCollectingCard(false);
                return;
            }
            paymentIntentId = cardResult.paymentIntentId || undefined;
            cardLast4 = cardResult.cardLast4;
        }

        const { data: sale, error } = await completeSale(
            cart,
            subtotal,
            taxTotal,
            amountDue,
            0,
            0,
            selectedCustomer?.id,
            'card',
            paymentIntentId,
            orderDiscounts,
            appliedStoreCredit,
            cardFeeAmount,
            appliedGiftCard?.code,
            appliedGiftCardAmount,
            undefined,
            userRecord?.id,
            employee?.id
        );

        if (amountDue > 0) {
            setIsCollectingCard(false);
        }

        if (error) {
            setScanError(error);
            return;
        }

        // Store data for receipt delivery modal
        if (sale) {
            const saleWithCardLast4: Sale = {
                ...sale,
                card_last4: cardLast4 || null,
            };
            const receiptData = createReceiptData(saleWithCardLast4, cart);
            setCompletedReceiptData(receiptData);
            setCompletedCart([...cart]);
            setShowReceiptDelivery(true);
            if (selectedCustomer && appliedStoreCredit > 0) {
                setSelectedCustomer({
                    ...selectedCustomer,
                    store_credit: Math.max(0, availableStoreCredit - appliedStoreCredit),
                });
            }
            if (appliedGiftCard && appliedGiftCardAmount > 0) {
                const remaining = Math.max(0, appliedGiftCard.balance - appliedGiftCardAmount);
                setAppliedGiftCard(remaining > 0 ? { ...appliedGiftCard, balance: remaining } : null);
            }
        }

        setCompletedSale(sale ? { ...sale, card_last4: cardLast4 || null } : null);
    };

    const handleDiscoverReaders = async () => {
        if (readerMode === 'live' && !readerLocationId.trim()) {
            setScanError('Set your Stripe Location ID in Reader Setup first');
            setShowReaderSetupModal(true);
            return;
        }
        setShowReaderModal(true);
        await discoverReaders({
            simulated: readerMode === 'simulated',
            locationId: readerLocationId.trim() || undefined,
        });
    };

    const handleConnectReader = async (reader: { id: string; label: string; device_type: string; status: string }) => {
        const connected = await connectReader(reader);
        if (!connected) {
            return;
        }
        setAutoReconnectPaused(false);
        setPreferredReaderId(reader.id);
        setScanError(null);
    };

    const handleDisconnectReader = async () => {
        setAutoReconnectPaused(true);
        await disconnectReader();
    };

    const handleRegisterReader = async (registrationCode: string, label?: string) => {
        if (!readerLocationId.trim()) {
            setScanError('Set your Stripe Location ID first');
            return false;
        }

        const ok = await registerReaderByCode({
            registrationCode,
            locationId: readerLocationId.trim(),
            label,
        });

        if (!ok) {
            setScanError('Reader registration failed. Confirm code and location, then retry.');
            return false;
        }

        setScanError(null);
        await discoverReaders({
            simulated: false,
            locationId: readerLocationId.trim(),
        });
        return true;
    };

    const handleSaveReaderSetup = (settings: { mode: 'simulated' | 'live'; locationId: string; autoReconnect: boolean }) => {
        setReaderMode(settings.mode);
        setReaderLocationId(settings.locationId);
        setAutoReconnectReader(settings.autoReconnect);
        setAutoReconnectPaused(false);
        setShowReaderSetupModal(false);
        setScanError(null);
    };

    const handleCompleteCheckSale = async () => {
        if (isOfflineMode) {
            setScanError('Offline mode supports cash sales only.');
            return;
        }
        if (cart.length === 0) return;

        const { data: sale, error } = await completeSale(
            cart,
            subtotal,
            taxTotal,
            cashPrice,
            0,
            0,
            selectedCustomer?.id,
            'check',
            undefined,
            orderDiscounts,
            appliedStoreCredit,
            0,
            appliedGiftCard?.code,
            appliedGiftCardAmount,
            checkNumber.trim() || undefined,
            userRecord?.id,
            employee?.id
        );

        if (error) {
            setScanError(error);
            return;
        }

        if (sale) {
            const saleWithCheckNumber: Sale = {
                ...sale,
                check_number: checkNumber.trim() || null,
            };
            const receiptData = createReceiptData(saleWithCheckNumber, cart);
            setCompletedReceiptData(receiptData);
            setCompletedCart([...cart]);
            setShowReceiptDelivery(true);
            if (selectedCustomer && appliedStoreCredit > 0) {
                setSelectedCustomer({
                    ...selectedCustomer,
                    store_credit: Math.max(0, availableStoreCredit - appliedStoreCredit),
                });
            }
            if (appliedGiftCard && appliedGiftCardAmount > 0) {
                const remaining = Math.max(0, appliedGiftCard.balance - appliedGiftCardAmount);
                setAppliedGiftCard(remaining > 0 ? { ...appliedGiftCard, balance: remaining } : null);
            }
        }

        setCompletedSale(sale ? { ...sale, check_number: checkNumber.trim() || null } : null);
    };

    const handleNewSale = () => {
        setCart([]);
        setCashTendered('');
        setCompletedSale(null);
        setCompletedReceiptData(null);
        setCompletedCart([]);
        setShowReceiptDelivery(false);
        setScanError(null);
        setSelectedCustomer(null);
        setCustomerSearch('');
        setUseStoreCredit(true);
        setGiftCardInput('');
        setGiftCardError(null);
        setIsApplyingGiftCard(false);
        setAppliedGiftCard(null);
        setPaymentMethod('card');
        setCheckNumber('');
        setIsCollectingCard(false);
        setOrderDiscounts([]);
        setDealerDiscountEnabled(false);
        setDiscountTarget(null);
        setShowCustomItemModal(false);
        scannerRef.current?.focus();
    };

    const handleReceiptDeliveryClose = () => {
        setShowReceiptDelivery(false);
    };

    const handleCustomerEmailUpdate = async (customerId: string, email: string) => {
        await updateCustomer(customerId, { email });
    };

    const handleCreateInvoice = async () => {
        if (cart.length === 0) {
            setScanError('Cannot create invoice with empty cart');
            return;
        }

        if (!selectedCustomer && invoiceRecipientType === 'customer') {
            setScanError('Please select a customer for the invoice');
            return;
        }

        if (!selectedInvoiceVendorId && invoiceRecipientType === 'vendor') {
            setScanError('Please select a vendor for the invoice');
            return;
        }

        setShowInvoiceModal(false);
        const recipientName = invoiceRecipientType === 'customer'
            ? selectedCustomer?.name || ''
            : consignors.find(c => c.id === selectedInvoiceVendorId)?.name || '';
        const recipientEmail = invoiceRecipientType === 'customer'
            ? selectedCustomer?.email || undefined
            : consignors.find(c => c.id === selectedInvoiceVendorId)?.email || undefined;

        const { data: invoice, error } = await createInvoice({
            recipientType: invoiceRecipientType,
            customerId: invoiceRecipientType === 'customer' ? selectedCustomer?.id : undefined,
            consignorId: invoiceRecipientType === 'vendor' ? selectedInvoiceVendorId : undefined,
            recipientName,
            recipientEmail: recipientEmail || undefined,
            cartItems: cart,
            subtotal,
            taxAmount: taxTotal,
            total,
            notes: invoiceNote || undefined,
        });

        if (error) {
            setScanError(error);
            return;
        }

        if (invoice) {
            const invoiceEmailData = createInvoiceEmailDataFromCart(invoice, cart);
            setCompletedInvoice(invoice);
            setCompletedInvoiceEmail(invoiceEmailData);
            setShowInvoiceDelivery(true);
            setInvoiceNote('');
            setSelectedInvoiceVendorId('');
        }
    };

    // Discount handlers
    const handleOpenOrderDiscount = () => {
        setDiscountTarget({ scope: 'order' });
        setShowDiscountModal(true);
    };

    const handleOpenItemDiscount = (itemIndex: number) => {
        setDiscountTarget({ scope: 'item', itemIndex });
        setShowDiscountModal(true);
    };

    const handleApplyDiscount = (type: DiscountType, value: number, reason?: string) => {
        if (!discountTarget) return;

        if (discountTarget.scope === 'order') {
            // Calculate discount amount based on current subtotal after item discounts
            const subtotalAfterItemDiscounts = cart.reduce(
                (sum, item) => sum + item.discountedLineTotal, 0
            );
            const discount = createDiscount(type, value, 'order', undefined, reason, subtotalAfterItemDiscounts);
            setOrderDiscounts(prev => [...prev, discount]);
        } else if (discountTarget.itemIndex !== undefined) {
            // Item-level discount
            const itemIndex = discountTarget.itemIndex;
            const item = cart[itemIndex];
            const discount = createDiscount(type, value, 'item', itemIndex, reason, item.lineTotal);

            // Update the cart item with the discount
            const updatedItem = createCartItem(
                item.item,
                item.quantity,
                discount,
                getDealerDiscountPercentForItem(item.item)
            );
            setCart(prev => prev.map((ci, i) => (i === itemIndex ? updatedItem : ci)));
        }
        setDiscountTarget(null);
    };

    const handleRemoveOrderDiscount = (discountId: string) => {
        setOrderDiscounts(prev => prev.filter(d => d.id !== discountId));
    };

    const handleRemoveItemDiscount = (itemIndex: number) => {
        const item = cart[itemIndex];
        const updatedItem = createCartItem(
            item.item,
            item.quantity,
            getAutomaticCatalogDiscount(item.item),
            getDealerDiscountPercentForItem(item.item)
        );
        setCart(prev => prev.map((ci, i) => (i === itemIndex ? updatedItem : ci)));
    };

    const quickCashAmounts = [1, 5, 10, 20, 50, 100];
    const dealerDiscountEligibleItems = cart.filter((cartItem) =>
        Number((cartItem.item.consignor as { dealer_discount_percent?: number } | undefined)?.dealer_discount_percent || 0) > 0
    ).length;

    // Customer search with debounce
    useEffect(() => {
        if (customerSearch.length < 2) {
            setCustomerResults([]);
            setShowCustomerDropdown(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingCustomer(true);
            const { data } = await searchCustomers(customerSearch);
            setCustomerResults(data);
            setShowCustomerDropdown(true);
            setIsSearchingCustomer(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [customerSearch, searchCustomers]);

    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setUseStoreCredit(true);
        setCustomerSearch('');
        setShowCustomerDropdown(false);
    };

    const handleClearCustomer = () => {
        setSelectedCustomer(null);
        setUseStoreCredit(true);
        setCustomerSearch('');
    };

    const handleApplyGiftCard = async () => {
        if (isOfflineMode) {
            setGiftCardError('Gift cards require internet. Offline mode supports cash sales only.');
            return;
        }

        const normalizedCode = giftCardInput.trim().toUpperCase();
        if (!normalizedCode) {
            setGiftCardError('Enter a gift card code');
            return;
        }

        setGiftCardError(null);
        setIsApplyingGiftCard(true);

        const { data, error } = await supabase.rpc('get_gift_card_by_code', {
            p_code: normalizedCode,
        });

        setIsApplyingGiftCard(false);

        if (error) {
            setGiftCardError(error.message || 'Unable to verify gift card');
            return;
        }

        const giftCard = Array.isArray(data) ? data[0] : null;
        if (!giftCard) {
            setGiftCardError('Gift card not found');
            return;
        }

        const balance = Number(giftCard.current_balance || 0);
        if (!giftCard.is_active || balance <= 0) {
            setGiftCardError('Gift card has no available balance');
            return;
        }

        setAppliedGiftCard({
            code: String(giftCard.code),
            balance,
        });
        setGiftCardInput(String(giftCard.code));
    };

    const handleRemoveGiftCard = () => {
        setAppliedGiftCard(null);
        setGiftCardInput('');
        setGiftCardError(null);
    };

    const handleCreateCustomer = async () => {
        if (!newCustomerData.name.trim()) return;

        const { data, error } = await createCustomer(newCustomerData);
        if (!error && data) {
            setSelectedCustomer(data);
            setShowNewCustomerModal(false);
            setNewCustomerData({ name: '', email: null, phone: null, notes: null, accepts_marketing: false });
        }
    };

    return (
        <div className="animate-fadeIn min-h-0 overflow-hidden flex flex-col">
            <Header
                title="Point of Sale"
                className="shrink-0 pb-4 mb-4"
                actions={
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setShowInvoiceModal(true)}
                            disabled={cart.length === 0 || isOfflineMode}
                            title={isOfflineMode ? 'Invoice creation requires internet' : undefined}
                        >
                            <FileTextIcon />
                            Invoice
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setShowRefundModal(true)}
                            disabled={isOfflineMode}
                            title={isOfflineMode ? 'Refund lookup requires internet' : undefined}
                        >
                            <RefundIcon />
                            Refund
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setShowGiftCardSaleModal(true)}
                            disabled={isOfflineMode}
                            title={isOfflineMode ? 'Gift card issuance requires internet' : undefined}
                        >
                            <GiftCardIcon />
                            Gift Card
                        </Button>
                        {cart.length > 0 && (
                            <Button variant="ghost" onClick={handleNewSale}>
                                Clear
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            onClick={() => setShowSmartSearch(true)}
                            title="Smart Item Search"
                        >
                            <SearchIcon />
                            Search
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={openCustomerDisplay}
                            title="Open Customer Display"
                        >
                            <MonitorIcon />
                        </Button>
                    </div>
                }
            />

            <div className="flex-1 min-h-0 overflow-hidden">
            {isOfflineMode && (
                <Card variant="outlined" className="mb-4 shrink-0 border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10">
                    <CardContent className="py-3">
                        <p className="text-sm font-medium text-[var(--color-warning)]">Offline mode active: cash sales only.</p>
                        <p className="text-xs text-[var(--color-muted)] mt-1">
                            Card/check payments, store credit, gift cards, invoices, and refunds are temporarily disabled.
                        </p>
                    </CardContent>
                </Card>
            )}

            {isElectronRuntime && (offlineSalesStatus.failed > 0 || offlineSalesStatus.pending > 0) && (
                <Card variant="outlined" className="mb-4 shrink-0">
                    <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium">Offline Sync Queue</p>
                            <p className="text-xs text-[var(--color-muted)]">
                                Pending: {offlineSalesStatus.pending} · Failed: {offlineSalesStatus.failed}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void runOfflineQueueSync(true)}
                                disabled={isSyncingOfflineSales || offlineSalesStatus.failed === 0 || isOfflineMode}
                                title={isOfflineMode ? 'Reconnect to retry failed syncs' : undefined}
                            >
                                Retry Failed
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => void runOfflineQueueSync(false)}
                                disabled={isSyncingOfflineSales || isOfflineMode}
                                isLoading={isSyncingOfflineSales}
                                title={isOfflineMode ? 'Reconnect to sync pending sales' : undefined}
                            >
                                Sync Now
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-hidden">
                {/* Left: Scanner + Cart */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Scanner Input */}
                    <Card variant="outlined">
                        <CardContent>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <form onSubmit={handleScan} className="flex-1">
                                    <Input
                                        ref={scannerRef}
                                        value={scanInput}
                                        onChange={(e) => setScanInput(e.target.value)}
                                        placeholder="Scan barcode or enter SKU..."
                                        inputSize="lg"
                                        leftIcon={<BarcodeIcon />}
                                        error={scanError || undefined}
                                        autoComplete="off"
                                    />
                                </form>
                                <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                                    <span className="hidden sm:inline">or</span>
                                    <Button
                                        variant="secondary"
                                        onClick={openCustomItemModal}
                                        disabled={consignors.length === 0}
                                        title={consignors.length === 0 ? 'Add a consignor first' : 'Add a one-off custom item'}
                                        className="shrink-0"
                                    >
                                        + Custom Item
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cart Items */}
                    <Card variant="outlined" className="flex-1 overflow-hidden">
                        <CardContent className="h-full flex flex-col">
                            {cart.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-center">
                                    <div>
                                        <ShoppingCartIcon />
                                        <p className="mt-2 text-[var(--color-muted)]">
                                            Scan items to add to cart
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto space-y-2">
                                    {cart.map((item, index) => (
                                        <div
                                            key={item.item.id}
                                            className="flex items-center gap-4 p-3 rounded-lg bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] transition-colors"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-[var(--color-foreground)] truncate">
                                                    {item.item.name}
                                                </p>
                                                {item.item.variant_summary && (
                                                    <p className="text-xs text-[var(--color-muted)]">
                                                        {item.item.variant_summary}
                                                    </p>
                                                )}
                                                <p className="text-xs font-mono text-[var(--color-muted)]">
                                                    {item.item.is_custom_sale_item ? 'Custom sale item' : item.item.sku}
                                                </p>
                                                {item.discount && (
                                                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] rounded-full">
                                                        <DiscountIcon />
                                                        {formatDiscountLabel(item.discount)}
                                                    </span>
                                                )}
                                                {(item.dealerDiscountAmount || 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1 mt-1 ml-1 px-2 py-0.5 text-xs font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] rounded-full">
                                                        <DiscountIcon />
                                                        Dealer {Number(item.dealerDiscountPercent || 0).toFixed(2)}%
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateQuantity(index, item.quantity - 1)}
                                                    className="w-8 h-8 rounded-lg bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors font-bold"
                                                >
                                                    −
                                                </button>
                                                <span className="w-8 text-center font-medium">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => updateQuantity(index, item.quantity + 1)}
                                                    className="w-8 h-8 rounded-lg bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors font-bold"
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <div className="w-28 text-right">
                                                {item.discount ? (
                                                    <>
                                                        <p className="font-medium text-[var(--color-success)]">
                                                            {formatCurrency(item.discountedLineTotal)}
                                                        </p>
                                                        <p className="text-xs text-[var(--color-muted)] line-through">
                                                            {formatCurrency(item.lineTotal)}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="font-medium">
                                                            {formatCurrency(item.lineTotal)}
                                                        </p>
                                                        <p className="text-xs text-[var(--color-muted)]">
                                                            @ {formatCurrency(Number(item.item.price))}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                            {/* Item Discount Button */}
                                            <button
                                                onClick={() => item.discount ? handleRemoveItemDiscount(index) : handleOpenItemDiscount(index)}
                                                className={`p-2 transition-colors rounded-lg ${item.discount
                                                    ? 'text-[var(--color-success)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]'
                                                    : 'text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10'
                                                    }`}
                                                title={item.discount ? 'Remove discount' : 'Add discount'}
                                            >
                                                <DiscountIcon />
                                            </button>
                                            <button
                                                onClick={() => removeItem(index)}
                                                className="p-2 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                                            >
                                                <XIcon />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Totals + Tender */}
                <div className="flex flex-col gap-4 min-h-0">
                    {/* Totals */}
                    <Card variant="elevated">
                        <CardContent className="space-y-3">
                            <div className="w-full flex items-center gap-2.5">
                                <span className="shrink-0 text-[var(--color-muted)]">
                                    <CustomerIcon />
                                </span>
                                <div className="relative flex-1 min-w-0">
                                    {selectedCustomer ? (
                                        <div className="rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 p-2">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
                                                        {selectedCustomer.name}
                                                    </p>
                                                    <p className="truncate text-xs text-[var(--color-muted)]">
                                                        {selectedCustomer.phone || selectedCustomer.email || 'No contact info'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={handleClearCustomer}
                                                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3">
                                                <span className="text-xs font-semibold text-[var(--color-success)]">
                                                    {formatCurrency(availableStoreCredit)} credit
                                                </span>
                                            </div>
                                            {availableStoreCredit > 0 && (
                                                <label className="mt-2 flex items-center justify-between text-xs">
                                                    <span className="text-[var(--color-muted)]">Apply store credit</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={useStoreCredit}
                                                        onChange={(e) => setUseStoreCredit(e.target.checked)}
                                                        disabled={isOfflineMode}
                                                        className="h-4 w-4 rounded border-[var(--color-border)]"
                                                    />
                                                </label>
                                            )}
                                            {isOfflineMode && availableStoreCredit > 0 && (
                                                <p className="text-xs text-[var(--color-muted)] mt-2">
                                                    Store credit requires internet and is disabled offline.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex gap-2 w-full">
                                            <Input
                                                value={customerSearch}
                                                onChange={(e) => setCustomerSearch(e.target.value)}
                                                placeholder="Search customer..."
                                                leftIcon={isSearchingCustomer ? <LoadingSpinner size={16} /> : <SearchIcon />}
                                                className="w-full"
                                            />
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
                                    )}
                                    {showCustomerDropdown && customerResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg border border-[var(--color-border)] z-50 max-h-48 overflow-y-auto bg-[var(--color-card)]">
                                            {customerResults.map((customer) => (
                                                <button
                                                    key={customer.id}
                                                    onClick={() => handleSelectCustomer(customer)}
                                                    className="w-full px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
                                                >
                                                    <p className="font-medium text-sm">{customer.name}</p>
                                                    <p className="text-xs text-[var(--color-muted)]">
                                                        {customer.phone || customer.email || 'No contact'}
                                                    </p>
                                                    <p className="text-xs text-[var(--color-success)]">
                                                        Credit: {formatCurrency(Number(customer.store_credit || 0))}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {showCustomerDropdown && customerResults.length === 0 && customerSearch.length >= 2 && !isSearchingCustomer && (
                                        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg border border-[var(--color-border)] z-50 p-3 bg-[var(--color-card)]">
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
                            </div>

                            <div className="border-t border-[var(--color-border)]" />

                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>

                            {alySubtotal > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--color-muted)]">Alywilow Subtotal</span>
                                    <span>{formatCurrency(alySubtotal)}</span>
                                </div>
                            )}

                            {/* Item-level discounts summary */}
                            {itemDiscountTotal > 0 && (
                                <div className="flex justify-between text-sm text-[var(--color-success)]">
                                    <span>Manual Item Discounts</span>
                                    <span>-{formatCurrency(itemDiscountTotal)}</span>
                                </div>
                            )}

                            {dealerDiscountTotal > 0 && (
                                <div className="flex justify-between text-sm text-[var(--color-success)]">
                                    <span>Dealer Discounts</span>
                                    <span>-{formatCurrency(dealerDiscountTotal)}</span>
                                </div>
                            )}

                            {/* Order-level discounts */}
                            {orderDiscounts.map((discount) => (
                                <div
                                    key={discount.id}
                                    className="flex justify-between items-center text-sm text-[var(--color-success)] bg-[var(--color-success-bg)] rounded-lg px-2 py-1"
                                >
                                    <div className="flex items-center gap-2">
                                        <DiscountIcon />
                                        <span>
                                            {discount.type === 'percentage' ? `${discount.value}%` : formatCurrency(discount.value)} off
                                            {discount.reason && <span className="text-xs opacity-75"> ({discount.reason})</span>}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span>-{formatCurrency(discount.calculatedAmount)}</span>
                                        <button
                                            onClick={() => handleRemoveOrderDiscount(discount.id)}
                                            className="p-1 hover:bg-[var(--color-danger-bg)] rounded text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                                            title="Remove discount"
                                        >
                                            <XIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Add Discount Button */}
                            {cart.length > 0 && (
                                <div className="space-y-2">
                                    <label className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                                        <div>
                                            <p className="text-sm font-medium">Dealer Discount</p>
                                            <p className="text-xs text-[var(--color-muted)]">
                                                Apply vendor-specific dealer pricing for this sale.
                                            </p>
                                            {dealerDiscountEnabled && dealerDiscountEligibleItems === 0 && (
                                                <p className="text-xs text-[var(--color-warning)] mt-1">
                                                    No cart items are from vendors with dealer discounts configured.
                                                </p>
                                            )}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={dealerDiscountEnabled}
                                            onChange={(e) => setDealerDiscountEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded border-[var(--color-border)]"
                                        />
                                    </label>
                                    <button
                                        onClick={handleOpenOrderDiscount}
                                        className="w-full py-2 px-3 rounded-lg border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)] flex items-center justify-center gap-2"
                                    >
                                        <DiscountIcon />
                                        Add Order Discount
                                    </button>
                                </div>
                            )}

                            {/* Total Discount */}
                            {discountTotal > 0 && (
                                <div className="flex justify-between text-sm font-medium text-[var(--color-success)] pt-2 border-t border-dashed border-[var(--color-border)]">
                                    <span>Total Savings</span>
                                    <span>-{formatCurrency(discountTotal)}</span>
                                </div>
                            )}

                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Tax</span>
                                <span>{formatCurrency(taxTotal)}</span>
                            </div>
                            {appliedStoreCredit > 0 && (
                                <div className="flex justify-between text-sm text-[var(--color-success)]">
                                    <span>Store Credit</span>
                                    <span>-{formatCurrency(appliedStoreCredit)}</span>
                                </div>
                            )}
                            {appliedGiftCardAmount > 0 && (
                                <div className="flex justify-between text-sm text-[var(--color-success)]">
                                    <span>Gift Card</span>
                                    <span>-{formatCurrency(appliedGiftCardAmount)}</span>
                                </div>
                            )}
                            {cardFeeAmount > 0 && (
                                <>
                                    <div className="flex justify-between text-sm text-[var(--color-warning)]">
                                        <span>Card Processing Fee</span>
                                        <span>{formatCurrency(cardFeeAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-[var(--color-muted)]">
                                        <span>Cash Price</span>
                                        <span>{formatCurrency(cashPrice)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between text-2xl font-bold pt-3 border-t border-[var(--color-border)]">
                                <span>{paymentMethod === 'card' ? 'Card Total' : 'Amount Due'}</span>
                                <span className="text-[var(--color-primary)]">
                                    {formatCurrency(amountDue)}
                                </span>
                            </div>
                            {paymentMethod === 'card' && cardFeeDifference > 0 && (
                                <p className="text-xs text-[var(--color-muted)] text-right">
                                    +{formatCurrency(cardFeeDifference)} vs cash
                                </p>
                            )}

                            <div className="pt-3 border-t border-[var(--color-border)]">
                                <div className="w-full flex items-center gap-2.5">
                                    <span className="shrink-0 text-[var(--color-muted)]">
                                        <GiftCardIcon />
                                    </span>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        {appliedGiftCard ? (
                                            <div className="rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 p-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-xs font-mono text-[var(--color-foreground)]">{appliedGiftCard.code}</span>
                                                    <button
                                                        onClick={handleRemoveGiftCard}
                                                        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                                <p className="mt-1 text-xs text-[var(--color-muted)]">
                                                    Balance: {formatCurrency(appliedGiftCard.balance)}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 w-full">
                                                <Input
                                                    value={giftCardInput}
                                                    onChange={(e) => setGiftCardInput(e.target.value.toUpperCase())}
                                                    placeholder="Enter giftcard code"
                                                    disabled={isOfflineMode}
                                                    className="w-full text-sm"
                                                />
                                                <Button
                                                    variant="secondary"
                                                    onClick={handleApplyGiftCard}
                                                    isLoading={isApplyingGiftCard}
                                                    className="shrink-0"
                                                    disabled={isOfflineMode}
                                                >
                                                    Apply
                                                </Button>
                                            </div>
                                        )}

                                        {giftCardError && (
                                            <p className="text-xs text-[var(--color-danger)]">{giftCardError}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Method */}
                    <Card variant="outlined" className="flex-1 min-h-0 overflow-hidden">
                        <CardContent className="h-full flex flex-col min-h-0">
                            {/* Payment Method Toggle */}
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={() => setPaymentMethod('cash')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${paymentMethod === 'cash'
                                        ? 'bg-[var(--color-primary)] text-white'
                                        : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                >
                                    <CashIcon />
                                    Cash
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('check')}
                                    disabled={isOfflineMode}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${paymentMethod === 'check'
                                        ? 'bg-[var(--color-primary)] text-white'
                                        : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                        } ${isOfflineMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <CheckIcon />
                                    Check
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('card')}
                                    disabled={isOfflineMode}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${paymentMethod === 'card'
                                        ? 'bg-[var(--color-primary)] text-white'
                                        : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                        } ${isOfflineMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <CardIcon />
                                    Card
                                </button>
                            </div>

                            {paymentMethod === 'cash' ? (
                                <>
                                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                                        <p className="text-sm font-medium mb-2">Cash Tendered</p>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={cashTendered}
                                            onChange={(e) => setCashTendered(e.target.value)}
                                            inputSize="lg"
                                            leftIcon={<span className="text-[var(--color-muted)]">$</span>}
                                            placeholder="0.00"
                                        />

                                        {/* Quick amounts */}
                                        <div className="grid grid-cols-3 gap-2 mt-3">
                                            {quickCashAmounts.map((amount) => (
                                                <button
                                                    key={amount}
                                                    onClick={() => setCashTendered(amount.toString())}
                                                    className="py-2 px-3 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-sm font-medium transition-colors"
                                                >
                                                    ${amount}
                                                </button>
                                            ))}
                                            {amountDue > 0 && (
                                                <button
                                                    onClick={() => setCashTendered(Math.ceil(amountDue).toString())}
                                                    className="col-span-3 py-2 px-3 rounded-lg bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-sm font-medium transition-colors"
                                                >
                                                    Exact: {formatCurrency(Math.ceil(amountDue))}
                                                </button>
                                            )}
                                        </div>

                                        {/* Change Display */}
                                        {cashAmount > 0 && (
                                            <div
                                                className={`mt-4 p-4 rounded-xl text-center ${change >= 0
                                                    ? 'bg-[var(--color-success-bg)]'
                                                    : 'bg-[var(--color-danger-bg)]'
                                                    }`}
                                            >
                                                <p className="text-sm text-[var(--color-muted)]">
                                                    {change >= 0 ? 'Change Due' : 'Amount Short'}
                                                </p>
                                                <p
                                                    className={`text-3xl font-bold ${change >= 0
                                                        ? 'text-[var(--color-success)]'
                                                        : 'text-[var(--color-danger)]'
                                                        }`}
                                                >
                                                    {formatCurrency(Math.abs(change))}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-3 border-t border-[var(--color-border)] mt-3 shrink-0">
                                        <Button
                                            size="xl"
                                            className="w-full"
                                            onClick={handleCompleteCashSale}
                                            disabled={cart.length === 0 || cashAmount < amountDue}
                                            isLoading={isProcessing}
                                        >
                                            Complete Cash Sale
                                        </Button>
                                    </div>
                                </>
                            ) : paymentMethod === 'check' ? (
                                <>
                                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                                        <p className="text-sm font-medium mb-2">Check Number (Optional)</p>
                                        <Input
                                            value={checkNumber}
                                            onChange={(e) => setCheckNumber(e.target.value)}
                                            inputSize="lg"
                                            placeholder="Enter check #"
                                        />
                                        <p className="text-xs text-[var(--color-muted)] mt-2">
                                            You can also add or edit this later in Sales History.
                                        </p>
                                    </div>
                                    <div className="pt-3 border-t border-[var(--color-border)] mt-3 shrink-0">
                                        <Button
                                            size="xl"
                                            className="w-full"
                                            onClick={handleCompleteCheckSale}
                                            disabled={cart.length === 0}
                                            isLoading={isProcessing}
                                        >
                                            Complete Check Sale
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                                    {/* Card Reader Status */}
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium">Card Reader</p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowReaderSetupModal(true)}
                                            >
                                                Reader Setup
                                            </Button>
                                        </div>
                                        <p className="text-xs text-[var(--color-muted)] mb-2">
                                            Mode: {readerMode === 'simulated' ? 'Test' : 'Live'}
                                            {readerMode === 'live' && readerLocationId.trim() ? ` (${readerLocationId.trim()})` : ''}
                                        </p>
                                        {connectedReader ? (
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                                                    <span className="text-sm font-medium">{connectedReader.label}</span>
                                                </div>
                                                <button
                                                    onClick={handleDisconnectReader}
                                                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                                                >
                                                    Disconnect
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={handleDiscoverReaders}
                                                className="w-full p-3 rounded-lg border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors text-sm text-[var(--color-muted)]"
                                            >
                                                {terminalStatus === 'discovering' ? (
                                                    <span className="flex items-center justify-center gap-2">
                                                        <LoadingSpinner size={16} />
                                                        Searching for readers...
                                                    </span>
                                                ) : (
                                                    '+ Connect Card Reader'
                                                )}
                                            </button>
                                        )}
                                        {terminalError && (
                                            <p className="text-xs text-[var(--color-danger)] mt-1">{terminalError}</p>
                                        )}
                                    </div>

                                    {/* Card Payment Status */}
                                    {isCollectingCard && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center">
                                                <LoadingSpinner size={48} />
                                                <p className="mt-4 text-lg font-medium">
                                                    {terminalStatus === 'collecting' && 'Present card on reader...'}
                                                    {terminalStatus === 'processing' && 'Processing payment...'}
                                                </p>
                                                <p className="text-sm text-[var(--color-muted)]">
                                                    {formatCurrency(amountDue)}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    </div>

                                    {/* Complete Card Sale Button */}
                                    <div className="pt-3 border-t border-[var(--color-border)] mt-3 shrink-0">
                                        <Button
                                            size="xl"
                                            className="w-full"
                                            onClick={handleCompleteCardSale}
                                            disabled={cart.length === 0 || (amountDue > 0 && !connectedReader) || isCollectingCard}
                                            isLoading={isCollectingCard}
                                        >
                                            {isCollectingCard
                                                ? 'Processing...'
                                                : amountDue > 0
                                                    ? `Charge ${formatCurrency(amountDue)}`
                                                    : 'Complete Sale (Credit Only)'}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            </div>

            {/* Reader Selection Modal */}
            <Modal
                isOpen={showReaderModal}
                onClose={() => setShowReaderModal(false)}
                title="Connect Card Reader"
                size="sm"
            >
                <div className="space-y-3">
                    {terminalStatus === 'discovering' ? (
                        <div className="flex items-center justify-center py-8">
                            <LoadingSpinner size={32} />
                            <span className="ml-3">Searching for readers...</span>
                        </div>
                    ) : discoveredReaders.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-[var(--color-muted)]">No readers found</p>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => discoverReaders({
                                    simulated: readerMode === 'simulated',
                                    locationId: readerLocationId.trim() || undefined,
                                })}
                                className="mt-3"
                            >
                                Search Again
                            </Button>
                        </div>
                    ) : (
                        discoveredReaders.map((reader) => (
                            <button
                                key={reader.id}
                                onClick={async () => {
                                    await handleConnectReader(reader);
                                }}
                                className="w-full p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors text-left"
                            >
                                <p className="font-medium">{reader.label}</p>
                                <p className="text-xs text-[var(--color-muted)]">
                                    {reader.device_type} - {reader.status}
                                </p>
                            </button>
                        ))
                    )}
                </div>
            </Modal>

            <StripeReaderSetupModal
                isOpen={showReaderSetupModal}
                onClose={() => setShowReaderSetupModal(false)}
                mode={readerMode}
                locationId={readerLocationId}
                autoReconnect={autoReconnectReader}
                terminalStatus={terminalStatus}
                discoveredReaders={discoveredReaders}
                connectedReader={connectedReader}
                onSave={handleSaveReaderSetup}
                onDiscoverReaders={async (settings) => {
                    setReaderMode(settings.mode);
                    setReaderLocationId(settings.locationId);
                    await discoverReaders({
                        simulated: settings.mode === 'simulated',
                        locationId: settings.locationId || undefined,
                    });
                }}
                onConnectReader={handleConnectReader}
                onRegisterReader={handleRegisterReader}
            />

            {/* Custom Item Modal */}
            <Modal
                isOpen={showCustomItemModal}
                onClose={() => setShowCustomItemModal(false)}
                title="Add Custom Sale Item"
                size="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Item Name"
                        value={customItemForm.name}
                        onChange={(e) => setCustomItemForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Custom service or one-off item"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={customItemForm.price}
                            onChange={(e) => setCustomItemForm((prev) => ({ ...prev, price: e.target.value }))}
                            placeholder="0.00"
                        />
                        <Input
                            label="Quantity"
                            type="number"
                            step="1"
                            min="1"
                            value={customItemForm.quantity}
                            onChange={(e) => setCustomItemForm((prev) => ({ ...prev, quantity: e.target.value }))}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm">
                            <span className="block text-[var(--color-muted)] mb-1">Category</span>
                            <select
                                value={customItemForm.category}
                                onChange={(e) => setCustomItemForm((prev) => ({ ...prev, category: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                            >
                                {['Clothing', 'Accessories', 'Collectibles', 'Books', 'Furniture', 'Electronics', 'Art', 'Jewelry', 'Vintage', 'Other'].map((category) => (
                                    <option key={category} value={category}>{category}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm">
                            <span className="block text-[var(--color-muted)] mb-1">Consignor</span>
                            <select
                                value={customItemForm.consignorId}
                                onChange={(e) => setCustomItemForm((prev) => ({ ...prev, consignorId: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                            >
                                <option value="" disabled>Select consignor</option>
                                {consignors.map((consignor) => (
                                    <option key={consignor.id} value={consignor.id}>
                                        {consignor.consignor_number} - {consignor.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="ghost"
                            onClick={() => setShowCustomItemModal(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddCustomItem}
                            className="flex-1"
                        >
                            Add to Cart
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Receipt Delivery Modal */}
            {completedReceiptData && (
                <ReceiptDeliveryModal
                    isOpen={showReceiptDelivery}
                    onClose={handleReceiptDeliveryClose}
                    receipt={completedReceiptData}
                    customer={selectedCustomer}
                    onCustomerEmailUpdate={handleCustomerEmailUpdate}
                />
            )}

            {/* Receipt Display Modal */}
            <Modal
                isOpen={!!completedSale && !showReceiptDelivery}
                onClose={handleNewSale}
                title="Sale Complete!"
                size="md"
            >
                {completedSale && (
                    <Receipt
                        sale={completedSale}
                        items={completedCart.length > 0 ? completedCart : cart}
                        onNewSale={handleNewSale}
                    />
                )}
            </Modal>

            {/* New Customer Modal */}
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
                            disabled={!newCustomerData.name.trim()}
                            className="flex-1"
                        >
                            Add Customer
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Refund Modal */}
            <RefundModal
                isOpen={showRefundModal}
                onClose={() => setShowRefundModal(false)}
            />

            {/* Gift Card Sale Modal */}
            <GiftCardSaleModal
                isOpen={showGiftCardSaleModal}
                onClose={() => setShowGiftCardSaleModal(false)}
                connectedReader={!!connectedReader}
                onOpenReaderModal={handleDiscoverReaders}
                collectCardPayment={collectCardPayment}
                purchaserCustomerId={selectedCustomer?.id || null}
            />

            {/* Invoice Modal */}
            <Modal
                isOpen={showInvoiceModal}
                onClose={() => setShowInvoiceModal(false)}
                title="Create Invoice"
                size="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Invoice For</label>
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={invoiceRecipientType === 'customer'}
                                    onChange={() => {
                                        setInvoiceRecipientType('customer');
                                        setSelectedInvoiceVendorId('');
                                    }}
                                />
                                <span className="text-sm">Customer</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={invoiceRecipientType === 'vendor'}
                                    onChange={() => {
                                        setInvoiceRecipientType('vendor');
                                    }}
                                />
                                <span className="text-sm">Vendor</span>
                            </label>
                        </div>
                    </div>

                    {invoiceRecipientType === 'customer' ? (
                        <div>
                            <label className="block text-sm font-medium mb-2">Customer</label>
                            {selectedCustomer ? (
                                <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                                    <p className="font-medium">{selectedCustomer.name}</p>
                                    <p className="text-xs text-[var(--color-muted)]">{selectedCustomer.email || 'No email'}</p>
                                </div>
                            ) : (
                                <p className="text-sm text-[var(--color-muted)]">Please select a customer first</p>
                            )}
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium mb-2">Vendor</label>
                            <select
                                value={selectedInvoiceVendorId}
                                onChange={(e) => setSelectedInvoiceVendorId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                            >
                                <option value="">Select a vendor...</option>
                                {consignors.map((consignor) => (
                                    <option key={consignor.id} value={consignor.id}>
                                        {consignor.consignor_number} - {consignor.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium mb-2">Note (Optional)</label>
                        <textarea
                            value={invoiceNote}
                            onChange={(e) => setInvoiceNote(e.target.value)}
                            placeholder="Any notes for the invoice..."
                            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm resize-none h-20"
                        />
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button variant="secondary" onClick={() => setShowInvoiceModal(false)} className="flex-1">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateInvoice}
                            isLoading={isCreatingInvoice}
                            className="flex-1"
                            disabled={
                                (invoiceRecipientType === 'customer' && !selectedCustomer) ||
                                (invoiceRecipientType === 'vendor' && !selectedInvoiceVendorId)
                            }
                        >
                            Create Invoice
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Invoice Delivery Modal */}
            <InvoiceDeliveryModal
                isOpen={showInvoiceDelivery}
                onClose={() => setShowInvoiceDelivery(false)}
                invoice={completedInvoiceEmail}
                recipientEmail={completedInvoice?.recipient_email || null}
                recipientName={completedInvoice?.recipient_name || null}
            />

            {/* Discount Modal */}
            <DiscountModal
                isOpen={showDiscountModal}
                onClose={() => {
                    setShowDiscountModal(false);
                    setDiscountTarget(null);
                }}
                onApply={handleApplyDiscount}
                onRemove={
                    discountTarget?.scope === 'item' &&
                        discountTarget.itemIndex !== undefined &&
                        cart[discountTarget.itemIndex]?.discount
                        ? () => handleRemoveItemDiscount(discountTarget.itemIndex!)
                        : undefined
                }
                scope={discountTarget?.scope || 'order'}
                itemName={
                    discountTarget?.scope === 'item' && discountTarget.itemIndex !== undefined
                        ? cart[discountTarget.itemIndex]?.item.name
                        : undefined
                }
                maxAmount={
                    discountTarget?.scope === 'item' && discountTarget.itemIndex !== undefined
                        ? cart[discountTarget.itemIndex]?.lineTotal || 0
                        : cart.reduce((sum, item) => sum + item.discountedLineTotal, 0)
                }
                existingDiscount={
                    discountTarget?.scope === 'item' && discountTarget.itemIndex !== undefined
                        ? cart[discountTarget.itemIndex]?.discount
                        : undefined
                }
            />

            {/* Smart Search Modal */}
            <SmartSearch
                isOpen={showSmartSearch}
                onClose={() => setShowSmartSearch(false)}
                onItemSelect={async (item) => {
                    const existingIndex = cart.findIndex((ci) => ci.item.sku === item.sku);
                    if (existingIndex >= 0) {
                        const existing = cart[existingIndex];
                        if (existing.quantity >= existing.item.quantity) {
                            setScanError('No more in stock');
                            return;
                        }
                        const updated = createCartItem(
                            existing.item,
                            existing.quantity + 1,
                            getDefaultItemDiscount(existing.item, existing.discount),
                            getDealerDiscountPercentForItem(existing.item)
                        );
                        setCart((prev) => prev.map((ci, i) => (i === existingIndex ? updated : ci)));
                    } else {
                        if (item.quantity <= 0) {
                            setScanError('Out of stock');
                            return;
                        }
                        const cartItem = createCartItem(
                            item,
                            1,
                            getAutomaticCatalogDiscount(item),
                            getDealerDiscountPercentForItem(item)
                        );
                        setCart((prev) => [...prev, cartItem]);
                    }
                    setScanError(null);
                }}
            />
        </div>
    );
}

function BarcodeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14" />
        </svg>
    );
}

function ShoppingCartIcon() {
    return (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    );
}

function CustomerIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function UserPlusIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
    );
}

function GiftCardIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="13" rx="2" />
            <path d="M12 8v13" />
            <path d="M3 12h18" />
            <path d="M7.5 8a2.5 2.5 0 1 1 0-5c1.1 0 2 .9 2 2v3" />
            <path d="M16.5 8a2.5 2.5 0 1 0 0-5c-1.1 0-2 .9-2 2v3" />
        </svg>
    );
}

function CashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <circle cx="12" cy="12" r="3" />
            <path d="M2 9h2M20 9h2M2 15h2M20 15h2" />
        </svg>
    );
}

function CardIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m20 6-11 11-5-5" />
        </svg>
    );
}

function FileTextIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
    );
}

function RefundIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}

function DiscountIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 5L5 19M9 7a2 2 0 100-4 2 2 0 000 4zM15 21a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
    );
}
