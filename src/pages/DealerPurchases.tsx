import { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useDealers } from '../hooks/useDealers';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { Dealer, DealerInput, PaymentMethod } from '../types';

interface DraftPurchaseItem {
    id: string;
    item_name: string;
    description: string;
    quantity: string;
    unit_cost: string;
}

interface DealerPurchaseRow {
    id: string;
    purchased_at: string;
    total: number;
    payment_method: PaymentMethod;
    check_number: string | null;
    notes: string | null;
    dealer: {
        id: string;
        name: string;
        business_name: string | null;
    } | null;
    dealer_purchase_items: Array<{
        id: string;
        item_name: string;
        quantity: number;
        unit_cost: number;
        line_total: number;
    }>;
}

const EMPTY_DEALER_FORM: DealerInput = {
    name: '',
    business_name: null,
    email: null,
    phone: null,
    notes: null,
    is_active: true,
};

function createDraftItem(): DraftPurchaseItem {
    return {
        id: crypto.randomUUID(),
        item_name: '',
        description: '',
        quantity: '1',
        unit_cost: '',
    };
}

export function DealerPurchases() {
    const { userRecord } = useAuth();
    const toast = useToast();
    const { dealers, createDealer, searchDealers } = useDealers();

    const [items, setItems] = useState<DraftPurchaseItem[]>([createDraftItem()]);
    const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
    const [dealerSearch, setDealerSearch] = useState('');
    const [dealerResults, setDealerResults] = useState<Dealer[]>([]);
    const [isSearchingDealer, setIsSearchingDealer] = useState(false);
    const [showDealerDropdown, setShowDealerDropdown] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [checkNumber, setCheckNumber] = useState('');
    const [purchaseNotes, setPurchaseNotes] = useState('');
    const [isSavingPurchase, setIsSavingPurchase] = useState(false);
    const [showNewDealerModal, setShowNewDealerModal] = useState(false);
    const [newDealerForm, setNewDealerForm] = useState<DealerInput>(EMPTY_DEALER_FORM);
    const [purchaseHistory, setPurchaseHistory] = useState<DealerPurchaseRow[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    const normalizedItems = useMemo(() => items.map((item) => {
        const quantity = Math.max(0, Number.parseInt(item.quantity || '0', 10) || 0);
        const unitCost = Math.max(0, Number.parseFloat(item.unit_cost || '0') || 0);
        return {
            ...item,
            quantity,
            unitCost,
            lineTotal: quantity * unitCost,
        };
    }), [items]);

    const subtotal = useMemo(
        () => normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0),
        [normalizedItems]
    );

    useEffect(() => {
        if (dealerSearch.trim().length < 2 || selectedDealer) {
            setDealerResults([]);
            setShowDealerDropdown(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingDealer(true);
            const { data, error } = await searchDealers(dealerSearch.trim());
            setIsSearchingDealer(false);
            if (error) {
                setDealerResults([]);
                setShowDealerDropdown(false);
                return;
            }
            setDealerResults(data);
            setShowDealerDropdown(true);
        }, 250);

        return () => clearTimeout(timer);
    }, [dealerSearch, searchDealers, selectedDealer]);

    const loadPurchaseHistory = async () => {
        setIsLoadingHistory(true);
        const { data, error } = await supabase
            .from('dealer_purchases')
            .select(`
                id,
                purchased_at,
                total,
                payment_method,
                check_number,
                notes,
                dealer:dealers(id, name, business_name),
                dealer_purchase_items(id, item_name, quantity, unit_cost, line_total)
            `)
            .order('purchased_at', { ascending: false })
            .limit(25);

        if (error) {
            toast.error('Failed to load purchase history', error.message);
            setPurchaseHistory([]);
            setIsLoadingHistory(false);
            return;
        }

        setPurchaseHistory((data || []) as unknown as DealerPurchaseRow[]);
        setIsLoadingHistory(false);
    };

    useEffect(() => {
        void loadPurchaseHistory();
    }, []);

    const addItemRow = () => {
        setItems((prev) => [...prev, createDraftItem()]);
    };

    const removeItemRow = (id: string) => {
        setItems((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((item) => item.id !== id);
        });
    };

    const updateItem = (id: string, patch: Partial<DraftPurchaseItem>) => {
        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
        );
    };

    const selectDealer = (dealer: Dealer) => {
        setSelectedDealer(dealer);
        setDealerSearch('');
        setDealerResults([]);
        setShowDealerDropdown(false);
    };

    const createDealerInline = async () => {
        if (!newDealerForm.name.trim()) return;
        const { data, error } = await createDealer(newDealerForm);
        if (error || !data) {
            toast.error('Failed to add dealer', error || 'Please try again.');
            return;
        }
        setSelectedDealer(data);
        setNewDealerForm(EMPTY_DEALER_FORM);
        setShowNewDealerModal(false);
        toast.success('Dealer added', `${data.name} is ready for this purchase.`);
    };

    const handleSavePurchase = async () => {
        if (!selectedDealer) {
            toast.error('Select a dealer first');
            return;
        }

        const validItems = normalizedItems.filter((item) => item.item_name.trim() && item.quantity > 0 && item.unitCost >= 0);
        if (validItems.length === 0) {
            toast.error('Add at least one item with quantity and unit cost');
            return;
        }

        if (paymentMethod === 'check' && !checkNumber.trim()) {
            toast.error('Check number is required for check payments');
            return;
        }

        const total = Math.round(subtotal * 100) / 100;

        setIsSavingPurchase(true);
        const { data: purchase, error: purchaseError } = await supabase
            .from('dealer_purchases')
            .insert({
                dealer_id: selectedDealer.id,
                subtotal: total,
                tax_amount: 0,
                total,
                payment_method: paymentMethod,
                check_number: paymentMethod === 'check' ? checkNumber.trim() : null,
                notes: purchaseNotes.trim() || null,
                processed_by_user: userRecord?.id || null,
            })
            .select('id')
            .single();

        if (purchaseError || !purchase) {
            setIsSavingPurchase(false);
            toast.error('Failed to save purchase', purchaseError?.message || 'Please try again.');
            return;
        }

        const { error: itemInsertError } = await supabase
            .from('dealer_purchase_items')
            .insert(validItems.map((item) => ({
                dealer_purchase_id: purchase.id,
                item_name: item.item_name.trim(),
                description: item.description.trim() || null,
                quantity: item.quantity,
                unit_cost: item.unitCost,
                line_total: Math.round(item.lineTotal * 100) / 100,
            })));

        setIsSavingPurchase(false);

        if (itemInsertError) {
            toast.error('Purchase saved, but item lines failed', itemInsertError.message);
            return;
        }

        toast.success('Dealer purchase recorded', `${formatCurrency(total)} via ${paymentMethod}.`);
        setItems([createDraftItem()]);
        setPurchaseNotes('');
        setCheckNumber('');
        setPaymentMethod('cash');
        setSelectedDealer(null);
        await loadPurchaseHistory();
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Purchase from Dealer"
                description="Record inventory buys from dealers so cash-out and purchase history are tracked."
                actions={
                    <Button onClick={handleSavePurchase} isLoading={isSavingPurchase}>
                        Save Purchase
                    </Button>
                }
            />

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 mb-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Purchase Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {items.map((item, index) => {
                            const normalized = normalizedItems.find((entry) => entry.id === item.id);
                            return (
                                <div key={item.id} className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-[var(--color-muted)]">Item {index + 1}</p>
                                        <button
                                            type="button"
                                            onClick={() => removeItemRow(item.id)}
                                            className="text-xs text-[var(--color-danger)] disabled:opacity-50"
                                            disabled={items.length <= 1}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                    <Input
                                        label="Item Name"
                                        value={item.item_name}
                                        onChange={(e) => updateItem(item.id, { item_name: e.target.value })}
                                        placeholder="Vintage lamp"
                                    />
                                    <Input
                                        label="Description (Optional)"
                                        value={item.description}
                                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                                        placeholder="Any notes about condition, lot, etc."
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input
                                            label="Quantity"
                                            type="number"
                                            min={1}
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                                        />
                                        <Input
                                            label="Unit Cost"
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={item.unit_cost}
                                            onChange={(e) => updateItem(item.id, { unit_cost: e.target.value })}
                                        />
                                    </div>
                                    <div className="text-sm text-right text-[var(--color-muted)]">
                                        Line Total: <span className="font-semibold text-[var(--color-foreground)]">{formatCurrency(normalized?.lineTotal || 0)}</span>
                                    </div>
                                </div>
                            );
                        })}

                        <Button variant="ghost" onClick={addItemRow}>
                            + Add Item Line
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Dealer + Payment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm font-medium mb-2">Dealer *</p>
                            {selectedDealer ? (
                                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium">{selectedDealer.name}</p>
                                        <p className="text-sm text-[var(--color-muted)]">
                                            {selectedDealer.business_name || selectedDealer.phone || selectedDealer.email || 'No contact info'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDealer(null)}
                                        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                                    >
                                        Change
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Input
                                        value={dealerSearch}
                                        onChange={(e) => setDealerSearch(e.target.value)}
                                        placeholder="Search dealers..."
                                        leftIcon={isSearchingDealer ? <LoadingSpinner size={16} /> : <SearchIcon />}
                                    />
                                    {showDealerDropdown && dealerResults.length > 0 && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                            {dealerResults.map((dealer) => (
                                                <button
                                                    key={dealer.id}
                                                    type="button"
                                                    onClick={() => selectDealer(dealer)}
                                                    className="w-full px-3 py-2 text-left hover:bg-[var(--color-surface)] border-b border-[var(--color-border)] last:border-b-0"
                                                >
                                                    <p className="font-medium text-sm">{dealer.name}</p>
                                                    <p className="text-xs text-[var(--color-muted)]">
                                                        {dealer.business_name || dealer.phone || dealer.email || 'No contact info'}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {dealerSearch.trim().length >= 2 && dealerResults.length === 0 && !isSearchingDealer && (
                                        <p className="text-xs text-[var(--color-muted)] mt-2">No dealer matches found.</p>
                                    )}
                                </div>
                            )}
                            <Button variant="ghost" className="mt-2" onClick={() => setShowNewDealerModal(true)}>
                                + Add New Dealer
                            </Button>
                            {dealers.length === 0 && (
                                <p className="text-xs text-[var(--color-muted)] mt-2">No dealers in your directory yet.</p>
                            )}
                        </div>

                        <div>
                            <p className="text-sm font-medium mb-2">Payment Method</p>
                            <div className="flex rounded-lg border border-[var(--color-border)] p-1 bg-[var(--color-surface)]">
                                {(['cash', 'card', 'check'] as PaymentMethod[]).map((method) => (
                                    <button
                                        key={method}
                                        type="button"
                                        onClick={() => setPaymentMethod(method)}
                                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${paymentMethod === method
                                            ? 'bg-[var(--color-primary)] text-white'
                                            : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                                            }`}
                                    >
                                        {method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : 'Check'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentMethod === 'check' && (
                            <Input
                                label="Check Number *"
                                value={checkNumber}
                                onChange={(e) => setCheckNumber(e.target.value)}
                                placeholder="Enter check number"
                            />
                        )}

                        <Textarea
                            label="Purchase Notes"
                            value={purchaseNotes}
                            onChange={(e) => setPurchaseNotes(e.target.value)}
                            rows={3}
                            placeholder="Optional notes for this purchase"
                        />

                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Items</span>
                                <span className="font-medium">{normalizedItems.filter((item) => item.item_name.trim()).length}</span>
                            </div>
                            <div className="flex items-center justify-between text-lg mt-2">
                                <span className="font-medium">Total Purchase</span>
                                <span className="font-bold">{formatCurrency(subtotal)}</span>
                            </div>
                            {paymentMethod === 'cash' && (
                                <p className="text-xs text-[var(--color-muted)] mt-2">
                                    Cash purchase totals are automatically subtracted from expected till cash.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Dealer Purchases</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingHistory ? (
                        <div className="py-8 flex justify-center">
                            <LoadingSpinner />
                        </div>
                    ) : purchaseHistory.length === 0 ? (
                        <p className="text-sm text-[var(--color-muted)]">No dealer purchases recorded yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {purchaseHistory.map((purchase) => (
                                <div key={purchase.id} className="rounded-lg border border-[var(--color-border)] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-medium">
                                                {purchase.dealer?.name || 'Deleted dealer'} • {formatCurrency(Number(purchase.total || 0))}
                                            </p>
                                            <p className="text-xs text-[var(--color-muted)]">
                                                {formatDateTime(purchase.purchased_at)} • {purchase.payment_method.toUpperCase()}
                                                {purchase.payment_method === 'check' && purchase.check_number ? ` #${purchase.check_number}` : ''}
                                            </p>
                                        </div>
                                        <span className="text-xs text-[var(--color-muted)]">
                                            {purchase.dealer_purchase_items?.length || 0} item line{(purchase.dealer_purchase_items?.length || 0) === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    {purchase.notes && (
                                        <p className="text-sm text-[var(--color-muted)] mt-2">{purchase.notes}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Modal
                isOpen={showNewDealerModal}
                onClose={() => setShowNewDealerModal(false)}
                title="Add New Dealer"
                size="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Dealer Name *"
                        value={newDealerForm.name}
                        onChange={(e) => setNewDealerForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Dealer name"
                    />
                    <Input
                        label="Business Name"
                        value={newDealerForm.business_name || ''}
                        onChange={(e) => setNewDealerForm((prev) => ({ ...prev, business_name: e.target.value || null }))}
                        placeholder="Business name"
                    />
                    <Input
                        label="Phone"
                        value={newDealerForm.phone || ''}
                        onChange={(e) => setNewDealerForm((prev) => ({ ...prev, phone: e.target.value || null }))}
                        placeholder="(555) 123-4567"
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={newDealerForm.email || ''}
                        onChange={(e) => setNewDealerForm((prev) => ({ ...prev, email: e.target.value || null }))}
                        placeholder="dealer@example.com"
                    />
                    <Textarea
                        label="Notes"
                        value={newDealerForm.notes || ''}
                        onChange={(e) => setNewDealerForm((prev) => ({ ...prev, notes: e.target.value || null }))}
                        rows={3}
                        placeholder="Optional notes"
                    />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setShowNewDealerModal(false)}>Cancel</Button>
                    <Button onClick={createDealerInline} disabled={!newDealerForm.name.trim()}>
                        Add Dealer
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
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
