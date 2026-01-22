import { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { formatCurrency } from '../lib/utils';
import { ShoppingCartIcon, TagIcon, Store, CheckCircle, Receipt } from 'lucide-react';
import type { CartItem, Discount, Sale } from '../types';

interface BroadcastData {
    cart: CartItem[];
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    total: number;
    orderDiscounts: Discount[];
    completedSale: Sale | null;
}

export function Display() {
    const [data, setData] = useState<BroadcastData | null>(null);

    useEffect(() => {
        const channel = new BroadcastChannel('ravenpos-cart');

        channel.onmessage = (event) => {
            if (event.data && typeof event.data === 'object') {
                setData(event.data as BroadcastData);
            }
        };

        return () => {
            channel.close();
        };
    }, []);

    if (!data) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-foreground)] p-8">
                <Store size={64} className="text-[var(--color-primary)] mb-4" />
                <h1 className="text-4xl font-bold mb-2">Welcome to RavenPOS</h1>
                <p className="text-xl text-[var(--color-muted)]">Register is ready for next customer</p>
            </div>
        );
    }

    const { cart, subtotal, taxTotal, total, discountTotal, orderDiscounts, completedSale } = data;

    // Show completed sale screen
    if (completedSale) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--color-success-bg)] text-[var(--color-success)] p-8 animate-fadeIn">
                <div className="bg-white/50 p-6 rounded-full mb-6">
                    <CheckCircle size={80} className="text-[var(--color-success)]" />
                </div>
                <h1 className="text-5xl font-bold mb-4">Sale Completed!</h1>
                <p className="text-2xl opacity-90 mb-8">Thank you for your business</p>

                <div className="bg-white p-8 rounded-2xl shadow-lg min-w-[400px] text-[var(--color-foreground)]">
                    <div className="flex justify-between items-center text-xl mb-4">
                        <span className="text-[var(--color-muted)]">Total Paid</span>
                        <span className="font-bold">{formatCurrency(completedSale.total)}</span>
                    </div>

                    {completedSale.change_given !== null && completedSale.change_given > 0 && (
                        <div className="flex justify-between items-center text-2xl mb-2 pt-4 border-t border-[var(--color-border)]">
                            <span className="text-[var(--color-success)] font-bold">Change Due</span>
                            <span className="font-bold text-[var(--color-success)]">{formatCurrency(completedSale.change_given)}</span>
                        </div>
                    )}

                    <div className="mt-6 text-center text-[var(--color-muted)] flex items-center justify-center gap-2">
                        <Receipt size={16} />
                        <span>Receipt sent</span>
                    </div>
                </div>
            </div>
        );
    }

    if (cart.length === 0) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-foreground)] p-8">
                <Store size={64} className="text-[var(--color-primary)] mb-4" />
                <h1 className="text-4xl font-bold mb-2">Welcome to RavenPOS</h1>
                <p className="text-xl text-[var(--color-muted)]">Register is ready for next customer</p>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-[var(--color-background)] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] p-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <ShoppingCartIcon className="w-8 h-8 text-[var(--color-primary)]" />
                    <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Current Order</h1>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Cart Items List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {cart.map((item, index) => (
                        <Card key={`${item.item.id}-${index}`} variant="outlined" className="overflow-hidden">
                            <CardContent className="p-4 flex items-center gap-6">
                                {/* Quantity */}
                                <div className="flex-shrink-0 w-16 h-16 bg-[var(--color-surface)] rounded-xl flex items-center justify-center border border-[var(--color-border)]">
                                    <span className="text-2xl font-bold text-[var(--color-foreground)]">{item.quantity}</span>
                                </div>

                                {/* Item Details */}
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
                                        {item.item.variant && (
                                            <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
                                                <TagIcon size={14} />
                                                <span className="text-sm font-medium">{item.item.variant}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Item Discounts */}
                                    {item.discount && (
                                        <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm font-medium">
                                            Save {formatCurrency(item.lineTotal - item.discountedLineTotal)}
                                        </div>
                                    )}
                                </div>

                                {/* Price */}
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

                {/* Right Side: Totals */}
                <div className="w-[400px] bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col shadow-xl">
                    <div className="flex-1 p-8 space-y-6">
                        <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-6">Order Summary</h2>

                        <div className="space-y-4 text-lg">
                            <div className="flex justify-between items-center text-[var(--color-muted-foreground)]">
                                <span>Subtotal</span>
                                <span className="font-medium text-[var(--color-foreground)]">{formatCurrency(subtotal)}</span>
                            </div>

                            {discountTotal > 0 && (
                                <div className="flex justify-between items-center text-[var(--color-success)]">
                                    <span>You Save</span>
                                    <span className="font-bold">-{formatCurrency(discountTotal)}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-[var(--color-muted-foreground)]">
                                <span>Tax</span>
                                <span className="font-medium text-[var(--color-foreground)]">{formatCurrency(taxTotal)}</span>
                            </div>
                        </div>

                        {/* Order Discounts List */}
                        {orderDiscounts.length > 0 && (
                            <div className="pt-4 border-t border-[var(--color-border)] space-y-2">
                                <p className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wider">Applied Discounts</p>
                                {orderDiscounts.map((d, i) => (
                                    <div key={i} className="flex justify-between text-sm text-[var(--color-success)]">
                                        <span>{d.reason || 'Order Discount'}</span>
                                        <span>-{formatCurrency(d.calculatedAmount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grand Total */}
                    <div className="p-8 bg-[var(--color-primary)] text-white mt-auto">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-lg font-medium opacity-90">Total Due</span>
                            <span className="text-5xl font-bold">{formatCurrency(total)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
