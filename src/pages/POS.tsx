import { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Receipt } from '../components/pos/Receipt';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { useCategories } from '../hooks/useCategories';
import { useCustomers } from '../hooks/useCustomers';
import { useStripeTerminal } from '../hooks/useStripeTerminal';
import { createCartItem, calculateCartTotals } from '../lib/tax';
import { formatCurrency } from '../lib/utils';
import type { CartItem, Sale, Customer, CustomerInput, PaymentMethod } from '../types';

export function POS() {
    const scannerRef = useRef<HTMLInputElement>(null);
    const { getItemBySku } = useInventory();
    const { completeSale, isProcessing } = useSales();
    const { searchCustomers, createCustomer } = useCustomers();

    // Stripe Terminal
    const {
        status: terminalStatus,
        error: terminalError,
        discoveredReaders,
        connectedReader,
        discoverReaders,
        connectReader,
        disconnectReader,
        collectCardPayment,
    } = useStripeTerminal();

    // Fetch categories to ensure tax rates are synced from database
    useCategories();

    const [cart, setCart] = useState<CartItem[]>([]);
    const [scanInput, setScanInput] = useState('');
    const [scanError, setScanError] = useState<string | null>(null);
    const [cashTendered, setCashTendered] = useState<string>('');
    const [completedSale, setCompletedSale] = useState<Sale | null>(null);

    // Payment method state
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [isCollectingCard, setIsCollectingCard] = useState(false);
    const [showReaderModal, setShowReaderModal] = useState(false);

    // Customer state
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState<Customer[]>([]);
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
    const [newCustomerData, setNewCustomerData] = useState<CustomerInput>({
        name: '',
        email: null,
        phone: null,
        notes: null,
    });

    const { subtotal, taxTotal, total } = calculateCartTotals(cart);
    const cashAmount = parseFloat(cashTendered) || 0;
    const change = cashAmount - total;

    // Auto-focus scanner input
    useEffect(() => {
        scannerRef.current?.focus();
    }, []);

    // Refocus on click anywhere, unless clicking an interactive element
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (completedSale) return;

            const target = e.target as HTMLElement;
            const isInteractive =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'BUTTON' ||
                target.tagName === 'A' ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('[role="button"]'); // Handle semantic buttons

            if (!isInteractive) {
                scannerRef.current?.focus();
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [completedSale]);

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
            const updated = createCartItem(existing.item, existing.quantity + 1);
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

        const cartItem = createCartItem(item, 1);
        setCart((prev) => [...prev, cartItem]);
        setScanInput('');
    };

    const updateQuantity = (index: number, newQty: number) => {
        if (newQty <= 0) {
            removeItem(index);
            return;
        }

        const item = cart[index];
        if (newQty > item.item.quantity) {
            setScanError(`Only ${item.item.quantity} in stock`);
            return;
        }

        const updated = createCartItem(item.item, newQty);
        setCart((prev) => prev.map((ci, i) => (i === index ? updated : ci)));
    };

    const removeItem = (index: number) => {
        setCart((prev) => prev.filter((_, i) => i !== index));
    };

    const handleCompleteCashSale = async () => {
        if (cart.length === 0) return;
        if (cashAmount < total) {
            setScanError('Insufficient cash');
            return;
        }

        const { data: sale, error } = await completeSale(
            cart,
            subtotal,
            taxTotal,
            total,
            cashAmount,
            change,
            selectedCustomer?.id,
            'cash'
        );

        if (error) {
            setScanError(error);
            return;
        }

        setCompletedSale(sale);
    };

    const handleCompleteCardSale = async () => {
        if (cart.length === 0) return;
        if (!connectedReader) {
            setScanError('No card reader connected');
            return;
        }

        setIsCollectingCard(true);
        setScanError(null);

        // Convert total to cents for Stripe
        const amountInCents = Math.round(total * 100);

        const { paymentIntentId, error: cardError } = await collectCardPayment(amountInCents);

        if (cardError) {
            setScanError(cardError);
            setIsCollectingCard(false);
            return;
        }

        // Complete the sale in our database
        const { data: sale, error } = await completeSale(
            cart,
            subtotal,
            taxTotal,
            total,
            0,
            0,
            selectedCustomer?.id,
            'card',
            paymentIntentId
        );

        setIsCollectingCard(false);

        if (error) {
            setScanError(error);
            return;
        }

        setCompletedSale(sale);
    };

    const handleDiscoverReaders = async () => {
        setShowReaderModal(true);
        await discoverReaders(true); // Use simulated readers for sandbox
    };

    const handleNewSale = () => {
        setCart([]);
        setCashTendered('');
        setCompletedSale(null);
        setScanError(null);
        setSelectedCustomer(null);
        setCustomerSearch('');
        setPaymentMethod('cash');
        setIsCollectingCard(false);
        scannerRef.current?.focus();
    };

    const quickCashAmounts = [1, 5, 10, 20, 50, 100];

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
        setCustomerSearch('');
        setShowCustomerDropdown(false);
    };

    const handleClearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerSearch('');
    };

    const handleCreateCustomer = async () => {
        if (!newCustomerData.name.trim()) return;

        const { data, error } = await createCustomer(newCustomerData);
        if (!error && data) {
            setSelectedCustomer(data);
            setShowNewCustomerModal(false);
            setNewCustomerData({ name: '', email: null, phone: null, notes: null });
        }
    };

    return (
        <div className="animate-fadeIn h-[calc(100vh-7rem)]">
            <Header
                title="Point of Sale"
                actions={
                    cart.length > 0 && (
                        <Button variant="ghost" onClick={handleNewSale}>
                            Clear
                        </Button>
                    )
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                {/* Left: Scanner + Cart */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Scanner Input */}
                    <Card variant="outlined">
                        <CardContent>
                            <form onSubmit={handleScan}>
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
                                                {item.item.variant && (
                                                    <p className="text-xs text-[var(--color-muted)]">
                                                        {item.item.variant}
                                                    </p>
                                                )}
                                                <p className="text-xs font-mono text-[var(--color-muted)]">
                                                    {item.item.sku}
                                                </p>
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
                                            <div className="w-24 text-right">
                                                <p className="font-medium">
                                                    {formatCurrency(item.lineTotal)}
                                                </p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    @ {formatCurrency(Number(item.item.price))}
                                                </p>
                                            </div>
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

                {/* Right: Customer + Totals + Tender */}
                <div className="flex flex-col gap-4">
                    {/* Customer Selection */}
                    <Card variant="outlined">
                        <CardContent>
                            <p className="text-sm font-medium mb-2">Customer (Optional)</p>
                            {selectedCustomer ? (
                                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
                                    <div>
                                        <p className="font-medium text-[var(--color-foreground)]">
                                            {selectedCustomer.name}
                                        </p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {selectedCustomer.phone || selectedCustomer.email || 'No contact info'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleClearCustomer}
                                        className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                                    >
                                        <XIcon />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            placeholder="Search by name, phone, or email..."
                                            leftIcon={isSearchingCustomer ? <LoadingSpinner size={16} /> : <SearchIcon />}
                                        />
                                        {showCustomerDropdown && customerResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] z-50 max-h-48 overflow-y-auto">
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
                                                        setNewCustomerData({ name: customerSearch, email: null, phone: null, notes: null });
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
                                            setNewCustomerData({ name: '', email: null, phone: null, notes: null });
                                            setShowNewCustomerModal(true);
                                        }}
                                        className="shrink-0"
                                        title="Create New Customer"
                                    >
                                        <UserPlusIcon />
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Totals */}
                    <Card variant="elevated">
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Tax</span>
                                <span>{formatCurrency(taxTotal)}</span>
                            </div>
                            <div className="flex justify-between text-2xl font-bold pt-3 border-t border-[var(--color-border)]">
                                <span>Total</span>
                                <span className="text-[var(--color-primary)]">
                                    {formatCurrency(total)}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Method */}
                    <Card variant="outlined" className="flex-1">
                        <CardContent className="h-full flex flex-col">
                            {/* Payment Method Toggle */}
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={() => setPaymentMethod('cash')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        paymentMethod === 'cash'
                                            ? 'bg-[var(--color-primary)] text-white'
                                            : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                                >
                                    <CashIcon />
                                    Cash
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('card')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        paymentMethod === 'card'
                                            ? 'bg-[var(--color-primary)] text-white'
                                            : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                                >
                                    <CardIcon />
                                    Card
                                </button>
                            </div>

                            {paymentMethod === 'cash' ? (
                                <>
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
                                        {total > 0 && (
                                            <button
                                                onClick={() => setCashTendered(Math.ceil(total).toString())}
                                                className="col-span-3 py-2 px-3 rounded-lg bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-sm font-medium transition-colors"
                                            >
                                                Exact: {formatCurrency(Math.ceil(total))}
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

                                    {/* Complete Cash Sale Button */}
                                    <div className="mt-auto pt-4">
                                        <Button
                                            size="xl"
                                            className="w-full"
                                            onClick={handleCompleteCashSale}
                                            disabled={cart.length === 0 || cashAmount < total}
                                            isLoading={isProcessing}
                                        >
                                            Complete Cash Sale
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Card Reader Status */}
                                    <div className="mb-4">
                                        <p className="text-sm font-medium mb-2">Card Reader</p>
                                        {connectedReader ? (
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                                                    <span className="text-sm font-medium">{connectedReader.label}</span>
                                                </div>
                                                <button
                                                    onClick={disconnectReader}
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
                                                    {formatCurrency(total)}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Complete Card Sale Button */}
                                    <div className="mt-auto pt-4">
                                        <Button
                                            size="xl"
                                            className="w-full"
                                            onClick={handleCompleteCardSale}
                                            disabled={cart.length === 0 || !connectedReader || isCollectingCard}
                                            isLoading={isCollectingCard}
                                        >
                                            {isCollectingCard ? 'Processing...' : `Charge ${formatCurrency(total)}`}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
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
                                onClick={() => discoverReaders(true)}
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
                                    await connectReader(reader);
                                    setShowReaderModal(false);
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

            {/* Receipt Modal */}
            <Modal
                isOpen={!!completedSale}
                onClose={handleNewSale}
                title="Sale Complete!"
                size="md"
            >
                {completedSale && (
                    <Receipt
                        sale={completedSale}
                        items={cart}
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
