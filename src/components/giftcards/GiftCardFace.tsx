import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import JsBarcode from 'jsbarcode';
import {
    getGiftCardBrandName,
    getGiftCardOccasion,
    getGiftCardScopeLine,
    type GiftCardBrand,
    type GiftCardOccasion,
} from '../../lib/giftCardThemes';
import alywillowArt from '../../assets/giftcards/alywillow-bg.webp';
import alywillowLogo from '../../assets/giftcards/alywillow-logo.svg';
import ravenliaArt from '../../assets/giftcards/ravenlia-bg.webp';
import ravenliaLogo from '../../assets/giftcards/ravenlia-logo.webp';
import './giftcards.css';

/** Each brand's illustrated border and logo. The art is the same for every occasion. */
const BRAND_ART: Record<GiftCardBrand, { art: string; logo: string }> = {
    alywillow: { art: alywillowArt, logo: alywillowLogo },
    ravenlia: { art: ravenliaArt, logo: ravenliaLogo },
};

export interface GiftCardFaceData {
    occasion: GiftCardOccasion | string | null;
    brand: GiftCardBrand;
    /** Set for a vendor card; null for a store-wide card. */
    vendorName: string | null;
    amount: number;
    recipientName?: string | null;
    fromName?: string | null;
    message?: string | null;
    /** Missing until the card has been paid for. */
    code?: string | null;
}

function formatCardAmount(amount: number): string {
    const value = Number(amount) || 0;
    return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function Barcode({ code }: { code: string }) {
    const ref = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const svg = ref.current;
        if (!svg) return;
        try {
            JsBarcode(svg, code, {
                format: 'CODE128',
                displayValue: false,
                margin: 0,
                width: 2,
                height: 40,
                lineColor: '#1c1917',
                background: 'transparent',
            });
            // Let CSS size it: stretch the bars to the chip instead of a fixed pixel size.
            const width = svg.getAttribute('width');
            const height = svg.getAttribute('height');
            if (width && height && !svg.getAttribute('viewBox')) {
                svg.setAttribute('viewBox', `0 0 ${parseFloat(width)} ${parseFloat(height)}`);
            }
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.removeAttribute('style');
            svg.setAttribute('preserveAspectRatio', 'none');
        } catch {
            // An unencodable code leaves the chip blank; the printed code is still readable.
        }
    }, [code]);

    return <svg ref={ref} role="img" aria-label={`Barcode for ${code}`} />;
}

/** Smallest a fitted line may shrink to, as a share of its designed size. */
const MIN_FIT_SCALE = 0.5;

/**
 * Shrinks an element's text until it fits in the lines it was designed for
 * (`data-fit-lines`), so a long name or note gets smaller instead of being cut
 * off. Smaller text may use more lines, as long as it stays in the same space.
 * Only text too long for the smallest size is clipped.
 */
function fitText(el: HTMLElement) {
    el.style.fontSize = '';
    el.style.maxHeight = '';
    el.classList.remove('gcf-fit-min');
    const computed = getComputedStyle(el);
    const baseSize = parseFloat(computed.fontSize);
    if (!baseSize) return;
    const lines = Number(el.dataset.fitLines) || 1;
    const lineHeight = parseFloat(computed.lineHeight) || baseSize * 1.2;
    const padding = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
    const maxHeight = lineHeight * lines + padding + 1;
    const fits = () => el.scrollHeight <= maxHeight && el.scrollWidth <= el.clientWidth + 1;

    let scale = 1;
    while (!fits() && scale > MIN_FIT_SCALE) {
        scale = Math.max(MIN_FIT_SCALE, scale - 0.04);
        el.style.fontSize = `${baseSize * scale}px`;
    }
    if (!fits()) el.classList.add('gcf-fit-min');
    el.style.maxHeight = `${maxHeight}px`;
}

/** The card is laid out at this width and scaled to fit, so its text never
 *  drops below a browser's minimum font size at thumbnail sizes. */
const DESIGN_WIDTH = 778;

/**
 * `simple` drops the names, note and barcode and enlarges what is left, for
 * small thumbnails where the full card would be unreadable.
 */
export function GiftCardFace({ card, className, simple = false }: { card: GiftCardFaceData; className?: string; simple?: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null);
    const occasion = getGiftCardOccasion(card.occasion);
    const brandArt = BRAND_ART[card.brand];
    const recipientName = (card.recipientName || '').trim();
    const fromName = (card.fromName || '').trim();
    const message = (card.message || '').trim();
    const code = (card.code || '').trim();

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const fit = () => {
            const width = root.getBoundingClientRect().width;
            if (width > 0) root.style.setProperty('--gc-scale', String(width / DESIGN_WIDTH));
        };
        fit();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(fit);
        observer.observe(root);
        return () => observer.disconnect();
    }, []);

    const scopeLine = getGiftCardScopeLine(card.vendorName);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let cancelled = false;
        const fitAll = () => {
            if (cancelled) return;
            root.querySelectorAll<HTMLElement>('[data-fit-lines]').forEach(fitText);
        };
        fitAll();
        // Sizes depend on the card's own fonts, which may still be loading.
        document.fonts?.ready.then(fitAll).catch(() => undefined);
        return () => { cancelled = true; };
    }, [recipientName, fromName, message, scopeLine, card.brand, simple]);

    const style = {
        '--gc-art': `url("${brandArt.art}")`,
        '--gc-logo': `url("${brandArt.logo}")`,
        '--gc-accent': occasion.accents[card.brand],
    } as CSSProperties;

    const amount = <div className="gcf-amt">{formatCardAmount(card.amount)}</div>;

    return (
        <div ref={rootRef} className={`gcf gcf-${card.brand}${simple ? ' gcf-simple' : ''}${className ? ` ${className}` : ''}`} style={style}>
            <div className="gcf-in">
                <div className="gcf-top">
                    <div className="gcf-logo" role="img" aria-label={getGiftCardBrandName(card.brand)} />
                    <div className="gcf-head">{occasion.headline}</div>
                </div>
                {simple ? amount : (
                    <>
                        <div className="gcf-mid">
                            <div className="gcf-who gcf-to">
                                <b>To</b>
                                {recipientName ? <span data-fit-lines="2">{recipientName}</span> : <i className="gcf-rule" />}
                            </div>
                            {amount}
                            <div className="gcf-who gcf-from">
                                <b>From</b>
                                {fromName ? <span data-fit-lines="2">{fromName}</span> : <i className="gcf-rule" />}
                            </div>
                        </div>
                        <div className="gcf-msg">
                            <div className="gcf-div" />
                            {message
                                ? <div className="gcf-note"><span data-fit-lines="2">“{message}”</span></div>
                                : <div className="gcf-note-lines" aria-hidden="true"><i /><i /></div>}
                        </div>
                        <div className="gcf-bot">
                            <div className="gcf-chip">
                                {code ? <Barcode code={code} /> : <div className="gcf-chip-empty" />}
                            </div>
                            <div className="gcf-code">{code || 'GC-··········'}</div>
                            <div className="gcf-scope"><span data-fit-lines="2">{scopeLine}</span></div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
