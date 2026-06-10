import { Link } from 'react-router-dom';
import type { Item } from '../../types';
import { buildItemPath } from '../../lib/storefront';

interface ProductCardProps {
    item: Item;
}

export function ProductCard({ item }: ProductCardProps) {
    const vendorName = item.consignor?.storefront_display_name || item.consignor?.name || 'Unknown Vendor';
    const boothLocation = item.consignor?.booth_location;
    const detailLines = [item.variant_summary, item.other_details_1, item.other_details_2].filter(Boolean) as string[];

    return (
        <Link
            to={buildItemPath(item)}
            className="group block focus:outline-none"
        >
            {/* Image — the hero of the card */}
            <div className="relative aspect-[7/8] overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-[var(--shadow-gallery)] ring-1 ring-[var(--color-border)] transition-all duration-500 group-hover:shadow-[var(--shadow-gallery-lifted)] group-hover:-translate-y-0.5">
                {item.image_url ? (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <svg
                            className="h-14 w-14 text-[var(--color-muted-foreground)]/50"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                )}
            </div>

            {/* Content — quiet, typographic */}
            <div className="px-1 pt-4">
                <p className="ravenlia-eyebrow">{item.category}</p>

                <h3 className="mt-1.5 text-lg leading-snug text-[var(--color-foreground)] transition-colors group-hover:text-[var(--color-primary)] line-clamp-1">
                    {item.name}
                </h3>

                {detailLines.length > 0 && (
                    <p className="mt-0.5 text-sm text-[var(--color-muted)] line-clamp-1">
                        {detailLines[0]}
                    </p>
                )}

                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                    <span className="truncate text-xs text-[var(--color-muted)]">
                        {vendorName}
                        {boothLocation && (
                            <span className="text-[var(--color-muted-foreground)]">{` · Booth ${boothLocation}`}</span>
                        )}
                    </span>
                    <span className="shrink-0 text-base font-medium tracking-tight text-[var(--color-foreground)]">
                        ${item.price.toFixed(2)}
                    </span>
                </div>
            </div>
        </Link>
    );
}
