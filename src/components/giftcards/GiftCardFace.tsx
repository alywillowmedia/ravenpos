import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import JsBarcode from 'jsbarcode';
import {
    getGiftCardBrandName,
    getGiftCardOccasion,
    getGiftCardScopeLine,
    type GiftCardBrand,
    type GiftCardOccasion,
} from '../../lib/giftCardThemes';
import './giftcards.css';

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

function Motif({ occasion, brand }: { occasion: GiftCardOccasion; brand: GiftCardBrand }) {
    const sprig = (
        <svg className="gcf-motif" style={{ right: '0.9em', top: '5em', width: '5em', opacity: 0.4 }} viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M4 56C40 50 80 34 116 6" />
            <path d="M26 52c2-10 10-14 18-13-2 9-9 14-18 13zM48 44c1-10 9-15 17-15-1 9-8 15-17 15zM70 33c0-9 7-15 15-16 0 9-6 15-15 16zM90 21c0-8 6-13 13-14 0 8-5 13-13 14zM38 49c9 3 15 0 18-6M60 39c9 2 15-1 17-7" />
        </svg>
    );
    const star = (cx: number, cy: number, r: number) => (
        <path d={`M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`} />
    );

    if (occasion === 'birthday') {
        const dots: Array<[number, number, number, number]> = [
            [8, 10, 2.4, 0], [26, 30, 1.8, 1], [40, 8, 2, 2], [56, 26, 2.6, 0], [70, 12, 1.6, 1],
            [84, 34, 2.2, 2], [98, 16, 2.4, 0], [112, 30, 1.8, 1], [18, 46, 1.8, 2], [48, 44, 1.6, 1],
            [66, 48, 2.2, 0], [104, 48, 1.6, 2],
        ];
        const colors = brand === 'alywillow'
            ? ['#94583B', '#8A9A6B', '#C9A45C']
            : ['#B4492F', '#D9A441', '#5C7A6A'];
        return (
            <svg className="gcf-motif" style={{ right: '0.8em', top: '5em', width: '6.4em', opacity: 0.75 }} viewBox="0 0 120 56" aria-hidden="true">
                {dots.map(([cx, cy, r, color], index) => <circle key={index} cx={cx} cy={cy} r={r} fill={colors[color]} />)}
            </svg>
        );
    }

    if (occasion === 'christmas' && brand === 'alywillow') {
        return (
            <svg className="gcf-motif" style={{ right: '0.9em', top: '5em', width: '5em', opacity: 0.7 }} viewBox="0 0 120 60" fill="none" stroke="#3F5A45" strokeWidth="1.4" aria-hidden="true">
                <path d="M6 54C40 48 78 32 112 8" />
                <path d="M24 51l-4-12M24 51l10-7M40 46l-3-13M40 46l11-6M57 39l-2-13M57 39l11-5M74 30l-1-12M74 30l11-4M90 21l0-11M90 21l10-3" />
                <circle cx="100" cy="24" r="3.4" fill="currentColor" stroke="none" />
                <circle cx="108" cy="18" r="3" fill="currentColor" stroke="none" />
                <circle cx="104" cy="31" r="2.6" fill="currentColor" stroke="none" />
            </svg>
        );
    }

    if (occasion === 'christmas') {
        return (
            <svg className="gcf-motif" style={{ right: '1em', top: '5.1em', width: '5em', opacity: 0.9 }} viewBox="0 0 100 40" fill="currentColor" aria-hidden="true">
                {star(14, 22, 9)}{star(50, 14, 13)}{star(86, 24, 8)}
            </svg>
        );
    }

    if (occasion === 'holidays') {
        const flake = (cx: number, cy: number, r: number) => (
            <g key={`${cx}-${cy}`} transform={`translate(${cx} ${cy})`}>
                {[0, 60, 120].map((angle) => (
                    <path key={angle} transform={`rotate(${angle})`} d={`M0 ${-r}V${r}M${-r * 0.3} ${-r * 0.7}L0 ${-r * 0.45}L${r * 0.3} ${-r * 0.7}M${-r * 0.3} ${r * 0.7}L0 ${r * 0.45}L${r * 0.3} ${r * 0.7}`} />
                ))}
            </g>
        );
        return (
            <svg className="gcf-motif" style={{ right: '1em', top: '5em', width: '5.2em', opacity: 0.8 }} viewBox="0 0 104 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                {flake(16, 24, 10)}{flake(52, 16, 14)}{flake(88, 28, 9)}
            </svg>
        );
    }

    if (brand === 'alywillow' || occasion === 'thankyou') return sprig;

    // Ravenlia everyday: a plain antique-label flourish.
    return (
        <svg className="gcf-motif" style={{ right: '1em', bottom: '1.1em', width: '4.6em', opacity: 0.7 }} viewBox="0 0 92 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <path d="M2 8h30M60 8h30" />
            <path d="M46 2l6 6-6 6-6-6z" />
            <circle cx="36" cy="8" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="56" cy="8" r="1.4" fill="currentColor" stroke="none" />
        </svg>
    );
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
    const palette = occasion.palettes[card.brand];
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

    const style = {
        '--gc-bg': palette.bg,
        '--gc-ink': palette.ink,
        '--gc-accent': palette.accent,
        '--gc-line': palette.line,
        '--gc-display': card.brand === 'alywillow' ? "'Newsreader', Georgia, serif" : "'Fraunces', Georgia, serif",
    } as CSSProperties;

    const heading = (
        <div>
            <div className="gcf-brand">{getGiftCardBrandName(card.brand)}</div>
            <div className="gcf-head">{occasion.headline}</div>
        </div>
    );

    return (
        <div ref={rootRef} className={`gcf${simple ? ' gcf-simple' : ''}${className ? ` ${className}` : ''}`} style={style}>
            <div className="gcf-in">
                <div className="gcf-frame" />
                <div className="gcf-l">
                    <Motif occasion={occasion.id} brand={card.brand} />
                    {heading}
                    {simple ? (
                        <div className="gcf-amt">{formatCardAmount(card.amount)}</div>
                    ) : (
                        <div className="gcf-who">
                            <div className="gcf-tf"><b>To</b>{recipientName ? <span>{recipientName}</span> : <i className="gcf-rule" />}</div>
                            <div className="gcf-tf"><b>From</b>{fromName ? <span>{fromName}</span> : <i className="gcf-rule" />}</div>
                            {message
                                ? <div className="gcf-note">“{message}”</div>
                                : <div className="gcf-note-lines" aria-hidden="true"><i /><i /></div>}
                        </div>
                    )}
                </div>
                {!simple && (
                    <div className="gcf-r">
                        <div className="gcf-amt">{formatCardAmount(card.amount)}</div>
                        <div className="gcf-redeem">
                            <div className="gcf-chip">
                                {code ? <Barcode code={code} /> : <div className="gcf-chip-empty" />}
                            </div>
                            <div className="gcf-code">{code || 'GC-··········'}</div>
                            <div className="gcf-scope">{getGiftCardScopeLine(card.vendorName)}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
