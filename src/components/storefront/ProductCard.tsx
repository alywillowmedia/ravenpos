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
            className="group block bg-[var(--color-surface-elevated)] rounded-3xl border-2 border-[var(--color-border)] overflow-hidden hover:shadow-2xl hover:-translate-y-1 hover:border-[var(--color-primary)] transition-all duration-300"
        >
            {/* Image Container */}
            <div className="aspect-square bg-[var(--color-surface)] relative overflow-hidden">
                {item.image_url ? (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-hover)]">
                        <svg
                            className="w-16 h-16 text-[var(--color-muted-foreground)]/50"
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

                {/* Category Badge */}
                <div className="absolute top-4 left-4">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-md text-black shadow-sm border border-black/5">
                        {item.category}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-5">
                {/* Item Name */}
                <h3 className="text-lg font-bold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
                    {item.name}
                </h3>

                {detailLines.length > 0 && (
                    <div className="mt-1 space-y-1">
                        {detailLines.slice(0, 2).map((line, idx) => (
                            <p key={`${item.id}-detail-${idx}`} className="text-sm text-[var(--color-muted)] line-clamp-1 font-medium">
                                {line}
                            </p>
                        ))}
                    </div>
                )}

                {/* Vendor Info */}
                <div className="flex items-center gap-2 mt-3">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 border border-[var(--color-primary)]/20">
                        <span className="text-[10px] font-bold text-[var(--color-primary)]">
                            {vendorName.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <p className="text-sm text-[var(--color-muted)] font-medium truncate">
                        {vendorName}
                        {boothLocation && (
                            <span className="text-[var(--color-muted-foreground)]">
                                {' · '}Booth {boothLocation}
                            </span>
                        )}
                    </p>
                </div>

                {/* Price */}
                <div className="mt-4 flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
                    <span className="text-xl font-black text-[var(--color-foreground)]">
                        ${item.price.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--color-success)]/10 text-[var(--color-success)]">
                        In Stock
                    </span>
                </div>
            </div>
        </Link>
    );
}
