import { useState, useRef, useCallback, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: ReactNode;
    threshold?: number;
    className?: string;
    disabled?: boolean;
}

/**
 * Pull-to-refresh wrapper component for mobile lists
 * Wraps scrollable content and triggers refresh on pull-down gesture
 */
export function PullToRefresh({
    onRefresh,
    children,
    threshold = 80,
    className,
    disabled = false,
}: PullToRefreshProps) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startYRef = useRef(0);
    const currentYRef = useRef(0);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled || isRefreshing) return;

        const container = containerRef.current;
        if (!container) return;

        // Only enable pull-to-refresh when scrolled to top
        if (container.scrollTop > 0) return;

        startYRef.current = e.touches[0].clientY;
        setIsPulling(true);
    }, [disabled, isRefreshing]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isPulling || disabled || isRefreshing) return;

        const container = containerRef.current;
        if (!container) return;

        // Only pull if we started at the top
        if (container.scrollTop > 0) {
            setIsPulling(false);
            setPullDistance(0);
            return;
        }

        currentYRef.current = e.touches[0].clientY;
        const distance = currentYRef.current - startYRef.current;

        if (distance > 0) {
            // Apply resistance to the pull
            const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
            setPullDistance(resistedDistance);

            // Prevent default scrolling behavior
            if (distance > 10) {
                e.preventDefault();
            }
        }
    }, [isPulling, disabled, isRefreshing, threshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling || disabled) return;

        setIsPulling(false);

        if (pullDistance >= threshold && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(threshold * 0.5); // Keep some visual indication

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
    }, [isPulling, disabled, pullDistance, threshold, isRefreshing, onRefresh]);

    const pullProgress = Math.min(pullDistance / threshold, 1);
    const showSpinner = isRefreshing || pullProgress >= 1;

    return (
        <div
            ref={containerRef}
            className={cn('relative overflow-y-auto mobile-scroll', className)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull indicator */}
            <div
                className={cn(
                    'absolute left-0 right-0 flex items-center justify-center',
                    'pointer-events-none transition-opacity duration-200',
                    pullDistance > 0 || isRefreshing ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                    top: pullDistance > 0 ? pullDistance - 40 : 0,
                    height: 40,
                }}
            >
                <div
                    className={cn(
                        'w-8 h-8 rounded-full bg-white shadow-md',
                        'flex items-center justify-center',
                        showSpinner && 'pull-to-refresh-spinner'
                    )}
                    style={{
                        transform: showSpinner ? undefined : `rotate(${pullProgress * 360}deg)`,
                    }}
                >
                    <RefreshIcon />
                </div>
            </div>

            {/* Content with pull offset */}
            <div
                style={{
                    transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
                    transition: isPulling ? 'none' : 'transform 0.2s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
}

function RefreshIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--color-primary)]"
        >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
        </svg>
    );
}
