import { createRoot } from 'react-dom/client';
import type { GiftCardFaceData } from './GiftCardFace';
import { GiftCardSheets } from './GiftCardSheet';

function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Opens the system print dialog with the cards laid out eight to a page.
 * Prints from the current window so the card fonts are already loaded.
 */
export async function printGiftCards(cards: GiftCardFaceData[]): Promise<{ success: boolean; error?: string }> {
    if (cards.length === 0) return { success: false, error: 'There are no cards to print.' };

    const container = document.createElement('div');
    container.className = 'gc-print-root';
    const pageStyle = document.createElement('style');
    pageStyle.textContent = '@page { size: letter portrait; margin: 0; }';

    const root = createRoot(container);
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        window.removeEventListener('afterprint', cleanup);
        document.documentElement.classList.remove('gc-printing');
        root.unmount();
        container.remove();
        pageStyle.remove();
    };

    try {
        document.body.appendChild(container);
        document.head.appendChild(pageStyle);
        document.documentElement.classList.add('gc-printing');
        root.render(<GiftCardSheets cards={cards} />);

        // Let React commit, the barcodes draw and the fonts settle before printing.
        await nextFrame();
        await nextFrame();
        if (document.fonts?.ready) {
            await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
        }
        await nextFrame();

        window.addEventListener('afterprint', cleanup);
        window.print();
        // Browsers where print() returns straight away fire afterprint; this is the fallback.
        setTimeout(cleanup, 60_000);
        return { success: true };
    } catch (error) {
        cleanup();
        return { success: false, error: error instanceof Error ? error.message : 'Unable to print the gift cards' };
    }
}
