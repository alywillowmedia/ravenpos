import { CheckCircle, Gift } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import type { GiftCardDisplayMessage } from '../../lib/giftCardDisplay';
import { GiftCardFace } from './GiftCardFace';

type ActiveGiftCardDisplay = Extract<GiftCardDisplayMessage, { active: true }>;

/** Customer-facing view of a gift card sale: the cards as they will print, and the total. */
export function GiftCardDisplay({ sale }: { sale: ActiveGiftCardDisplay }) {
    const { cards, total, stage, paymentMethod, changeDue } = sale;
    const isDone = stage === 'done';
    const status = isDone
        ? 'Thank you! Your gift cards are being printed.'
        : stage === 'paying'
            ? paymentMethod === 'card' ? 'Follow the prompts on the card reader.' : 'Paying with cash.'
            : 'Check the names and amounts as we fill them in.';
    // Fewer cards get bigger; a long list shrinks to stay on one screen.
    const minCardWidth = cards.length <= 2 ? 380 : cards.length <= 6 ? 300 : 230;

    return (
        <main className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
            <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3 shadow-sm md:px-6 md:py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10">
                        {isDone
                            ? <CheckCircle className="h-5 w-5 text-[var(--color-success)]" aria-hidden="true" />
                            : <Gift className="h-5 w-5 text-[var(--color-primary)]" aria-hidden="true" />}
                    </div>
                    <div>
                        <h1 className="font-display text-2xl md:text-3xl">{isDone ? 'All set' : 'Your gift cards'}</h1>
                        <p className="text-sm text-[var(--color-muted)]" role="status">{status}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-[var(--color-muted)]">{cards.length} card{cards.length === 1 ? '' : 's'} · {isDone ? 'Paid' : 'Total'}</p>
                    <p className="font-display text-3xl tabular-nums md:text-4xl">{formatCurrency(total)}</p>
                    {isDone && changeDue > 0 && (
                        <p className="text-base font-semibold text-[var(--color-success)]">Change: {formatCurrency(changeDue)}</p>
                    )}
                </div>
            </header>

            <section className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6" aria-label="Gift cards">
                <div
                    className="mx-auto grid max-w-6xl justify-center gap-4 md:gap-5"
                    style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minCardWidth}px), ${cards.length === 1 ? '560px' : '1fr'}))` }}
                >
                    {cards.map((card, index) => (
                        <div key={index} className="overflow-hidden rounded-md shadow-md">
                            <GiftCardFace card={card} />
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}
