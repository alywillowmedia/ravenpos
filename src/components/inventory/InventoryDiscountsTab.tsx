import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Table, type Column } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { useInventoryPricingDiscounts } from '../../hooks/useInventoryPricingDiscounts';
import type { Consignor, InventoryPricingDiscount, Item } from '../../types';

interface InventoryDiscountsTabProps {
    mode: 'admin' | 'vendor';
    userId?: string | null;
    currentConsignorId?: string;
    items: Item[];
    categories: string[];
    consignors: Consignor[];
}

type DiscountTargetScope = 'category' | 'item';

function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function toTimestamp(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function isLive(discount: InventoryPricingDiscount): boolean {
    if (!discount.is_active) return false;

    const now = new Date();
    const start = discount.starts_at ? new Date(discount.starts_at) : null;
    const end = discount.ends_at ? new Date(discount.ends_at) : null;

    if (start && !Number.isNaN(start.getTime()) && start > now) return false;
    if (end && !Number.isNaN(end.getTime()) && end < now) return false;

    return true;
}

export function InventoryDiscountsTab({
    mode,
    userId,
    currentConsignorId,
    items,
    categories,
    consignors,
}: InventoryDiscountsTabProps) {
    const toast = useToast();
    const [selectedConsignorId, setSelectedConsignorId] = useState('');
    const [targetScope, setTargetScope] = useState<DiscountTargetScope>('category');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [percentOff, setPercentOff] = useState('');
    const [title, setTitle] = useState('');
    const [startsAt, setStartsAt] = useState('');
    const [endsAt, setEndsAt] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const { discounts, isLoading, createDiscount, updateDiscount, deleteDiscount } = useInventoryPricingDiscounts({
        consignorId: mode === 'vendor' ? currentConsignorId : undefined,
    });

    useEffect(() => {
        if (mode === 'vendor') {
            setSelectedConsignorId(currentConsignorId || '');
            return;
        }

        if (selectedConsignorId) return;
        if (consignors.length === 0) return;
        setSelectedConsignorId(consignors[0].id);
    }, [consignors, currentConsignorId, mode, selectedConsignorId]);

    useEffect(() => {
        if (targetScope === 'category') {
            setSelectedItemId('');
            return;
        }
        setSelectedCategory('');
    }, [targetScope]);

    const filteredItemsForTarget = useMemo(() => {
        const normalizedSearch = itemSearch.trim().toLowerCase();

        return items
            .filter((item) => {
                if (!selectedConsignorId) return false;
                if (item.consignor_id !== selectedConsignorId) return false;
                if (!normalizedSearch) return true;

                const haystack = `${item.name} ${item.sku} ${item.category}`.toLowerCase();
                return haystack.includes(normalizedSearch);
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [itemSearch, items, selectedConsignorId]);

    const visibleDiscounts = useMemo(() => {
        const base = mode === 'admin' && selectedConsignorId
            ? discounts.filter((discount) => discount.consignor_id === selectedConsignorId)
            : discounts;

        return [...base].sort((a, b) => {
            const aLive = isLive(a) ? 1 : 0;
            const bLive = isLive(b) ? 1 : 0;
            if (bLive !== aLive) return bLive - aLive;

            const aUpdated = new Date(a.updated_at).getTime();
            const bUpdated = new Date(b.updated_at).getTime();
            if (!Number.isNaN(aUpdated) && !Number.isNaN(bUpdated)) {
                return bUpdated - aUpdated;
            }

            return 0;
        });
    }, [discounts, mode, selectedConsignorId]);

    const liveCount = useMemo(
        () => visibleDiscounts.filter((discount) => isLive(discount)).length,
        [visibleDiscounts]
    );

    const itemScopeCount = useMemo(
        () => visibleDiscounts.filter((discount) => discount.scope === 'item').length,
        [visibleDiscounts]
    );

    const categoryScopeCount = useMemo(
        () => visibleDiscounts.filter((discount) => discount.scope === 'category').length,
        [visibleDiscounts]
    );

    const handleCreate = async () => {
        if (!selectedConsignorId) {
            toast.error('Pick a vendor', 'Select the vendor this discount should apply to.');
            return;
        }

        const parsedPercent = Number(percentOff);
        if (!Number.isFinite(parsedPercent) || parsedPercent <= 0 || parsedPercent > 100) {
            toast.error('Invalid percent', 'Enter a percentage between 0.01 and 100.');
            return;
        }

        if (targetScope === 'category' && !selectedCategory) {
            toast.error('Choose a category', 'Pick the category this discount applies to.');
            return;
        }

        if (targetScope === 'item' && !selectedItemId) {
            toast.error('Choose an item', 'Pick the item this discount applies to.');
            return;
        }

        const startsAtTimestamp = toTimestamp(startsAt);
        const endsAtTimestamp = toTimestamp(endsAt);

        if ((startsAt && !startsAtTimestamp) || (endsAt && !endsAtTimestamp)) {
            toast.error('Invalid schedule', 'Enter valid start and end times.');
            return;
        }

        if (startsAtTimestamp && endsAtTimestamp && new Date(endsAtTimestamp) < new Date(startsAtTimestamp)) {
            toast.error('Invalid schedule', 'End time must be on or after the start time.');
            return;
        }

        setIsSaving(true);
        const { error } = await createDiscount({
            consignor_id: selectedConsignorId,
            scope: targetScope,
            category: targetScope === 'category' ? selectedCategory : null,
            item_id: targetScope === 'item' ? selectedItemId : null,
            percent_off: parsedPercent,
            title: title || null,
            starts_at: startsAtTimestamp,
            ends_at: endsAtTimestamp,
            is_active: true,
            created_by_user_id: userId || null,
        });
        setIsSaving(false);

        if (error) {
            toast.error('Could not create discount', error);
            return;
        }

        toast.success('Discount created', 'The new discount is now available in POS pricing.');
        setPercentOff('');
        setTitle('');
        setStartsAt('');
        setEndsAt('');
        setSelectedCategory('');
        setSelectedItemId('');
        setItemSearch('');
    };

    const handleToggleActive = async (discount: InventoryPricingDiscount) => {
        const { error } = await updateDiscount(discount.id, { is_active: !discount.is_active });
        if (error) {
            toast.error('Could not update discount', error);
            return;
        }

        toast.success(
            discount.is_active ? 'Discount paused' : 'Discount activated',
            `${discount.scope === 'item' ? 'Item' : 'Category'} discount is now ${discount.is_active ? 'inactive' : 'active'}.`
        );
    };

    const handleDelete = async (discount: InventoryPricingDiscount) => {
        const targetLabel = discount.scope === 'item'
            ? (discount.item?.name || 'this item')
            : (discount.category || 'this category');

        if (!window.confirm(`Delete this discount for ${targetLabel}?`)) {
            return;
        }

        const { error } = await deleteDiscount(discount.id);
        if (error) {
            toast.error('Could not delete discount', error);
            return;
        }

        toast.success('Discount deleted');
    };

    const columns: Column<InventoryPricingDiscount>[] = [
        {
            key: 'status',
            header: 'Status',
            width: '110px',
            render: (discount) => {
                if (!discount.is_active) return <Badge variant="warning">Paused</Badge>;
                if (!isLive(discount)) return <Badge variant="info">Scheduled</Badge>;
                return <Badge variant="success">Live</Badge>;
            },
        },
        {
            key: 'title',
            header: 'Discount',
            minWidth: '260px',
            render: (discount) => (
                <div>
                    <p className="font-medium text-[var(--color-foreground)]">
                        {discount.title?.trim() || `${Number(discount.percent_off).toFixed(2)}% off`}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                        {discount.scope === 'item'
                            ? `Item: ${discount.item?.name || discount.item_id || 'Unknown item'}`
                            : `Category: ${discount.category || 'Unknown category'}`}
                    </p>
                </div>
            ),
        },
        {
            key: 'percent_off',
            header: 'Percent',
            width: '100px',
            render: (discount) => <span className="font-medium">{Number(discount.percent_off).toFixed(2)}%</span>,
        },
        {
            key: 'date_window',
            header: 'Schedule',
            minWidth: '220px',
            render: (discount) => (
                <span className="text-sm text-[var(--color-muted)]">
                    {`${formatDateTime(discount.starts_at)} - ${formatDateTime(discount.ends_at)}`}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '',
            width: '170px',
            render: (discount) => (
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleToggleActive(discount)}
                    >
                        {discount.is_active ? 'Pause' : 'Activate'}
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDelete(discount)}
                    >
                        Delete
                    </Button>
                </div>
            ),
        },
    ];

    const consignorOptions = [
        { value: '', label: mode === 'admin' ? 'Select vendor...' : 'No vendor selected' },
        ...consignors.map((consignor) => ({
            value: consignor.id,
            label: `${consignor.consignor_number} - ${consignor.name}`,
        })),
    ];

    const categoryOptions = [
        { value: '', label: 'Choose category...' },
        ...categories.map((category) => ({ value: category, label: category })),
    ];

    const itemOptions = [
        { value: '', label: 'Choose item...' },
        ...filteredItemsForTarget.slice(0, 500).map((item) => ({
            value: item.id,
            label: `${item.name} (${item.sku})`,
        })),
    ];

    const selectedConsignor = consignors.find((consignor) => consignor.id === selectedConsignorId);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Live Discounts</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{liveCount}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Category Rules</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{categoryScopeCount}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Item Rules</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{itemScopeCount}</p>
                    </CardContent>
                </Card>
            </div>

            <Card variant="outlined">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Create Discount</h2>
                        <p className="text-sm text-[var(--color-muted)]">
                            Configure percentage discounts for a full category or a specific item.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {mode === 'admin' ? (
                            <Select
                                label="Vendor"
                                options={consignorOptions}
                                value={selectedConsignorId}
                                onChange={(e) => setSelectedConsignorId(e.target.value)}
                            />
                        ) : (
                            <Input
                                label="Vendor"
                                value={selectedConsignor ? `${selectedConsignor.consignor_number} - ${selectedConsignor.name}` : 'Your account'}
                                readOnly
                            />
                        )}

                        <Select
                            label="Target"
                            options={[
                                { value: 'category', label: 'Category' },
                                { value: 'item', label: 'Specific Item' },
                            ]}
                            value={targetScope}
                            onChange={(e) => setTargetScope(e.target.value as DiscountTargetScope)}
                        />

                        <Input
                            label="Percent Off"
                            type="number"
                            min="0.01"
                            max="100"
                            step="0.01"
                            value={percentOff}
                            onChange={(e) => setPercentOff(e.target.value)}
                            placeholder="e.g. 15"
                        />

                        {targetScope === 'category' ? (
                            <Select
                                label="Category"
                                options={categoryOptions}
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                            />
                        ) : (
                            <div className="space-y-2">
                                <Input
                                    label="Search Items"
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                    placeholder="Search by name or SKU"
                                />
                                <Select
                                    label="Item"
                                    options={itemOptions}
                                    value={selectedItemId}
                                    onChange={(e) => setSelectedItemId(e.target.value)}
                                />
                            </div>
                        )}

                        <Input
                            label="Title (Optional)"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Spring sale, weekend promo..."
                        />

                        <Input
                            label="Start Time (Optional)"
                            type="datetime-local"
                            value={startsAt}
                            step={900}
                            onChange={(e) => setStartsAt(e.target.value)}
                        />

                        <Input
                            label="End Time (Optional)"
                            type="datetime-local"
                            value={endsAt}
                            step={900}
                            onChange={(e) => setEndsAt(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button
                            onClick={() => void handleCreate()}
                            isLoading={isSaving}
                            disabled={!selectedConsignorId || !percentOff}
                        >
                            Create Discount
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Discounts</h2>
                        <p className="text-sm text-[var(--color-muted)]">
                            {mode === 'admin'
                                ? 'Manage discount rules for the selected vendor.'
                                : 'Manage your active and scheduled discount rules.'}
                        </p>
                    </div>

                    <Table
                        ariaLabel="Inventory discounts"
                        data={visibleDiscounts}
                        columns={columns}
                        keyExtractor={(discount) => discount.id}
                        isLoading={isLoading}
                        emptyMessage="No discounts yet. Create your first discount above."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
