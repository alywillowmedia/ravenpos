import { chunkGiftCardsIntoSheets } from '../../lib/giftCardBatch';
import { GiftCardFace, type GiftCardFaceData } from './GiftCardFace';
import './giftcards.css';

/** One letter page: up to eight cards, 2 across by 4 down, cut on the dashed lines. */
export function GiftCardSheet({ cards }: { cards: GiftCardFaceData[] }) {
    const cells = Array.from({ length: 8 }, (_, index) => cards[index] || null);
    return (
        <div className="gc-sheet">
            {cells.map((card, index) => (
                <div className="gc-cell" key={card?.code || index}>
                    {card && <GiftCardFace card={card} />}
                </div>
            ))}
        </div>
    );
}

export function GiftCardSheets({ cards }: { cards: GiftCardFaceData[] }) {
    return (
        <>
            {chunkGiftCardsIntoSheets(cards).map((sheet, index) => (
                <GiftCardSheet key={index} cards={sheet} />
            ))}
        </>
    );
}
