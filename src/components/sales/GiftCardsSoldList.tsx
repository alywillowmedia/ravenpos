import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Gift, Printer } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { printGiftCards } from '../giftcards/printGiftCards';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { GIFT_CARD_SHEET_SIZE_STORAGE_KEY, getGiftCardSheetSize } from '../../lib/giftCardBatch';
import { getGiftCardBrand, getGiftCardOccasion, type GiftCardVendorLike } from '../../lib/giftCardThemes';
import {
    describeGiftCardEntry,
    filterGiftCardSales,
    getGiftCardStatus,
    groupGiftCardSales,
    type GiftCardHistoryEntry,
    type GiftCardSale,
    type GiftCardSaleRow,
    type GiftCardStatusId,
} from '../../lib/giftCardSales';

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<GiftCardStatusId, 'success' | 'info' | 'default' | 'warning' | 'danger'> = {
    unused: 'success',
    partial: 'info',
    used: 'default',
    expired: 'warning',
    inactive: 'danger',
};

export interface GiftCardsSoldListProps {
    cards: GiftCardSaleRow[];
    state: 'loading' | 'ok' | 'error';
    searchQuery: string;
    vendors: GiftCardVendorLike[];
    onRetry: () => void;
}

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
}

function formatTime(value: string): string {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function paymentLabel(method: string | null): string {
    if (method === 'cash') return 'Cash';
    if (method === 'card') return 'Card';
    return 'Not recorded';
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Every gift card sold in the selected dates, one row per payment. */
export function GiftCardsSoldList({ cards, state, searchQuery, vendors, onRetry }: GiftCardsSoldListProps) {
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [history, setHistory] = useState<Record<string, GiftCardHistoryEntry[]>>({});
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [printError, setPrintError] = useState<string | null>(null);

    const vendorsById = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors]);
    const vendorNames = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor.name])), [vendors]);
    const allSales = useMemo(() => groupGiftCardSales(cards), [cards]);
    const sales = useMemo(() => filterGiftCardSales(allSales, searchQuery, vendorNames), [allSales, searchQuery, vendorNames]);
    const shownCards = useMemo(() => sales.flatMap((sale) => sale.cards), [sales]);
    const soldTotal = shownCards.reduce((sum, card) => sum + Math.round(Number(card.original_amount) * 100), 0) / 100;
    const unspentTotal = shownCards.reduce((sum, card) => sum + Math.round(Number(card.current_balance) * 100), 0) / 100;

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [searchQuery, cards]);

    // A card's history is only read once its sale is opened.
    const expandedSale = expandedKey ? allSales.find((sale) => sale.key === expandedKey) || null : null;
    const missingHistoryIds = expandedSale
        ? expandedSale.cards.filter((card) => !history[card.id]).map((card) => card.id).join(',')
        : '';
    useEffect(() => {
        if (!missingHistoryIds) return;
        let cancelled = false;
        const ids = missingHistoryIds.split(',');
        const load = async () => {
            setHistoryError(null);
            const { data, error } = await supabase
                .from('gift_card_transactions')
                .select('id, gift_card_id, amount, balance_after, entry_type, sale_id, refund_id, note, actor_name, created_at')
                .in('gift_card_id', ids)
                .order('created_at', { ascending: true });
            if (cancelled) return;
            if (error) {
                setHistoryError(error.message);
                return;
            }
            const next: Record<string, GiftCardHistoryEntry[]> = Object.fromEntries(ids.map((id) => [id, []]));
            for (const entry of (data || []) as GiftCardHistoryEntry[]) {
                next[entry.gift_card_id]?.push(entry);
            }
            setHistory((current) => ({ ...current, ...next }));
        };
        void load();
        return () => { cancelled = true; };
    }, [missingHistoryIds]);

    const vendorName = (card: GiftCardSaleRow): string | null =>
        card.consignor_id ? vendorNames.get(card.consignor_id) || 'One vendor' : null;

    const scopeLabel = (sale: GiftCardSale): string => {
        const names = new Set(sale.cards.map((card) => vendorName(card) || 'Whole store'));
        return names.size === 1 ? [...names][0] : 'Mixed';
    };

    const recipientLabel = (sale: GiftCardSale): string => {
        const names = sale.cards.map((card) => card.recipient_name).filter((name): name is string => Boolean(name));
        if (names.length === 0) return '—';
        return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
    };

    const handleReprint = async (toPrint: GiftCardSaleRow[]) => {
        setPrintError(null);
        let sizeId: string | null = null;
        try {
            sizeId = localStorage.getItem(GIFT_CARD_SHEET_SIZE_STORAGE_KEY);
        } catch {
            // Falls back to the default size.
        }
        const result = await printGiftCards(toPrint.map((card) => {
            const vendor = card.consignor_id
                ? vendorsById.get(card.consignor_id) || { id: card.consignor_id, name: 'Vendor' }
                : null;
            return {
                occasion: card.theme,
                brand: getGiftCardBrand(vendor),
                vendorName: vendor?.name || null,
                // A reprint shows what is left on the card, not what it was sold for.
                amount: Number(card.current_balance),
                recipientName: card.recipient_name,
                fromName: card.from_name,
                message: card.message,
                code: card.code,
            };
        }), getGiftCardSheetSize(sizeId).id);
        if (!result.success) setPrintError(result.error || 'Unable to print that card.');
    };

    if (state === 'loading') {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
            </div>
        );
    }

    if (state === 'error') {
        return (
            <EmptyState
                icon={<Gift size={28} aria-hidden="true" />}
                title="Couldn't load gift cards"
                description="The list of gift cards sold did not load."
                action={<Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
            />
        );
    }

    if (allSales.length === 0) {
        return (
            <EmptyState
                icon={<Gift size={28} aria-hidden="true" />}
                title="No gift cards sold"
                description="Gift cards sold in the selected dates will appear here."
            />
        );
    }

    if (sales.length === 0) {
        return (
            <div className="text-center py-12 text-[var(--color-muted)]">
                No gift cards match your search
            </div>
        );
    }

    return (
        <div className="@container">
            <p className="mb-3 text-sm text-[var(--color-muted)]">
                {plural(shownCards.length, 'card')} · {formatCurrency(soldTotal)} sold · {formatCurrency(unspentTotal)} not spent yet
            </p>

            {printError && (
                <div role="alert" className="mb-3 rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                    {printError}
                </div>
            )}

            {/* Header row: only when the list is wide enough for columns */}
            <div className="hidden @4xl:flex bg-[var(--color-surface)] rounded-t-xl border border-[var(--color-border)] px-4 py-2 items-center gap-4">
                <div className="w-[16px] flex-shrink-0" />
                <div className="flex flex-1 min-w-0 items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-[90px] text-xs font-medium text-[var(--color-muted)]">Date</div>
                        <div className="w-[150px] text-xs font-medium text-[var(--color-muted)]">Card</div>
                        <div className="w-[130px] text-xs font-medium text-[var(--color-muted)]">For</div>
                        <div className="w-[130px] text-xs font-medium text-[var(--color-muted)]">Good for</div>
                        <div className="w-[70px] text-xs font-medium text-[var(--color-muted)]">Paid with</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="w-[80px] text-right text-xs font-medium text-[var(--color-muted)]">Sold for</div>
                        <div className="w-[80px] text-right text-xs font-medium text-[var(--color-muted)]">Left</div>
                    </div>
                </div>
            </div>

            <div className="space-y-2 mt-2">
                {sales.slice(0, visibleCount).map((sale) => {
                    const isExpanded = expandedKey === sale.key;
                    const first = sale.cards[0];
                    const cardLabel = sale.cardCount === 1 ? first.code : plural(sale.cardCount, 'card');
                    const soldBy = sale.cards
                        .map((card) => history[card.id]?.find((entry) => entry.entry_type === 'issue')?.actor_name)
                        .find(Boolean);
                    const stripeId = first.purchase_payment_intent_id;

                    return (
                        <div key={sale.key} className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setExpandedKey(isExpanded ? null : sale.key)}
                                aria-expanded={isExpanded}
                                className="w-full px-4 py-3 flex items-center hover:bg-[var(--color-surface-hover)] transition-colors text-left gap-3 @4xl:gap-4"
                            >
                                <div className={`w-[16px] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                    <ChevronRight size={16} aria-hidden="true" />
                                </div>

                                {/* Compact layout for narrow lists */}
                                <div className="flex @4xl:hidden min-w-0 flex-1 flex-col gap-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="min-w-0 truncate text-sm font-medium text-[var(--color-foreground)]">
                                            {formatDate(sale.soldAt)} · {formatTime(sale.soldAt)}
                                        </p>
                                        <p className="flex-shrink-0 font-semibold tabular-nums">{formatCurrency(sale.total)}</p>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="min-w-0 truncate text-xs text-[var(--color-muted)]">
                                            <span className={sale.cardCount === 1 ? 'font-mono' : ''}>{cardLabel}</span> · {scopeLabel(sale)} · {paymentLabel(sale.paymentMethod)}
                                        </p>
                                        <p className="flex-shrink-0 text-xs text-[var(--color-muted)] tabular-nums">{formatCurrency(sale.balance)} left</p>
                                    </div>
                                </div>

                                {/* Column layout once the list is wide enough */}
                                <div className="hidden @4xl:flex min-w-0 flex-1 items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-[90px] flex-shrink-0">
                                            <p className="font-medium text-[var(--color-foreground)] text-sm">{formatDate(sale.soldAt)}</p>
                                            <p className="text-xs text-[var(--color-muted)]">{formatTime(sale.soldAt)}</p>
                                        </div>
                                        <div className="w-[150px] flex-shrink-0 truncate">
                                            {sale.cardCount === 1 ? (
                                                <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">{first.code}</span>
                                            ) : (
                                                <span className="text-sm">{cardLabel}</span>
                                            )}
                                        </div>
                                        <div className="w-[130px] flex-shrink-0 truncate text-sm">{recipientLabel(sale)}</div>
                                        <div className="w-[130px] flex-shrink-0 truncate text-sm">{scopeLabel(sale)}</div>
                                        <div className="w-[70px] flex-shrink-0">
                                            <Badge variant={sale.paymentMethod === 'card' ? 'info' : 'default'}>{paymentLabel(sale.paymentMethod)}</Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <div className="w-[80px] text-right font-semibold tabular-nums">{formatCurrency(sale.total)}</div>
                                        <div className="w-[80px] text-right text-sm text-[var(--color-muted)] tabular-nums">{formatCurrency(sale.balance)}</div>
                                    </div>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                                        <p>
                                            {sale.paymentMethod === 'cash' && sale.paid !== sale.total
                                                ? `Paid ${formatCurrency(sale.paid)} in cash (rounded from ${formatCurrency(sale.total)})`
                                                : `Paid ${formatCurrency(sale.paid)} · ${paymentLabel(sale.paymentMethod)}`}
                                            {soldBy ? ` · Sold by ${soldBy}` : ''}
                                            {stripeId ? <> · <span className="font-mono text-xs">{stripeId}</span></> : null}
                                        </p>
                                        {sale.cards.length > 1 && (
                                            <Button variant="secondary" size="sm" onClick={() => void handleReprint(sale.cards)}>
                                                <Printer size={14} aria-hidden="true" /> Reprint all {sale.cards.length}
                                            </Button>
                                        )}
                                    </div>

                                    {sale.cards.length < sale.cardCount && (
                                        <p className="text-xs text-[var(--color-muted)]">
                                            Showing {sale.cards.length} of {plural(sale.cardCount, 'card')} from this sale. Clear the search to see the rest.
                                        </p>
                                    )}

                                    {historyError && (
                                        <p role="alert" className="text-sm text-[var(--color-danger)]">Couldn't load the card history: {historyError}</p>
                                    )}

                                    {sale.cards.map((card) => {
                                        const status = getGiftCardStatus(card);
                                        const entries = history[card.id];
                                        const scope = vendorName(card);
                                        return (
                                            <div key={card.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div className="min-w-0 space-y-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-mono text-sm font-semibold text-[var(--color-foreground)] select-all">{card.code}</span>
                                                            <Badge variant={STATUS_BADGE[status.id]}>{status.label}</Badge>
                                                        </div>
                                                        <p className="text-sm text-[var(--color-foreground)]">
                                                            {card.recipient_name ? `For ${card.recipient_name}` : 'No name on the card'}
                                                            {card.from_name ? ` · From ${card.from_name}` : ''}
                                                        </p>
                                                        {card.recipient_email && (
                                                            <p className="text-xs text-[var(--color-muted)]">Email: {card.recipient_email}</p>
                                                        )}
                                                        {card.message && (
                                                            <p className="text-xs italic text-[var(--color-muted)]">{'“'}{card.message}{'”'}</p>
                                                        )}
                                                        <p className="text-xs text-[var(--color-muted)]">
                                                            {scope ? `Good for ${scope} items only` : 'Good for anything in the store'}
                                                            {' · '}{getGiftCardOccasion(card.theme).label} design
                                                            {card.expires_at ? ` · Expires ${formatDate(card.expires_at)}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-5">
                                                        <div className="text-right">
                                                            <p className="text-xs text-[var(--color-muted)]">Sold for</p>
                                                            <p className="font-semibold tabular-nums">{formatCurrency(Number(card.original_amount))}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-[var(--color-muted)]">Left</p>
                                                            <p className="font-semibold tabular-nums">{formatCurrency(Number(card.current_balance))}</p>
                                                        </div>
                                                        <Button variant="secondary" size="sm" onClick={() => void handleReprint([card])}>
                                                            <Printer size={14} aria-hidden="true" /> Reprint
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                                                    {!entries && !historyError ? (
                                                        <p className="text-xs text-[var(--color-muted)]">Loading history{'…'}</p>
                                                    ) : entries && entries.length > 0 ? (
                                                        <ul className="space-y-1.5">
                                                            {entries.map((entry) => (
                                                                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-xs">
                                                                    <span className="text-[var(--color-foreground)]">
                                                                        <span className="text-[var(--color-muted)]">{formatDate(entry.created_at)} {formatTime(entry.created_at)}</span>
                                                                        {' · '}{describeGiftCardEntry(entry)}
                                                                        {entry.sale_id ? <> · receipt <span className="font-mono">{entry.sale_id.slice(0, 8)}</span></> : null}
                                                                        {entry.actor_name ? ` · ${entry.actor_name}` : ''}
                                                                        {entry.note ? ` · ${entry.note}` : ''}
                                                                    </span>
                                                                    <span className="tabular-nums text-[var(--color-muted)]">
                                                                        <span className={Number(entry.amount) < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-foreground)]'}>
                                                                            {Number(entry.amount) < 0 ? '-' : '+'}{formatCurrency(Math.abs(Number(entry.amount)))}
                                                                        </span>
                                                                        {' · '}{formatCurrency(Number(entry.balance_after))} left
                                                                    </span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : entries ? (
                                                        <p className="text-xs text-[var(--color-muted)]">No history recorded for this card.</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {sales.length > visibleCount && (
                <div className="mt-4 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                        Show {Math.min(PAGE_SIZE, sales.length - visibleCount)} more
                    </Button>
                </div>
            )}
        </div>
    );
}
