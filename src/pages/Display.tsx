import { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { formatCurrency } from '../lib/utils';
import { ShoppingCartIcon, TagIcon, Store, CheckCircle, Receipt, CreditCard, Wallet } from 'lucide-react';
import type { CartItem, Discount, Sale, PaymentMethod } from '../types';
import ravenposLogo from '../../assets/ravenpos_logo.svg';

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
    appliedGiftCard?: number;
    orderDiscounts: Discount[];
    completedSale: Sale | null;
}

export function Display() {
    const [data, setData] = useState<BroadcastData | null>(null);
    const [now, setNow] = useState(() => new Date());

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

    if (!data) {
        return (
            <WelcomeState />
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
        amountDue = total,
        paymentMethod = 'cash',
        appliedStoreCredit = 0,
        appliedGiftCard = 0,
    } = data;

    if (completedSale) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 via-emerald-50 to-white text-emerald-900 p-8 animate-fadeIn">
                <div className="bg-white shadow-xl p-6 rounded-full mb-6">
                    <CheckCircle size={78} className="text-emerald-600" />
                </div>
                <h1 className="text-5xl font-bold mb-3">Payment Approved</h1>
                <p className="text-2xl opacity-80 mb-8">Thank you for shopping with us</p>

                <div className="bg-white p-8 rounded-2xl shadow-lg min-w-[440px] text-[var(--color-foreground)]">
                    <div className="flex justify-between items-center text-xl mb-4">
                        <span className="text-[var(--color-muted)]">Total Paid</span>
                        <span className="font-bold">{formatCurrency(completedSale.total)}</span>
                    </div>

                    {(completedSale.card_fee_amount || 0) > 0 && (
                        <div className="flex justify-between items-center text-sm mb-3">
                            <span className="text-[var(--color-muted)]">Card Fee Included</span>
                            <span>{formatCurrency(Number(completedSale.card_fee_amount || 0))}</span>
                        </div>
                    )}

                    {completedSale.change_given !== null && completedSale.change_given > 0 && (
                        <div className="flex justify-between items-center text-2xl pt-4 border-t border-[var(--color-border)]">
                            <span className="text-emerald-700 font-bold">Change Due</span>
                            <span className="font-bold text-emerald-700">{formatCurrency(completedSale.change_given)}</span>
                        </div>
                    )}

                    <div className="mt-6 text-center text-[var(--color-muted)] flex items-center justify-center gap-2">
                        <Receipt size={16} />
                        <span>Receipt available</span>
                    </div>
                </div>
            </div>
        );
    }

    if (cart.length === 0) {
        return <WelcomeState />;
    }

    return (
        <div className="h-screen w-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex flex-col overflow-hidden">
            <div className="px-8 py-6 border-b border-[var(--color-border)] bg-white/85 backdrop-blur-md shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                            <ShoppingCartIcon className="w-6 h-6 text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Your Order</h1>
                            <p className="text-sm text-[var(--color-muted)]">
                                {cart.length} item{cart.length !== 1 ? 's' : ''} in cart
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Current Time</p>
                        <p className="text-lg font-semibold">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {cart.map((item, index) => (
                        <Card key={`${item.item.id}-${index}`} variant="outlined" className="overflow-hidden bg-white/90 backdrop-blur-sm">
                            <CardContent className="p-4 flex items-center gap-6">
                                <div className="flex-shrink-0 w-16 h-16 bg-[var(--color-surface)] rounded-xl flex items-center justify-center border border-[var(--color-border)]">
                                    <span className="text-2xl font-bold text-[var(--color-foreground)]">{item.quantity}</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="text-xl font-semibold text-[var(--color-foreground)] truncate">
                                        {item.item.name}
                                    </h3>
                                    <div className="flex items-center gap-4 mt-1">
                                        {item.item.consignor?.name && (
                                            <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
                                                <Store size={14} />
                                                <span className="text-sm font-medium">{item.item.consignor.name}</span>
                                            </div>
                                        )}
                                        {item.item.variant_summary && (
                                            <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
                                                <TagIcon size={14} />
                                                <span className="text-sm font-medium">{item.item.variant_summary}</span>
                                            </div>
                                        )}
                                    </div>
                                    {item.discount && (
                                        <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm font-medium">
                                            Save {formatCurrency(item.lineTotal - item.discountedLineTotal)}
                                        </div>
                                    )}
                                </div>

                                <div className="text-right">
                                    {item.discount ? (
                                        <>
                                            <div className="text-2xl font-bold text-[var(--color-success)]">
                                                {formatCurrency(item.discountedLineTotal)}
                                            </div>
                                            <div className="text-sm text-[var(--color-muted)] line-through">
                                                {formatCurrency(item.lineTotal)}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-2xl font-bold text-[var(--color-foreground)]">
                                            {formatCurrency(item.lineTotal)}
                                        </div>
                                    )}
                                    <div className="text-sm text-[var(--color-muted)] mt-1">
                                        {item.quantity} @ {formatCurrency(Number(item.item.price))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="w-[430px] bg-white/90 backdrop-blur-md border-l border-[var(--color-border)] flex flex-col shadow-xl">
                    <div className="flex-1 p-8 space-y-6">
                        <h2 className="text-2xl font-bold text-[var(--color-foreground)]">Order Summary</h2>

                        <div className="space-y-3 text-lg">
                            <Row label="Subtotal" value={formatCurrency(subtotal)} />
                            {discountTotal > 0 && (
                                <Row label="Discounts" value={`-${formatCurrency(discountTotal)}`} valueClassName="text-[var(--color-success)]" />
                            )}
                            <Row label="Tax" value={formatCurrency(taxTotal)} />
                            {appliedStoreCredit > 0 && (
                                <Row label="Store Credit" value={`-${formatCurrency(appliedStoreCredit)}`} valueClassName="text-[var(--color-success)]" />
                            )}
                            {appliedGiftCard > 0 && (
                                <Row label="Gift Card" value={`-${formatCurrency(appliedGiftCard)}`} valueClassName="text-[var(--color-success)]" />
                            )}
                            {cardFeeAmount > 0 && (
                                <Row label="Card Processing Fee" value={formatCurrency(cardFeeAmount)} valueClassName="text-[var(--color-warning)]" />
                            )}
                        </div>

                        {orderDiscounts.length > 0 && (
                            <div className="pt-4 border-t border-[var(--color-border)] space-y-2">
                                <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-[0.12em]">Applied Discounts</p>
                                {orderDiscounts.map((d, i) => (
                                    <div key={i} className="flex justify-between text-sm text-[var(--color-success)]">
                                        <span>{d.reason || 'Order Discount'}</span>
                                        <span>-{formatCurrency(d.calculatedAmount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {cardFeeAmount > 0 && (
                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-[var(--color-muted)] flex items-center gap-2"><CreditCard size={14} /> Card Total</span>
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

                    <div className="p-8 bg-gradient-to-r from-[var(--color-primary)] to-sky-600 text-white mt-auto">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-lg font-medium opacity-90">
                                {paymentMethod === 'card' ? 'Card Total' : 'Total Due'}
                            </span>
                            <span className="text-5xl font-bold">{formatCurrency(amountDue)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[var(--color-muted-foreground)]">{label}</span>
            <span className={`font-medium text-[var(--color-foreground)] ${valueClassName || ''}`}>{value}</span>
        </div>
    );
}

function WelcomeState() {
    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-100 text-[var(--color-foreground)] p-8">
            <img src={ravenposLogo} alt="RavenPOS" className="w-72 max-w-[80vw] h-auto mb-8" />
            <p className="text-2xl text-[var(--color-muted)] text-center">Welcome! The register is ready for your order.</p>
        </div>
    );
}
