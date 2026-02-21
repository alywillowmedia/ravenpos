import { Link } from 'react-router-dom';
import { buildVendorPath } from '../../lib/storefront';

interface VendorCardProps {
    vendor: {
        id: string;
        name: string;
        storefront_display_name?: string | null;
        storefront_logo_url?: string | null;
        booth_location?: string | null;
        itemCount?: number;
    };
}

export function VendorCard({ vendor }: VendorCardProps) {
    return (
        <Link
            to={buildVendorPath(vendor)}
            className="group flex-shrink-0 w-64 bg-white rounded-2xl border border-[var(--color-border)] p-5 hover:shadow-lg hover:border-[var(--color-primary)]/30 transition-all duration-300"
        >
            {/* Vendor Avatar */}
            {vendor.storefront_logo_url ? (
                <img
                    src={vendor.storefront_logo_url}
                    alt={`${vendor.storefront_display_name || vendor.name} logo`}
                    className="w-14 h-14 rounded-xl object-cover mb-4 group-hover:scale-105 transition-transform border border-[var(--color-border)]"
                />
            ) : (
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <span className="text-2xl font-bold text-white">
                        {(vendor.storefront_display_name || vendor.name).charAt(0).toUpperCase()}
                    </span>
                </div>
            )}

            {/* Vendor Name */}
            <h3 className="text-lg font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
                {vendor.storefront_display_name || vendor.name}
            </h3>

            {/* Booth Location */}
            {vendor.booth_location && (
                <p className="text-sm text-[var(--color-muted)] mt-1">
                    Booth {vendor.booth_location}
                </p>
            )}

            {/* Item Count */}
            {typeof vendor.itemCount === 'number' && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted)]">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    {vendor.itemCount} {vendor.itemCount === 1 ? 'item' : 'items'}
                </div>
            )}
        </Link>
    );
}
