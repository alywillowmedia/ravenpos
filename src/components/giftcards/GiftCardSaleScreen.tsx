import { roundCashAmount } from '../../lib/cashRounding';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, Check, CreditCard, Gift, Mail, Minus, Plus, Printer, Store, Trash2, TriangleAlert } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { sendGiftCardEmail } from '../../lib/emailGiftCard';
import {
    DEFAULT_GIFT_CARD_SHEET_SIZE,
    GIFT_CARD_SHEET_SIZE_STORAGE_KEY,
    GIFT_CARD_AMOUNT_PRESETS,
    GIFT_CARD_MAX_PER_SALE,
    GIFT_CARD_NAME_MAX_LENGTH,
    GIFT_CARD_NOTE_MAX_LENGTH,
    buildGiftCardBatchPayload,
    GIFT_CARD_SHEET_SIZES,
    createGiftCardDraft,
    formatGiftCardSheetSize,
    getCashSuggestions,
    getGiftCardBatchTotal,
    getGiftCardSheetSize,
    resizeGiftCardDrafts,
    roundGiftCardMoney,
    validateGiftCardDrafts,
    type GiftCardDraft,
    type GiftCardSheetSizeId,
} from '../../lib/giftCardBatch';
import {
    DEFAULT_GIFT_CARD_OCCASION,
    getGiftCardBrand,
    getOrderedGiftCardOccasions,
    isHolidaySeason,
    type GiftCardOccasion,
    type GiftCardVendorLike,
} from '../../lib/giftCardThemes';
import { GIFT_CARD_DISPLAY_CHANNEL, type GiftCardDisplayMessage } from '../../lib/giftCardDisplay';
import { GiftCardFace, type GiftCardFaceData } from './GiftCardFace';
import { GiftCardSheets } from './GiftCardSheet';
import { printGiftCards } from './printGiftCards';

interface GiftCardSaleScreenProps {
    isOpen: boolean;
    onClose: () => void;
    connectedReader: boolean;
    onOpenReaderModal: () => void;
    collectCardPayment: (amountInCents: number, options?: { captureLater?: boolean }) => Promise<{
        paymentIntentId: string;
        cardLast4?: string;
        error: string | null;
    }>;
    capturePayment: (paymentIntentId: string) => Promise<{ error: string | null }>;
    releaseCardPayment: (paymentIntentId: string, amountInCents: number) => Promise<{ error: string | null }>;
    purchaserCustomerId?: string | null;
}

type Step = 'cards' | 'pay' | 'done';
type EmailStatus = 'sent' | 'failed';

interface IssuedCard extends GiftCardFaceData {
    code: string;
    recipientEmail: string | null;
    emailStatus?: EmailStatus;
}

const STEPS: Array<{ id: Step; label: string }> = [
    { id: 'cards', label: 'Cards' },
    { id: 'pay', label: 'Payment' },
    { id: 'done', label: 'Print' },
];

/** The print size last used on this register. */
const SHEET_SIZE_STORAGE_KEY = GIFT_CARD_SHEET_SIZE_STORAGE_KEY;

const fieldClass = 'h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20';
const errorFieldClass = 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20';
const sectionLabelClass = 'text-sm font-semibold text-[var(--color-foreground)]';

function choiceClass(selected: boolean): string {
    return `rounded-xl border px-4 py-3 text-left transition-colors ${selected
        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-1 ring-[var(--color-primary)]'
        : 'border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-surface-hover)]'}`;
}

export function GiftCardSaleScreen({
    isOpen,
    onClose,
    connectedReader,
    onOpenReaderModal,
    collectCardPayment,
    capturePayment,
    releaseCardPayment,
    purchaserCustomerId,
}: GiftCardSaleScreenProps) {
    const [step, setStep] = useState<Step>('cards');
    const [vendors, setVendors] = useState<GiftCardVendorLike[]>([]);
    const [vendorId, setVendorId] = useState<string | null>(null);
    const [occasion, setOccasion] = useState<GiftCardOccasion>(DEFAULT_GIFT_CARD_OCCASION);
    const [amountEach, setAmountEach] = useState(25);
    const [drafts, setDrafts] = useState<GiftCardDraft[]>(() => [createGiftCardDraft(25)]);
    const [fromName, setFromName] = useState('');
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const [showErrors, setShowErrors] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card');
    const [cashTendered, setCashTendered] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [issued, setIssued] = useState<IssuedCard[]>([]);
    const [changeGiven, setChangeGiven] = useState(0);
    const [reprintCode, setReprintCode] = useState('');
    const [reprintMessage, setReprintMessage] = useState<string | null>(null);
    const [isReprinting, setIsReprinting] = useState(false);
    const [sheetSize, setSheetSize] = useState<GiftCardSheetSizeId>(() => {
        try {
            return getGiftCardSheetSize(localStorage.getItem(SHEET_SIZE_STORAGE_KEY)).id;
        } catch {
            return DEFAULT_GIFT_CARD_SHEET_SIZE;
        }
    });
    const chooseSheetSize = (id: GiftCardSheetSizeId) => {
        setSheetSize(id);
        try {
            localStorage.setItem(SHEET_SIZE_STORAGE_KEY, id);
        } catch {
            // The choice just won't be remembered.
        }
    };
    const displayChannelRef = useRef<BroadcastChannel | null>(null);

    // Start fresh every time the screen opens.
    useEffect(() => {
        if (!isOpen) return;
        const startingOccasion = isHolidaySeason() ? 'christmas' : DEFAULT_GIFT_CARD_OCCASION;
        setStep('cards');
        setVendorId(null);
        setOccasion(startingOccasion);
        setAmountEach(25);
        setDrafts([createGiftCardDraft(25)]);
        setFromName('');
        setEmailEnabled(false);
        setFocusedKey(null);
        setShowErrors(false);
        setPaymentMethod(connectedReader ? 'card' : 'cash');
        setCashTendered('');
        setIsSubmitting(false);
        setError(null);
        setWarning(null);
        setIssued([]);
        setChangeGiven(0);
        setReprintCode('');
        setReprintMessage(null);
        // connectedReader only picks the starting tender; it should not reset a sale in progress.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const loadVendors = async () => {
            const { data, error: loadError } = await supabase
                .from('consignors')
                .select('id, name, business_name, consignor_number')
                .eq('is_active', true)
                .order('name');
            if (cancelled || loadError || !data) return;
            const mapped = data.map((row) => ({
                id: String(row.id),
                name: String(row.business_name || row.name || '').trim() || 'Unnamed vendor',
                shortcode: row.consignor_number ? String(row.consignor_number) : null,
            }));
            // Alywillow is by far the most common vendor card, so it leads the list.
            mapped.sort((a, b) => Number(getGiftCardBrand(b) === 'alywillow') - Number(getGiftCardBrand(a) === 'alywillow'));
            setVendors(mapped);
        };
        void loadVendors();
        return () => { cancelled = true; };
    }, [isOpen]);

    const vendor = useMemo(() => vendors.find((option) => option.id === vendorId) || null, [vendors, vendorId]);
    const brand = getGiftCardBrand(vendor);
    const occasions = useMemo(() => getOrderedGiftCardOccasions(), []);
    const total = useMemo(() => getGiftCardBatchTotal(drafts), [drafts]);
    const validation = useMemo(() => validateGiftCardDrafts(drafts, { emailEnabled }), [drafts, emailEnabled]);
    const cashAmount = Number.parseFloat(cashTendered) || 0;
    // Cash is paid in nickels; the cards themselves keep their exact amounts.
    const cashDue = roundCashAmount(total);
    const changeDue = Math.max(0, roundCashAmount(cashAmount - cashDue));

    const toFace = useCallback((draft: GiftCardDraft): GiftCardFaceData => ({
        occasion: draft.occasion || occasion,
        brand,
        vendorName: vendor?.name || null,
        amount: roundGiftCardMoney(draft.amount),
        recipientName: draft.recipientName,
        fromName,
        message: draft.message,
    }), [brand, fromName, occasion, vendor]);

    const previewDraft = drafts.find((draft) => draft.key === focusedKey) || drafts[0];
    const previewIndex = drafts.indexOf(previewDraft);

    // Mirror the sale on the customer display.
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel(GIFT_CARD_DISPLAY_CHANNEL);
        displayChannelRef.current = channel;
        return () => {
            channel.postMessage({ active: false } satisfies GiftCardDisplayMessage);
            channel.close();
            displayChannelRef.current = null;
        };
    }, []);

    useEffect(() => {
        const channel = displayChannelRef.current;
        if (!channel) return;
        if (!isOpen) {
            channel.postMessage({ active: false } satisfies GiftCardDisplayMessage);
            return;
        }
        const message: GiftCardDisplayMessage = step === 'done'
            ? { active: true, stage: 'done', cards: issued.map((card) => ({ ...card, code: null })), total: issued.reduce((sum, card) => sum + card.amount, 0), paymentMethod, changeDue: changeGiven }
            : { active: true, stage: step === 'pay' ? 'paying' : 'building', cards: drafts.map(toFace), total, paymentMethod, changeDue: 0 };
        channel.postMessage(message);
    }, [isOpen, step, drafts, issued, total, paymentMethod, changeGiven, toFace]);

    const updateDraft = (key: string, patch: Partial<GiftCardDraft>) => {
        setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
    };

    const setCount = (count: number) => {
        setDrafts((current) => resizeGiftCardDrafts(current, count, amountEach));
    };

    const applyAmountToAll = (amount: number) => {
        setAmountEach(amount);
        setDrafts((current) => current.map((draft) => ({ ...draft, amount })));
    };

    const removeDraft = (key: string) => {
        setDrafts((current) => (current.length > 1 ? current.filter((draft) => draft.key !== key) : current));
    };

    const goToPayment = () => {
        setError(null);
        if (!validation.valid) {
            setShowErrors(true);
            setError(validation.firstError);
            return;
        }
        setStep('pay');
    };

    const handleTakePayment = async () => {
        setError(null);
        if (!validation.valid) {
            setStep('cards');
            setShowErrors(true);
            setError(validation.firstError);
            return;
        }
        if (paymentMethod === 'cash' && cashAmount + 0.001 < cashDue) {
            setError(`Cash received is less than ${formatCurrency(cashDue)}.`);
            return;
        }
        if (paymentMethod === 'card' && !connectedReader) {
            setError('Connect a card reader first.');
            return;
        }

        setIsSubmitting(true);
        const amountInCents = Math.round(total * 100);
        let paymentIntentId: string | null = null;

        if (paymentMethod === 'card') {
            // Authorize only; the card is captured once the gift cards exist.
            const cardResult = await collectCardPayment(amountInCents, { captureLater: true });
            if (cardResult.error) {
                setError(cardResult.error);
                setIsSubmitting(false);
                return;
            }
            paymentIntentId = cardResult.paymentIntentId || null;
        }

        const { data, error: issueError } = await supabase.rpc('create_gift_card_batch', {
            p_cards: buildGiftCardBatchPayload(drafts, { emailEnabled, occasion }),
            p_consignor_id: vendor?.id || null,
            p_theme: occasion,
            p_from_name: fromName.trim() || null,
            p_purchaser_customer_id: purchaserCustomerId || null,
            p_purchase_payment_method: paymentMethod,
            p_purchase_payment_intent_id: paymentIntentId,
        });

        const created = Array.isArray(data) ? data : [];
        if (issueError || created.length !== drafts.length) {
            let failure = issueError?.message || 'The gift cards could not be created.';
            if (paymentIntentId) {
                const { error: releaseError } = await releaseCardPayment(paymentIntentId, amountInCents);
                failure = releaseError
                    ? `${failure} The card hold could not be released (${releaseError}); refund ${paymentIntentId} in Stripe.`
                    : `${failure} The card was not charged.`;
            }
            setError(failure);
            setIsSubmitting(false);
            return;
        }

        let nextWarning: string | null = null;
        if (paymentIntentId) {
            const { error: captureError } = await capturePayment(paymentIntentId);
            if (captureError) {
                nextWarning = `The cards were created, but the card payment could not be finalized (${captureError}). Capture ${paymentIntentId} in Stripe before the hold expires.`;
            }
        }

        const cards: IssuedCard[] = created.map((row) => ({
            occasion: row.theme || occasion,
            brand,
            vendorName: vendor?.name || null,
            amount: Number(row.original_amount),
            recipientName: row.recipient_name,
            fromName: row.from_name,
            message: row.message,
            code: String(row.code),
            recipientEmail: row.recipient_email || null,
        }));

        if (emailEnabled) {
            for (const card of cards) {
                if (!card.recipientEmail) continue;
                const result = await sendGiftCardEmail({
                    code: card.code,
                    amount: card.amount,
                    toName: card.recipientName || null,
                    toEmail: card.recipientEmail,
                    fromName: card.fromName || null,
                    message: card.message || null,
                    occasion: String(card.occasion || occasion),
                    brand,
                    vendorName: card.vendorName,
                });
                card.emailStatus = result.success ? 'sent' : 'failed';
            }
        }

        setIssued(cards);
        setChangeGiven(paymentMethod === 'cash' ? changeDue : 0);
        setWarning(nextWarning);
        setIsSubmitting(false);
        setStep('done');
    };

    const handlePrint = async () => {
        const result = await printGiftCards(issued, sheetSize);
        if (!result.success) setError(result.error || 'Unable to print the gift cards.');
    };

    const handleReprint = async () => {
        const code = reprintCode.trim().toUpperCase();
        if (!code) return;
        setReprintMessage(null);
        setIsReprinting(true);
        const { data, error: lookupError } = await supabase.rpc('get_gift_card_by_code', { p_code: code });
        setIsReprinting(false);
        const card = Array.isArray(data) ? data[0] : null;
        if (lookupError || !card) {
            setReprintMessage(lookupError?.message || 'No gift card has that code.');
            return;
        }
        const cardVendor: GiftCardVendorLike | null = card.consignor_id
            ? vendors.find((option) => option.id === card.consignor_id) || { id: String(card.consignor_id), name: String(card.consignor_name || 'Vendor') }
            : null;
        const result = await printGiftCards([{
            occasion: card.theme,
            brand: getGiftCardBrand(cardVendor),
            vendorName: cardVendor?.name || null,
            // A reprint shows what is left on the card, not what it was sold for.
            amount: Number(card.current_balance),
            recipientName: card.recipient_name,
            fromName: card.from_name,
            message: card.message,
            code: String(card.code),
        }], sheetSize);
        setReprintMessage(result.success ? null : result.error || 'Unable to print that card.');
        if (result.success) setReprintCode('');
    };

    const cashSuggestions = getCashSuggestions(cashDue);
    const emailedCount = issued.filter((card) => card.emailStatus === 'sent').length;
    const failedEmails = issued.filter((card) => card.emailStatus === 'failed');
    const stepIndex = STEPS.findIndex((entry) => entry.id === step);
    const rowColumns = emailEnabled
        ? 'lg:grid-cols-[1.75rem_minmax(0,1.1fr)_6rem_minmax(0,1.4fr)_minmax(0,1.3fr)_10rem_2.25rem]'
        : 'lg:grid-cols-[1.75rem_minmax(0,1.1fr)_6rem_minmax(0,1.7fr)_10rem_2.25rem]';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="full"
            className="max-w-[1240px]! max-h-[94vh]! h-[94vh]"
            closeOnOverlayClick={false}
            closeOnEscape={false}
        >
            {/* Header with the three steps */}
            <div className="-mx-6 -mt-4 flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                        <Gift size={20} aria-hidden="true" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Sell gift cards</h2>
                </div>
                <ol className="hidden items-center gap-2 text-sm sm:flex" aria-label="Steps">
                    {STEPS.map((entry, index) => (
                        <li key={entry.id} className="flex items-center gap-2" aria-current={entry.id === step ? 'step' : undefined}>
                            {index > 0 && <span className="h-px w-6 bg-[var(--color-border)]" aria-hidden="true" />}
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${index < stepIndex
                                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                : index === stepIndex
                                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
                                    : 'bg-[var(--color-surface)] text-[var(--color-muted)]'}`}>
                                {index < stepIndex ? <Check size={13} aria-hidden="true" /> : index + 1}
                            </span>
                            <span className={index === stepIndex ? 'font-semibold text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}>{entry.label}</span>
                        </li>
                    ))}
                </ol>
                {step !== 'done' && <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>}
            </div>

            {error && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            )}

            {step === 'cards' && (
                <div className="grid gap-6 pt-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-6">
                        <section aria-labelledby="gc-scope-heading">
                            <h3 id="gc-scope-heading" className={sectionLabelClass}>1. Where can the cards be spent?</h3>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <button type="button" className={choiceClass(!vendorId)} aria-pressed={!vendorId} onClick={() => setVendorId(null)}>
                                    <span className="flex items-center gap-2 text-sm font-semibold"><Store size={16} aria-hidden="true" /> Anything in the store</span>
                                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">A Ravenlia gift card</span>
                                </button>
                                <div className={choiceClass(Boolean(vendorId))}>
                                    <label htmlFor="gc-vendor" className="flex items-center gap-2 text-sm font-semibold"><Gift size={16} aria-hidden="true" /> One vendor's items only</label>
                                    <select
                                        id="gc-vendor"
                                        value={vendorId || ''}
                                        onChange={(event) => setVendorId(event.target.value || null)}
                                        className={`${fieldClass} mt-1.5 h-9`}
                                    >
                                        <option value="">Choose a vendor…</option>
                                        {vendors.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </section>

                        <section aria-labelledby="gc-design-heading">
                            <h3 id="gc-design-heading" className={sectionLabelClass}>2. Pick a design</h3>
                            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                                {occasions.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        aria-pressed={occasion === entry.id}
                                        onClick={() => setOccasion(entry.id)}
                                        className={`rounded-xl border p-2 text-left transition-colors ${occasion === entry.id
                                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]'
                                            : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'}`}
                                    >
                                        <GiftCardFace simple card={{ occasion: entry.id, brand, vendorName: vendor?.name || null, amount: amountEach }} />
                                        <span className="mt-1.5 mb-0.5 block text-center text-sm font-medium">{entry.label}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section aria-labelledby="gc-cards-heading">
                            <h3 id="gc-cards-heading" className={sectionLabelClass}>3. Fill in the cards</h3>
                            <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
                                <div>
                                    <p className="text-xs text-[var(--color-muted)]">How many?</p>
                                    <div className="mt-1 flex items-center gap-1">
                                        <Button type="button" variant="secondary" size="sm" aria-label="One fewer card" onClick={() => setCount(drafts.length - 1)} disabled={drafts.length <= 1}><Minus size={16} /></Button>
                                        <input
                                            type="number"
                                            min={1}
                                            max={GIFT_CARD_MAX_PER_SALE}
                                            aria-label="Number of cards"
                                            value={drafts.length}
                                            onChange={(event) => setCount(Number(event.target.value))}
                                            className={`${fieldClass} h-9 w-16 text-center font-semibold tabular-nums`}
                                        />
                                        <Button type="button" variant="secondary" size="sm" aria-label="One more card" onClick={() => setCount(drafts.length + 1)} disabled={drafts.length >= GIFT_CARD_MAX_PER_SALE}><Plus size={16} /></Button>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--color-muted)]">Amount on each card</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {GIFT_CARD_AMOUNT_PRESETS.map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={amountEach === value}
                                                onClick={() => applyAmountToAll(value)}
                                                className={`h-9 rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors ${amountEach === value
                                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                                    : 'border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-surface-hover)]'}`}
                                            >
                                                ${value}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-2">
                                <div className={`hidden gap-2 px-1 text-xs font-medium text-[var(--color-muted)] lg:grid ${rowColumns}`}>
                                    <span>#</span><span>To</span><span>Amount</span><span>Note (optional)</span>
                                    {emailEnabled && <span>Email (optional)</span>}
                                    <span>Design</span><span />
                                </div>
                                {drafts.map((draft, index) => {
                                    const rowErrors = showErrors ? validation.errors[draft.key] : undefined;
                                    return (
                                        <div
                                            key={draft.key}
                                            onFocus={() => setFocusedKey(draft.key)}
                                            className={`grid grid-cols-2 items-center gap-2 rounded-xl border p-2 lg:border-0 lg:p-0 ${rowColumns} ${focusedKey === draft.key ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}
                                        >
                                            <span className="col-span-2 text-xs font-semibold tabular-nums text-[var(--color-muted)] lg:col-span-1 lg:text-center">
                                                <span className="lg:hidden">Card </span>{index + 1}
                                            </span>
                                            <input
                                                aria-label={`Card ${index + 1} recipient name`}
                                                placeholder="Recipient name"
                                                maxLength={GIFT_CARD_NAME_MAX_LENGTH}
                                                value={draft.recipientName}
                                                onChange={(event) => updateDraft(draft.key, { recipientName: event.target.value })}
                                                className={fieldClass}
                                            />
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted)]">$</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="1"
                                                    aria-label={`Card ${index + 1} amount`}
                                                    aria-invalid={Boolean(rowErrors?.amount)}
                                                    title={rowErrors?.amount}
                                                    value={draft.amount || ''}
                                                    onChange={(event) => updateDraft(draft.key, { amount: Number.parseFloat(event.target.value) || 0 })}
                                                    className={`${fieldClass} pl-6 tabular-nums ${rowErrors?.amount ? errorFieldClass : ''}`}
                                                />
                                            </div>
                                            <input
                                                aria-label={`Card ${index + 1} note`}
                                                placeholder="Leave blank to write by hand"
                                                maxLength={GIFT_CARD_NOTE_MAX_LENGTH}
                                                value={draft.message}
                                                onChange={(event) => updateDraft(draft.key, { message: event.target.value })}
                                                className={`${fieldClass} col-span-2 lg:col-span-1`}
                                            />
                                            {emailEnabled && (
                                                <input
                                                    type="email"
                                                    aria-label={`Card ${index + 1} recipient email`}
                                                    aria-invalid={Boolean(rowErrors?.email)}
                                                    title={rowErrors?.email}
                                                    placeholder="name@example.com"
                                                    value={draft.recipientEmail}
                                                    onChange={(event) => updateDraft(draft.key, { recipientEmail: event.target.value })}
                                                    className={`${fieldClass} col-span-2 lg:col-span-1 ${rowErrors?.email ? errorFieldClass : ''}`}
                                                />
                                            )}
                                            <select
                                                aria-label={`Card ${index + 1} design`}
                                                value={draft.occasion || ''}
                                                onChange={(event) => updateDraft(draft.key, { occasion: (event.target.value || null) as GiftCardOccasion | null })}
                                                className={fieldClass}
                                            >
                                                <option value="">Same as above</option>
                                                {occasions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                                            </select>
                                            <button
                                                type="button"
                                                aria-label={`Remove card ${index + 1}`}
                                                onClick={() => removeDraft(draft.key)}
                                                disabled={drafts.length <= 1}
                                                className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)] disabled:opacity-30"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    );
                                })}
                                <Button type="button" variant="soft" size="sm" leftIcon={<Plus size={15} />} onClick={() => setCount(drafts.length + 1)} disabled={drafts.length >= GIFT_CARD_MAX_PER_SALE}>
                                    Add another card
                                </Button>
                            </div>
                        </section>

                        <section aria-labelledby="gc-from-heading" className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label id="gc-from-heading" htmlFor="gc-from" className={sectionLabelClass}>4. Who are they from?</label>
                                <input
                                    id="gc-from"
                                    placeholder="Leave blank to write by hand"
                                    maxLength={GIFT_CARD_NAME_MAX_LENGTH}
                                    value={fromName}
                                    onChange={(event) => setFromName(event.target.value)}
                                    className={`${fieldClass} mt-2`}
                                />
                                <p className="mt-1 text-xs text-[var(--color-muted)]">Printed on every card.</p>
                            </div>
                            <label className="flex cursor-pointer items-start gap-3 self-end rounded-xl border border-[var(--color-border)] p-3">
                                <input
                                    type="checkbox"
                                    checked={emailEnabled}
                                    onChange={(event) => setEmailEnabled(event.target.checked)}
                                    className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                                />
                                <span>
                                    <span className="flex items-center gap-1.5 text-sm font-medium"><Mail size={15} aria-hidden="true" /> Also email cards to recipients</span>
                                    <span className="block text-xs text-[var(--color-muted)]">Adds an email box to each card. Cards without one are just printed.</span>
                                </span>
                            </label>
                        </section>

                        <section className="border-t border-[var(--color-border)] pt-4" aria-labelledby="gc-reprint-heading">
                            <h3 id="gc-reprint-heading" className="text-xs font-medium text-[var(--color-muted)]">Reprint a card that was already sold</h3>
                            <div className="mt-1.5 flex max-w-sm gap-2">
                                <input
                                    aria-label="Gift card code to reprint"
                                    placeholder="GC-…"
                                    value={reprintCode}
                                    onChange={(event) => setReprintCode(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') void handleReprint(); }}
                                    className={`${fieldClass} h-9 font-mono uppercase`}
                                />
                                <Button type="button" variant="secondary" size="sm" leftIcon={<Printer size={15} />} onClick={() => void handleReprint()} isLoading={isReprinting} disabled={!reprintCode.trim()}>
                                    Reprint
                                </Button>
                            </div>
                            {reprintMessage && <p className="mt-1 text-xs text-[var(--color-danger)]">{reprintMessage}</p>}
                        </section>
                    </div>

                    <aside className="lg:sticky lg:top-0 lg:self-start">
                        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                            <p className="text-xs font-medium text-[var(--color-muted)]">
                                Preview · card {previewIndex + 1} of {drafts.length}
                            </p>
                            <div className="mt-2 overflow-hidden rounded-md shadow-md">
                                <GiftCardFace card={toFace(previewDraft)} />
                            </div>
                            <p className="mt-2 text-xs text-[var(--color-muted)]">The code and barcode are added once the cards are paid for.</p>

                            <dl className="mt-4 space-y-1.5 border-t border-[var(--color-border)] pt-4 text-sm">
                                <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Cards</dt><dd className="tabular-nums">{drafts.length}</dd></div>
                                <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Good for</dt><dd className="truncate pl-3 text-right">{vendor ? `${vendor.name} items` : 'Anything in the store'}</dd></div>
                                <div className="flex items-baseline justify-between pt-1"><dt className="font-semibold">Total</dt><dd className="text-2xl font-semibold tabular-nums">{formatCurrency(total)}</dd></div>
                            </dl>
                            <Button className="mt-4" size="xl" fullWidth onClick={goToPayment}>Continue to payment</Button>
                        </div>
                    </aside>
                </div>
            )}

            {step === 'pay' && (
                <div className="mx-auto grid max-w-3xl gap-6 pt-6 md:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-5">
                        <div>
                            <h3 className={sectionLabelClass}>How are they paying?</h3>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <button type="button" aria-pressed={paymentMethod === 'card'} onClick={() => setPaymentMethod('card')} disabled={isSubmitting} className={choiceClass(paymentMethod === 'card')}>
                                    <span className="flex items-center gap-2 text-sm font-semibold"><CreditCard size={17} aria-hidden="true" /> Card</span>
                                </button>
                                <button type="button" aria-pressed={paymentMethod === 'cash'} onClick={() => setPaymentMethod('cash')} disabled={isSubmitting} className={choiceClass(paymentMethod === 'cash')}>
                                    <span className="flex items-center gap-2 text-sm font-semibold"><Banknote size={17} aria-hidden="true" /> Cash</span>
                                </button>
                            </div>
                        </div>

                        {paymentMethod === 'cash' ? (
                            <div>
                                <label htmlFor="gc-cash" className={sectionLabelClass}>Cash received</label>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {cashSuggestions.map((value, index) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setCashTendered(value.toFixed(2))}
                                            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm font-medium tabular-nums hover:bg-[var(--color-surface-hover)]"
                                        >
                                            {index === 0 ? `Exact ${formatCurrency(value)}` : formatCurrency(value)}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    id="gc-cash"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={cashTendered}
                                    onChange={(event) => setCashTendered(event.target.value)}
                                    className={`${fieldClass} mt-2 h-12 text-lg tabular-nums`}
                                />
                                {cashAmount >= cashDue && cashAmount > 0 && (
                                    <p className="mt-2 text-sm">Change due: <span className="text-lg font-semibold tabular-nums">{formatCurrency(changeDue)}</span></p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface)] px-4 py-3">
                                <span className="text-sm text-[var(--color-muted)]">
                                    {connectedReader ? 'Card reader is connected. The customer pays on the reader.' : 'No card reader is connected.'}
                                </span>
                                {!connectedReader && <Button type="button" size="sm" variant="secondary" onClick={onOpenReaderModal}>Connect reader</Button>}
                            </div>
                        )}
                    </div>

                    <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:self-start">
                        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                            {drafts.map((draft, index) => (
                                <li key={draft.key} className="flex justify-between gap-3">
                                    <span className="truncate text-[var(--color-muted)]">{draft.recipientName.trim() || `Card ${index + 1}`}</span>
                                    <span className="tabular-nums">{formatCurrency(roundGiftCardMoney(draft.amount))}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex items-baseline justify-between border-t border-[var(--color-border)] pt-3">
                            <span className="font-semibold">{drafts.length} card{drafts.length === 1 ? '' : 's'}</span>
                            <span className="text-2xl font-semibold tabular-nums">{formatCurrency(total)}</span>
                        </div>
                        <Button className="mt-4" size="xl" fullWidth onClick={() => void handleTakePayment()} isLoading={isSubmitting}>
                            {paymentMethod === 'card' ? `Charge ${formatCurrency(total)}` : `Take ${formatCurrency(cashDue)} cash`}
                        </Button>
                        <Button className="mt-2" variant="ghost" fullWidth leftIcon={<ArrowLeft size={15} />} onClick={() => { setError(null); setStep('cards'); }} disabled={isSubmitting}>
                            Back to cards
                        </Button>
                    </aside>
                </div>
            )}

            {step === 'done' && (
                <div className="grid gap-6 pt-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--color-muted)]">
                            Print preview · letter paper · cut along the dashed lines
                        </p>
                        <div className="mt-2 space-y-4 rounded-2xl bg-[var(--color-surface)] p-4">
                            <div className={`mx-auto space-y-4 [&>.gc-sheet]:shadow-md ${getGiftCardSheetSize(sheetSize).orientation === 'landscape' ? 'max-w-[720px]' : 'max-w-[560px]'}`}>
                                <GiftCardSheets cards={issued} size={sheetSize} />
                            </div>
                        </div>
                    </div>
                    <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                        <div className="rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] p-4">
                            <p className="flex items-center gap-2 font-semibold text-[var(--color-success)]"><Check size={18} aria-hidden="true" /> {issued.length} gift card{issued.length === 1 ? '' : 's'} ready</p>
                            <p className="mt-1 text-sm text-[var(--color-foreground)]">
                                {formatCurrency(issued.reduce((sum, card) => sum + card.amount, 0))} paid by {paymentMethod}.
                                {emailedCount > 0 && ` ${emailedCount} emailed.`}
                            </p>
                            {changeGiven > 0 && (
                                <p className="mt-2 text-sm">Change due: <span className="text-xl font-semibold tabular-nums">{formatCurrency(changeGiven)}</span></p>
                            )}
                        </div>
                        {warning && (
                            <div role="alert" className="rounded-xl bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">{warning}</div>
                        )}
                        {failedEmails.length > 0 && (
                            <div role="alert" className="rounded-xl bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                                Could not email {failedEmails.map((card) => card.recipientEmail).join(', ')}. Their cards are still valid and print below.
                            </div>
                        )}
                        <fieldset>
                            <legend className="text-xs font-medium text-[var(--color-muted)]">Print size</legend>
                            <div className="mt-1.5 grid grid-cols-2 gap-2">
                                {GIFT_CARD_SHEET_SIZES.map((size) => (
                                    <button
                                        key={size.id}
                                        type="button"
                                        aria-pressed={sheetSize === size.id}
                                        onClick={() => chooseSheetSize(size.id)}
                                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${sheetSize === size.id
                                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]'
                                            : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'}`}
                                    >
                                        <span className="block text-sm font-medium">{size.label}</span>
                                        <span className="block text-xs text-[var(--color-muted)]">{size.perSheet} per page · {formatGiftCardSheetSize(size)}</span>
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <Button size="xl" fullWidth leftIcon={<Printer size={18} />} onClick={() => void handlePrint()}>Print cards</Button>
                        <Button variant="secondary" fullWidth onClick={onClose}>Done</Button>
                        <details className="text-sm">
                            <summary className="cursor-pointer text-[var(--color-muted)]">Show the codes</summary>
                            <ul className="mt-2 space-y-1">
                                {issued.map((card, index) => (
                                    <li key={card.code} className="flex justify-between gap-3">
                                        <span className="truncate text-[var(--color-muted)]">{(card.recipientName || '').trim() || `Card ${index + 1}`}</span>
                                        <span className="font-mono">{card.code}</span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </aside>
                </div>
            )}
        </Modal>
    );
}
