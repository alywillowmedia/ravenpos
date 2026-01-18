import { Link } from 'react-router-dom';
import type { Item } from '../../types';

interface ProductCardProps {
    item: Item;
}

export function ProductCard({ item }: ProductCardProps) {
    const vendorName = item.consignor?.name || 'Unknown Vendor';
    const boothLocation = item.consignor?.booth_location;

    return (
        <Link
            to={`/item/${item.id}`}
            className="group block bg-white rounded-2xl border border-[var(--color-border)] overflow-hidden hover:shadow-xl hover:border-[var(--color-primary)]/30 transition-all duration-300"
        >
            {/* Image Container */}
            <div className="aspect-square bg-[var(--color-surface)] relative overflow-hidden">
                {item.image_url ? (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg
                            className="w-16 h-16 text-[var(--color-muted-foreground)]"
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
                <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/90 backdrop-blur-sm text-[var(--color-foreground)] shadow-sm">
                        {item.category}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-4">
                {/* Item Name */}
                <h3 className="text-base font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
                    {item.name}
                </h3>

                {/* Variant if exists */}
                {item.variant && (
                    <p className="text-sm text-[var(--color-muted)] mt-0.5 line-clamp-1">
                        {item.variant}
                    </p>
                )}

                {/* Vendor Info */}
                <p className="text-xs text-[var(--color-muted)] mt-2">
                    {vendorName}
                    {boothLocation && (
                        <span className="text-[var(--color-muted-foreground)]">
                            {' · '}Booth {boothLocation}
                        </span>
                    )}
                </p>

                {/* Price */}
                <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-[var(--color-foreground)]">
                        ${item.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-[var(--color-success)] font-medium">
                        In Stock
                    </span>
                </div>
            </div>
        </Link>
    );
}
