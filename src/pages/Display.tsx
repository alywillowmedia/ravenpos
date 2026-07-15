import { useState, useEffect } from 'react';
import { formatCurrency } from '../lib/utils';
import { ShoppingCartIcon, TagIcon, Store, CheckCircle, Receipt, CreditCard, Wallet, Radio } from 'lucide-react';
import type { CartItem, Discount, Sale, PaymentMethod } from '../types';
import ravenposLogo from '../../assets/ravenpos_logo.svg';
import { supabase } from '../lib/supabase';

type CustomerIntakeStatus = 'idle' | 'ready' | 'entering_name' | 'entering_contact' | 'saving' | 'attached' | 'skipped' | 'error';

interface CustomerIntakeDisplayState {
    status: CustomerIntakeStatus;
    source: 'reader' | 'manual';
    message: string;
}

interface CustomerDisplaySummary {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
}

interface BroadcastData {
    cart: CartItem[];
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    total: number;
    cashPrice?: number;
    cardFeeAmount?: number;
    cardPrice?: number;
    amountDue?: number;
    paymentMethod?: PaymentMethod;
    appliedStoreCredit?: number;
    storeCreditLabel?: string;
    appliedGiftCard?: number;
    customer?: CustomerDisplaySummary | null;
    customerIntake?: CustomerIntakeDisplayState | null;
    orderDiscounts: Discount[];
    completedSale: Sale | null;
}

export function Display() {
    const [data, setData] = useState<BroadcastData | null>(null);
    const [now, setNow] = useState(() => new Date());
    const [idleImageUrl, setIdleImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const channel = new BroadcastChannel('ravenpos-cart');

        channel.onmessage = (event) => {
            if (event.data && typeof event.data === 'object') {
                setData(event.data as BroadcastData);
            }
        };

        return () => channel.close();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000 * 30);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadDisplaySettings = async () => {
            const { data: settings, error } = await supabase
                .from('pos_terminal_settings')
                .select('customer_display_image_url')
                .eq('id', true)
                .maybeSingle();

            if (error) {
                console.error('Failed to load POS customer display settings:', error);
                return;
            }

            if (isMounted) {
                setIdleImageUrl(settings?.customer_display_image_url ?? null);
            }
        };

        void loadDisplaySettings();

        return () => {
            isMounted = false;
        };
    }, []);

    if (!data) {
        return (
            <WelcomeState imageUrl={idleImageUrl} />
        );
    }

    const {
        cart,
        subtotal,
        taxTotal,
        total,
        discountTotal,
        orderDiscounts,
        completedSale,
        cashPrice = total,
        cardFeeAmount = 0,
        cardPrice = Math.max(0, cashPrice + cardFeeAmount),
        amountDue = cardPrice,
        paymentMethod = 'card',
        appliedStoreCredit = 0,
        storeCreditLabel = 'Store Credit',
        appliedGiftCard = 0,
        customer = null,
        customerIntake = null,
    } = data;
    const activeCustomerIntake = customerIntake && customerIntake.status !== 'idle' ? customerIntake : null;
    const hasCustomer = Boolean(customer?.name?.trim());
    const shouldShowCustomerInfo = hasCustomer || Boolean(activeCustomerIntake);

    if (completedSale) {
        return (
            <main className="min-h-dvh w-full flex flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-foreground)] p-5 sm:p-8 animate-fadeIn">
                <div className="bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 shadow-sm p-5 rounded-full mb-5" aria-hidden="true">
                    <CheckCircle size={64} className="text-[var(--color-success)]" />
                </div>
                <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-center mb-2">Payment approved</h1>
                <p className="text-lg sm:text-xl text-[var(--color-muted)] text-center mb-7">Thank you for shopping with us.</p>

                <div className="w-full max-w-lg bg-[var(--color-card)] p-6 sm:p-8 rounded-2xl shadow-lg text-[var(--color-foreground)] border border-[var(--color-border)]">
                    <div className="flex justify-between items-baseline mb-4">
                        <span className="eyebrow">Total paid</span>
                        <span className="font-display tabular-nums text-3xl">{formatCurrency(completedSale.total)}</span>
                    </div>

                    {(completedSale.card_fee_amount || 0) > 0 && (
                        <div className="flex justify-between items-center text-sm mb-3">
                            <span className="text-[var(--color-muted)]">Card fee included</span>
                            <span className="tabular-nums">{formatCurrency(Number(completedSale.card_fee_amount || 0))}</span>
                        </div>
                    )}

                    {completedSale.change_given !== null && completedSale.change_given > 0 && (
                        <div className="flex justify-between items-baseline pt-4 border-t border-[var(--color-border)]">
                            <span className="eyebrow !text-[var(--color-success)]">Change due</span>
                            <span className="font-display tabular-nums text-3xl text-[var(--color-success)]">{formatCurrency(completedSale.change_given)}</span>
                        </div>
                    )}

                    <div className="mt-6 text-center text-[var(--color-muted)] flex items-center justify-center gap-2">
                        <Receipt size={16} />
                        <span>Receipt available</span>
                    </div>
                </div>
            </main>
        );
    }

    if (cart.length === 0 && shouldShowCustomerInfo) {
        return <CustomerIntakeState imageUrl={idleImageUrl} intake={activeCustomerIntake} customer={customer} />;
    }

    if (cart.length === 0) {
        return <WelcomeState imageUrl={idleImageUrl} />;
    }

    const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <main className="h-dvh w-full bg-[var(--color-background)] flex flex-col overflow-hidden text-[var(--color-foreground)]">
            <header className="px-4 py-3 md:px-6 md:py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                            <ShoppingCartIcon className="w-5 h-5 text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <h1 className="font-display text-2xl md:text-3xl text-[var(--color-foreground)]">Your order</h1>
                            <p className="text-sm text-[var(--color-muted)]">
                                {cart.length} line item{cart.length !== 1 ? 's' : ''} · {totalUnits} unit{totalUnits !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="hidden sm:flex items-center justify-end gap-1.5 text-xs font-semibold text-[var(--color-success)]">
                            <Radio size={13} aria-hidden="true" /> Order updates live
                        </p>
                        <p className="text-base md:text-lg font-semibold">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] overflow-hidden">
                <section className="min-h-0 p-3 md:p-5" aria-labelledby="display-items-heading">
                    <div className="h-full overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
                        <div className="sticky top-0 z-10 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)] backdrop-blur-sm">
                            <p id="display-items-heading" className="eyebrow">Scanned items</p>
                        </div>
                        <div className="divide-y divide-[var(--color-border)]">
                    {cart.map((item, index) => (
                            <div key={`${item.item.id}-${index}`} className="px-4 py-3 md:py-2.5 flex items-center gap-3">
                                <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
                                    {item.item.image_url ? (
                                        <img
                                            src={item.item.image_url}
                                            alt={item.item.name}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--color-muted)]">
                                            {item.quantity}x
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm md:text-base font-semibold text-[var(--color-foreground)] truncate">
                                        {item.item.name}
                                    </h3>
                                    <div className="flex items-center gap-2 md:gap-3 mt-0.5 text-[11px] md:text-xs text-[var(--color-muted)]">
                                        {item.item.consignor?.name && (
                                            <div className="flex items-center gap-1">
                                                <Store size={12} />
                                                <span className="font-medium truncate max-w-[18ch] md:max-w-[24ch]">{item.item.consignor.name}</span>
                                            </div>
                                        )}
                                        {item.item.variant_summary && (
                                            <div className="flex items-center gap-1 min-w-0">
                                                <TagIcon size={12} />
                                                <span className="font-medium truncate">{item.item.variant_summary}</span>
                                            </div>
                                        )}
                                    </div>
                                    {item.discount && (
                                        <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--color-success-bg)] text-[var(--color-success)] text-[11px] md:text-xs font-medium">
                                            Save {formatCurrency(item.lineTotal - item.discountedLineTotal)}
                                        </div>
                                    )}
                                </div>

                                <div className="text-right pl-2">
                                    {item.discount ? (
                                        <>
                                            <div className="text-lg md:text-xl font-semibold tabular-nums text-[var(--color-success)] leading-tight">
                                                {formatCurrency(item.discountedLineTotal)}
                                            </div>
                                            <div className="text-[11px] md:text-xs text-[var(--color-muted)] line-through tabular-nums leading-tight">
                                                {formatCurrency(item.lineTotal)}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-lg md:text-xl font-semibold tabular-nums text-[var(--color-foreground)] leading-tight">
                                            {formatCurrency(item.lineTotal)}
                                        </div>
                                    )}
                                    <div className="text-[11px] md:text-xs text-[var(--color-muted)] tabular-nums mt-0.5">
                                        {item.quantity} @ {formatCurrency(Number(item.item.price))}
                                    </div>
                                </div>
                            </div>
                    ))}
                        </div>
                    </div>
                </section>

                <aside className="min-h-0 bg-[var(--color-surface-elevated)] border-t lg:border-t-0 lg:border-l border-[var(--color-border)] flex flex-col shadow-xl" aria-labelledby="display-summary-heading">
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5">
                        {shouldShowCustomerInfo && (
                            <CustomerIntakeBanner intake={activeCustomerIntake} customer={customer} />
                        )}
                        <h2 id="display-summary-heading" className="font-display text-2xl md:text-3xl text-[var(--color-foreground)]">Order summary</h2>

                        <div className="space-y-2.5 text-base md:text-lg">
                            <Row label="Subtotal" value={formatCurrency(subtotal)} />
                            {discountTotal > 0 && (
                                <Row label="Discounts" value={`-${formatCurrency(discountTotal)}`} valueClassName="text-[var(--color-success)]" />
                            )}
                            <Row label="Tax" value={formatCurrency(taxTotal)} />
                            {appliedStoreCredit > 0 && (
                                <Row label={storeCreditLabel} value={`-${formatCurrency(appliedStoreCredit)}`} valueClassName="text-[var(--color-success)]" />
                            )}
                            {appliedGiftCard > 0 && (
                                <Row label="Gift Card" value={`-${formatCurrency(appliedGiftCard)}`} valueClassName="text-[var(--color-success)]" />
                            )}
                            {cardFeeAmount > 0 && (
                                <Row label="Card Processing Fee" value={formatCurrency(cardFeeAmount)} valueClassName="text-[var(--color-warning)]" />
                            )}
                        </div>

                        {orderDiscounts.length > 0 && (
                            <div className="pt-3 border-t border-[var(--color-border)] space-y-1.5">
                                <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-[0.12em]">Applied Discounts</p>
                                {orderDiscounts.map((d, i) => (
                                    <div key={i} className="flex justify-between text-xs md:text-sm text-[var(--color-success)]">
                                        <span>{d.reason || 'Order Discount'}</span>
                                        <span>-{formatCurrency(d.calculatedAmount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {cardFeeAmount > 0 && (
                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-[var(--color-muted)] flex items-center gap-2"><CreditCard size={14} /> {paymentMethod === 'split' ? 'Split Total' : 'Card Total'}</span>
                                    <span className="font-semibold">{formatCurrency(cardPrice)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-[var(--color-muted)] flex items-center gap-2"><Wallet size={14} /> Cash Price</span>
                                    <span className="font-semibold">{formatCurrency(cashPrice)}</span>
                                </div>
                                <p className="text-xs text-[var(--color-muted)] text-right">
                                    Difference: {formatCurrency(Math.max(0, cardPrice - cashPrice))}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="px-5 py-5 md:px-7 md:py-7 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] mt-auto" aria-live="polite">
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] opacity-70 mb-1.5">
                            {paymentMethod === 'card' ? 'Card Total' : paymentMethod === 'split' ? 'Split Total' : 'Total Due'}
                        </p>
                        <p className="font-display tabular-nums text-4xl sm:text-5xl xl:text-6xl leading-none break-words">{formatCurrency(amountDue)}</p>
                    </div>
                </aside>
            </div>
        </main>
    );
}

function CustomerIntakeBanner({ intake, customer }: { intake?: CustomerIntakeDisplayState | null; customer?: CustomerDisplaySummary | null }) {
    const customerName = customer?.name?.trim() || '';
    const hasAttachedCustomer = Boolean(customerName) && (!intake || intake.status === 'attached');
    const isDone = hasAttachedCustomer || intake?.status === 'attached';
    const isError = intake?.status === 'error';
    const contactInfo = customer?.phone || customer?.email || null;

    return (
        <div className={`rounded-xl border p-4 ${
            isError
                ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10'
                : isDone
                    ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10'
                    : 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10'
        }`}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Customer Profile
            </p>
            <p className="mt-1 text-base font-semibold text-[var(--color-foreground)]">
                {hasAttachedCustomer ? customerName : intake?.message || 'Customer profile attached'}
            </p>
            {hasAttachedCustomer && contactInfo && (
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {contactInfo}
                </p>
            )}
            {!isDone && !isError && (
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                    Follow the prompts on the card reader.
                </p>
            )}
        </div>
    );
}

function CustomerIntakeState({ imageUrl, intake, customer }: { imageUrl: string | null; intake?: CustomerIntakeDisplayState | null; customer?: CustomerDisplaySummary | null }) {
    const imageSrc = imageUrl || ravenposLogo;

    return (
        <main className="min-h-dvh w-full flex flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-foreground)] p-6 sm:p-8">
            <DisplayBrandImage src={imageSrc} />
            <div className="w-full max-w-xl">
                <CustomerIntakeBanner intake={intake} customer={customer} />
            </div>
        </main>
    );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[var(--color-muted)]">{label}</span>
            <span className={`font-medium tabular-nums text-[var(--color-foreground)] ${valueClassName || ''}`}>{value}</span>
        </div>
    );
}

function WelcomeState({ imageUrl }: { imageUrl: string | null }) {
    const imageSrc = imageUrl || ravenposLogo;

    return (
        <main className="min-h-dvh w-full flex flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-foreground)] p-6 sm:p-8">
            <DisplayBrandImage src={imageSrc} />
            <p className="font-display text-3xl text-[var(--color-foreground)] text-center">Welcome</p>
            <p className="mt-2 text-lg text-[var(--color-muted)] text-center">We're ready when you are.</p>
            <p className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]" role="status">
                <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
                Waiting for the register
            </p>
        </main>
    );
}

function DisplayBrandImage({ src }: { src: string }) {
    return (
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 sm:p-8 shadow-sm mb-8">
            <img src={src} alt="RavenPOS" className="w-full max-h-44 object-contain" />
        </div>
    );
}
