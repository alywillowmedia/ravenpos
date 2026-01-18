import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePublicInventory } from '../../hooks/usePublicInventory';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { Item } from '../../types';

export function ItemDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { getItemById } = usePublicInventory();
    const [item, setItem] = useState<Item | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchItem() {
            if (!id) return;

            setIsLoading(true);
            const { data, error: fetchError } = await getItemById(id);

            if (fetchError) {
                setError(fetchError);
            } else {
                setItem(data);
            }
            setIsLoading(false);
        }

        fetchItem();
    }, [id, getItemById]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--color-danger-bg)] flex items-center justify-center">
                        <svg
                            className="w-10 h-10 text-[var(--color-danger)]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <h2 className="text-h2 text-[var(--color-foreground)] mb-2">
                        Item Not Found
                    </h2>
                    <p className="text-[var(--color-muted)] mb-8">
                        This item may no longer be available or doesn't exist.
                    </p>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--color-primary)] text-white font-medium rounded-xl hover:bg-[var(--color-primary-hover)] transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                            />
                        </svg>
                        Back to Browse
                    </Link>
                </div>
            </div>
        );
    }

    const vendorName = item.consignor?.name || 'Unknown Vendor';
    const boothLocation = item.consignor?.booth_location;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fadeIn">
            {/* Back Link */}
            <Link
                to="/"
                className="inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors mb-6"
            >
                <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                </svg>
                Back to Browse
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                {/* Image Section */}
                <div className="aspect-square bg-[var(--color-surface)] rounded-3xl overflow-hidden border border-[var(--color-border)]">
                    {item.image_url ? (
                        <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <svg
                                className="w-24 h-24 text-[var(--color-muted-foreground)]"
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

                {/* Details Section */}
                <div className="flex flex-col">
                    {/* Category Badge */}
                    <span className="inline-flex items-center self-start px-3 py-1 rounded-full text-sm font-medium bg-[var(--color-surface)] text-[var(--color-foreground)] border border-[var(--color-border)] mb-4">
                        {item.category}
                    </span>

                    {/* Item Name */}
                    <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-foreground)] leading-tight">
                        {item.name}
                    </h1>

                    {/* Variant */}
                    {item.variant && (
                        <p className="text-lg text-[var(--color-muted)] mt-2">
                            {item.variant}
                        </p>
                    )}

                    {/* Price */}
                    <div className="mt-6">
                        <span className="text-4xl font-bold text-[var(--color-foreground)]">
                            ${item.price.toFixed(2)}
                        </span>
                    </div>

                    {/* Divider */}
                    <hr className="my-8 border-[var(--color-border)]" />

                    {/* Vendor Info */}
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium">
                                {vendorName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="font-medium text-[var(--color-foreground)]">
                                    {vendorName}
                                </p>
                                {boothLocation && (
                                    <p className="text-sm text-[var(--color-muted)]">
                                        Booth {boothLocation}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* SKU */}
                        <p className="text-sm text-[var(--color-muted)]">
                            SKU: <span className="font-mono">{item.sku}</span>
                        </p>
                    </div>

                    {/* Divider */}
                    <hr className="my-8 border-[var(--color-border)]" />

                    {/* In Store Message */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
                                <svg
                                    className="w-6 h-6 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-[var(--color-foreground)]">
                                    Available In Store
                                </h3>
                                <p className="text-sm text-[var(--color-muted)] mt-1">
                                    Visit us to see this item in person and purchase. Our friendly staff is here to help!
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
