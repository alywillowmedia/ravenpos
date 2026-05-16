import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
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
    subtotal: number;
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
        description: string | null;
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

function draftItemsFromPurchase(purchase: DealerPurchaseRow): DraftPurchaseItem[] {
    if (!purchase.dealer_purchase_items?.length) return [createDraftItem()];

    return purchase.dealer_purchase_items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        description: item.description || '',
        quantity: String(item.quantity || 1),
        unit_cost: String(Number(item.unit_cost || 0)),
    }));
}

function toLocalDateTimeInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

function toTimestamp(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
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
    const [selectedHistoryPurchase, setSelectedHistoryPurchase] = useState<DealerPurchaseRow | null>(null);
    const [commentTarget, setCommentTarget] = useState<DealerPurchaseRow | null>(null);
    const [commentText, setCommentText] = useState('');
    const [isSavingComment, setIsSavingComment] = useState(false);
    const [editTarget, setEditTarget] = useState<DealerPurchaseRow | null>(null);
    const [editDealerId, setEditDealerId] = useState('');
    const [editPurchasedAt, setEditPurchasedAt] = useState('');
    const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('cash');
    const [editCheckNumber, setEditCheckNumber] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editItems, setEditItems] = useState<DraftPurchaseItem[]>([createDraftItem()]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DealerPurchaseRow | null>(null);
    const [isDeletingPurchase, setIsDeletingPurchase] = useState(false);

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

    const normalizedEditItems = useMemo(() => editItems.map((item) => {
        const quantity = Math.max(0, Number.parseInt(item.quantity || '0', 10) || 0);
        const unitCost = Math.max(0, Number.parseFloat(item.unit_cost || '0') || 0);
        return {
            ...item,
            quantity,
            unitCost,
            lineTotal: quantity * unitCost,
        };
    }), [editItems]);

    const editSubtotal = useMemo(
        () => normalizedEditItems.reduce((sum, item) => sum + item.lineTotal, 0),
        [normalizedEditItems]
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

    const loadPurchaseHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        const { data, error } = await supabase
            .from('dealer_purchases')
            .select(`
                id,
                purchased_at,
                subtotal,
                total,
                payment_method,
                check_number,
                notes,
                dealer:dealers(id, name, business_name),
                dealer_purchase_items(id, item_name, description, quantity, unit_cost, line_total)
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
    }, [toast]);

    useEffect(() => {
        void loadPurchaseHistory();
    }, [loadPurchaseHistory]);

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

    const addEditItemRow = () => {
        setEditItems((prev) => [...prev, createDraftItem()]);
    };

    const removeEditItemRow = (id: string) => {
        setEditItems((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((item) => item.id !== id);
        });
    };

    const updateEditItem = (id: string, patch: Partial<DraftPurchaseItem>) => {
        setEditItems((prev) =>
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

    const openCommentModal = (purchase: DealerPurchaseRow) => {
        setCommentTarget(purchase);
        setCommentText(purchase.notes || '');
    };

    const handleSaveComment = async () => {
        if (!commentTarget) return;

        setIsSavingComment(true);
        const nextNotes = commentText.trim() || null;
        const { error } = await supabase
            .from('dealer_purchases')
            .update({ notes: nextNotes })
            .eq('id', commentTarget.id);
        setIsSavingComment(false);

        if (error) {
            toast.error('Failed to save comment', error.message);
            return;
        }

        setPurchaseHistory((prev) => prev.map((purchase) => (
            purchase.id === commentTarget.id ? { ...purchase, notes: nextNotes } : purchase
        )));
        setSelectedHistoryPurchase((prev) => (
            prev?.id === commentTarget.id ? { ...prev, notes: nextNotes } : prev
        ));
        setCommentTarget(null);
        setCommentText('');
        toast.success('Comment saved');
    };

    const openEditModal = (purchase: DealerPurchaseRow) => {
        setEditTarget(purchase);
        setEditDealerId(purchase.dealer?.id || '');
        setEditPurchasedAt(toLocalDateTimeInput(purchase.purchased_at));
        setEditPaymentMethod(purchase.payment_method);
        setEditCheckNumber(purchase.check_number || '');
        setEditNotes(purchase.notes || '');
        setEditItems(draftItemsFromPurchase(purchase));
    };

    const closeEditModal = () => {
        setEditTarget(null);
        setEditDealerId('');
        setEditPurchasedAt('');
        setEditPaymentMethod('cash');
        setEditCheckNumber('');
        setEditNotes('');
        setEditItems([createDraftItem()]);
    };

    const handleSaveEdit = async () => {
        if (!editTarget) return;

        const validItems = normalizedEditItems.filter((item) => item.item_name.trim() && item.quantity > 0 && item.unitCost >= 0);
        if (validItems.length === 0) {
            toast.error('Add at least one item with quantity and unit cost');
            return;
        }

        if (editPaymentMethod === 'check' && !editCheckNumber.trim()) {
            toast.error('Check number is required for check payments');
            return;
        }

        const purchasedAtTimestamp = toTimestamp(editPurchasedAt);
        if (!purchasedAtTimestamp) {
            toast.error('Choose a valid purchase date and time');
            return;
        }

        const total = Math.round(editSubtotal * 100) / 100;

        setIsSavingEdit(true);
        const { error: purchaseError } = await supabase
            .from('dealer_purchases')
            .update({
                dealer_id: editDealerId || null,
                purchased_at: purchasedAtTimestamp,
                subtotal: total,
                tax_amount: 0,
                total,
                payment_method: editPaymentMethod,
                check_number: editPaymentMethod === 'check' ? editCheckNumber.trim() : null,
                notes: editNotes.trim() || null,
            })
            .eq('id', editTarget.id);

        if (purchaseError) {
            setIsSavingEdit(false);
            toast.error('Failed to update purchase', purchaseError.message);
            return;
        }

        const { error: deleteItemsError } = await supabase
            .from('dealer_purchase_items')
            .delete()
            .eq('dealer_purchase_id', editTarget.id);

        if (deleteItemsError) {
            setIsSavingEdit(false);
            toast.error('Purchase updated, but old item lines could not be replaced', deleteItemsError.message);
            return;
        }

        const { error: insertItemsError } = await supabase
            .from('dealer_purchase_items')
            .insert(validItems.map((item) => ({
                dealer_purchase_id: editTarget.id,
                item_name: item.item_name.trim(),
                description: item.description.trim() || null,
                quantity: item.quantity,
                unit_cost: item.unitCost,
                line_total: Math.round(item.lineTotal * 100) / 100,
            })));

        setIsSavingEdit(false);

        if (insertItemsError) {
            toast.error('Purchase updated, but item lines failed', insertItemsError.message);
            return;
        }

        toast.success('Dealer purchase updated');
        closeEditModal();
        setSelectedHistoryPurchase(null);
        await loadPurchaseHistory();
    };

    const handleDeletePurchase = async () => {
        if (!deleteTarget) return;

        setIsDeletingPurchase(true);
        const { error } = await supabase
            .from('dealer_purchases')
            .delete()
            .eq('id', deleteTarget.id);
        setIsDeletingPurchase(false);

        if (error) {
            toast.error('Failed to delete purchase', error.message);
            return;
        }

        setPurchaseHistory((prev) => prev.filter((purchase) => purchase.id !== deleteTarget.id));
        setSelectedHistoryPurchase((prev) => (prev?.id === deleteTarget.id ? null : prev));
        setDeleteTarget(null);
        toast.success('Dealer purchase deleted');
    };

    const dealerOptions = [
        { value: '', label: 'No dealer linked' },
        ...dealers.map((dealer) => ({
            value: dealer.id,
            label: dealer.business_name ? `${dealer.name} - ${dealer.business_name}` : dealer.name,
        })),
    ];

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
                                <button
                                    key={purchase.id}
                                    type="button"
                                    onClick={() => setSelectedHistoryPurchase(purchase)}
                                    className="w-full rounded-lg border border-[var(--color-border)] p-3 text-left transition-colors hover:bg-[var(--color-surface)]"
                                >
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
                                        <div className="text-right">
                                            <span className="block text-xs text-[var(--color-muted)]">
                                                {purchase.dealer_purchase_items?.length || 0} item line{(purchase.dealer_purchase_items?.length || 0) === 1 ? '' : 's'}
                                            </span>
                                            <span className="mt-1 block text-xs font-medium text-[var(--color-primary)]">
                                                View details
                                            </span>
                                        </div>
                                    </div>
                                    {purchase.notes && (
                                        <p className="mt-2 text-sm text-[var(--color-muted)]">{purchase.notes}</p>
                                    )}
                                </button>
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

            <Modal
                isOpen={!!selectedHistoryPurchase}
                onClose={() => setSelectedHistoryPurchase(null)}
                title="Dealer Purchase Details"
                description={selectedHistoryPurchase
                    ? `${selectedHistoryPurchase.dealer?.name || 'Deleted dealer'} • ${formatDateTime(selectedHistoryPurchase.purchased_at)}`
                    : undefined}
                size="lg"
            >
                {selectedHistoryPurchase && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-3">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Payment</p>
                                <p className="mt-1 font-medium text-[var(--color-foreground)]">
                                    {selectedHistoryPurchase.payment_method.toUpperCase()}
                                    {selectedHistoryPurchase.payment_method === 'check' && selectedHistoryPurchase.check_number
                                        ? ` #${selectedHistoryPurchase.check_number}`
                                        : ''}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Subtotal</p>
                                <p className="mt-1 font-medium text-[var(--color-foreground)]">
                                    {formatCurrency(Number(selectedHistoryPurchase.subtotal || 0))}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Total</p>
                                <p className="mt-1 font-semibold text-[var(--color-foreground)]">
                                    {formatCurrency(Number(selectedHistoryPurchase.total || 0))}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-[var(--color-border)] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Purchase Comments</p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openCommentModal(selectedHistoryPurchase)}
                                >
                                    {selectedHistoryPurchase.notes ? 'Edit Comment' : 'Add Comment'}
                                </Button>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-foreground)]">
                                {selectedHistoryPurchase.notes?.trim() || 'No comments yet.'}
                            </p>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                            <table className="min-w-full divide-y divide-[var(--color-border)]">
                                <thead className="bg-[var(--color-surface)]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Item</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Description</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Qty</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Price Bought For</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Line Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-card)]">
                                    {selectedHistoryPurchase.dealer_purchase_items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-4 py-3 align-top text-sm font-medium text-[var(--color-foreground)]">
                                                {item.item_name}
                                            </td>
                                            <td className="px-4 py-3 align-top text-sm text-[var(--color-muted)]">
                                                {item.description?.trim() || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right align-top text-sm text-[var(--color-foreground)]">
                                                {item.quantity}
                                            </td>
                                            <td className="px-4 py-3 text-right align-top text-sm text-[var(--color-foreground)]">
                                                {formatCurrency(Number(item.unit_cost || 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right align-top text-sm font-medium text-[var(--color-foreground)]">
                                                {formatCurrency(Number(item.line_total || 0))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                <ModalFooter>
                    {selectedHistoryPurchase && (
                        <>
                            <Button
                                variant="danger"
                                onClick={() => setDeleteTarget(selectedHistoryPurchase)}
                            >
                                Delete
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => openEditModal(selectedHistoryPurchase)}
                            >
                                Edit
                            </Button>
                        </>
                    )}
                    <Button variant="ghost" onClick={() => setSelectedHistoryPurchase(null)}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={!!commentTarget}
                onClose={() => {
                    setCommentTarget(null);
                    setCommentText('');
                }}
                title="Comment on Dealer Purchase"
                description={commentTarget
                    ? `${commentTarget.dealer?.name || 'Deleted dealer'} • ${formatCurrency(Number(commentTarget.total || 0))}`
                    : undefined}
                size="md"
            >
                <Textarea
                    label="Comment"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={5}
                    placeholder="Add context, follow-up notes, or corrections for this transaction"
                />
                <ModalFooter>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setCommentTarget(null);
                            setCommentText('');
                        }}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSaveComment} isLoading={isSavingComment}>
                        Save Comment
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={!!editTarget}
                onClose={closeEditModal}
                title="Edit Dealer Purchase"
                description={editTarget
                    ? `${editTarget.dealer?.name || 'Deleted dealer'} • ${formatDateTime(editTarget.purchased_at)}`
                    : undefined}
                size="4xl"
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Select
                            label="Dealer"
                            options={dealerOptions}
                            value={editDealerId}
                            onChange={(e) => setEditDealerId(e.target.value)}
                        />
                        <Input
                            label="Purchase Date + Time"
                            type="datetime-local"
                            value={editPurchasedAt}
                            step={60}
                            onChange={(e) => setEditPurchasedAt(e.target.value)}
                        />
                        <Select
                            label="Payment Method"
                            options={[
                                { value: 'cash', label: 'Cash' },
                                { value: 'card', label: 'Card' },
                                { value: 'check', label: 'Check' },
                            ]}
                            value={editPaymentMethod}
                            onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                        />
                        {editPaymentMethod === 'check' && (
                            <Input
                                label="Check Number *"
                                value={editCheckNumber}
                                onChange={(e) => setEditCheckNumber(e.target.value)}
                                placeholder="Enter check number"
                            />
                        )}
                    </div>

                    <Textarea
                        label="Purchase Comments"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={3}
                        placeholder="Optional comments for this purchase"
                    />

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Item Lines</h3>
                            <Button variant="ghost" size="sm" onClick={addEditItemRow}>
                                + Add Line
                            </Button>
                        </div>
                        {editItems.map((item, index) => {
                            const normalized = normalizedEditItems.find((entry) => entry.id === item.id);
                            return (
                                <div key={item.id} className="rounded-lg border border-[var(--color-border)] p-3">
                                    <div className="mb-3 flex items-center justify-between">
                                        <p className="text-sm font-medium text-[var(--color-muted)]">Item {index + 1}</p>
                                        <button
                                            type="button"
                                            onClick={() => removeEditItemRow(item.id)}
                                            className="text-xs text-[var(--color-danger)] disabled:opacity-50"
                                            disabled={editItems.length <= 1}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.5fr_1.5fr_0.7fr_0.9fr_0.9fr]">
                                        <Input
                                            label="Item Name"
                                            value={item.item_name}
                                            onChange={(e) => updateEditItem(item.id, { item_name: e.target.value })}
                                            placeholder="Vintage lamp"
                                        />
                                        <Input
                                            label="Description"
                                            value={item.description}
                                            onChange={(e) => updateEditItem(item.id, { description: e.target.value })}
                                            placeholder="Condition, lot, etc."
                                        />
                                        <Input
                                            label="Qty"
                                            type="number"
                                            min={1}
                                            value={item.quantity}
                                            onChange={(e) => updateEditItem(item.id, { quantity: e.target.value })}
                                        />
                                        <Input
                                            label="Unit Cost"
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={item.unit_cost}
                                            onChange={(e) => updateEditItem(item.id, { unit_cost: e.target.value })}
                                        />
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-sm font-medium text-[var(--color-foreground)]">Line Total</span>
                                            <div className="flex min-h-[44px] items-center justify-end rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold">
                                                {formatCurrency(normalized?.lineTotal || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <div className="flex items-center justify-between text-lg">
                            <span className="font-medium">Updated Total</span>
                            <span className="font-bold">{formatCurrency(editSubtotal)}</span>
                        </div>
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={closeEditModal}>Cancel</Button>
                    <Button onClick={handleSaveEdit} isLoading={isSavingEdit}>
                        Save Changes
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Dealer Purchase"
                description={deleteTarget
                    ? `Delete the ${formatCurrency(Number(deleteTarget.total || 0))} purchase from ${deleteTarget.dealer?.name || 'this dealer'}? This removes the transaction and its item lines.`
                    : undefined}
                size="sm"
            >
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                        Cancel
                    </Button>
                    <Button variant="danger" isLoading={isDeletingPurchase} onClick={handleDeletePurchase}>
                        Delete Purchase
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
