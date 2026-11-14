import type { CSSProperties } from 'react';
import {
    chunkGiftCardsIntoSheets,
    getGiftCardPage,
    getGiftCardSheetSize,
    type GiftCardSheetSizeId,
} from '../../lib/giftCardBatch';
import { GiftCardFace, type GiftCardFaceData } from './GiftCardFace';
import './giftcards.css';

/** The card is designed 778px wide; on paper an inch is 96px. */
const DESIGN_WIDTH = 778;

/** One letter page of cards at the chosen print size, cut on the dashed lines. */
export function GiftCardSheet({ cards, size: sizeId }: { cards: GiftCardFaceData[]; size?: GiftCardSheetSizeId }) {
    const size = getGiftCardSheetSize(sizeId);
    const page = getGiftCardPage(size);
    const cells = Array.from({ length: size.perSheet }, (_, index) => cards[index] || null);
    const style = {
        '--gc-page-w': page.width,
        '--gc-page-h': page.height,
        '--gc-card-w': size.cardWidth,
        '--gc-card-h': size.cardHeight,
        '--gc-cols': size.columns,
        '--gc-print-scale': (size.cardWidth * 96) / DESIGN_WIDTH,
    } as CSSProperties;
    return (
        <div className="gc-sheet" style={style}>
            {cells.map((card, index) => (
                <div className="gc-cell" key={card?.code || index}>
                    {card && <GiftCardFace card={card} />}
                </div>
            ))}
        </div>
    );
}

export function GiftCardSheets({ cards, size: sizeId }: { cards: GiftCardFaceData[]; size?: GiftCardSheetSizeId }) {
    const size = getGiftCardSheetSize(sizeId);
    return (
        <>
            {chunkGiftCardsIntoSheets(cards, size.perSheet).map((sheet, index) => (
                <GiftCardSheet key={index} cards={sheet} size={size.id} />
            ))}
        </>
    );
}
