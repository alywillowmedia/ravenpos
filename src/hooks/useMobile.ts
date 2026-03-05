import { useState, useEffect } from 'react';

/**
 * Breakpoints for responsive design
 */
const BREAKPOINTS = {
    mobile: 640,   // sm
    tablet: 1024,  // lg
    desktop: 1280, // xl
} as const;

/**
 * Custom hook for mobile detection and responsive state management
 */
export function useMobile() {
    const [state, setState] = useState(() => ({
        isMobile: typeof window !== 'undefined' ? window.innerWidth < BREAKPOINTS.tablet : false,
        isTablet: typeof window !== 'undefined'
            ? window.innerWidth >= BREAKPOINTS.mobile && window.innerWidth < BREAKPOINTS.tablet
            : false,
        isDesktop: typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINTS.tablet : true,
        isTouch: typeof window !== 'undefined'
            ? 'ontouchstart' in window || navigator.maxTouchPoints > 0
            : false,
        width: typeof window !== 'undefined' ? window.innerWidth : 1024,
        height: typeof window !== 'undefined' ? window.innerHeight : 768,
    }));

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const handleResize = () => {
            // Debounce resize events
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const width = window.innerWidth;
                const height = window.innerHeight;

                setState({
                    isMobile: width < BREAKPOINTS.tablet,
                    isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
                    isDesktop: width >= BREAKPOINTS.tablet,
                    isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
                    width,
                    height,
                });
            }, 100);
        };

        // Set initial state
        handleResize();

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    return state;
}

/**
 * Hook for custom media query matching
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia(query);
        setMatches(mediaQuery.matches);

        const handler = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // Modern browsers
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
        // Legacy browsers
        mediaQuery.addListener(handler);
        return () => mediaQuery.removeListener(handler);
    }, [query]);

    return matches;
}

/**
 * Hook to detect if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
    return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Hook to detect if device is in landscape orientation
 */
export function useIsLandscape(): boolean {
    return useMediaQuery('(orientation: landscape)');
}

/**
 * Hook to detect iOS devices (for specific iOS behaviors)
 */
export function useIsIOS(): boolean {
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        setIsIOS(iOS);
    }, []);

    return isIOS;
}

/**
 * Hook to detect standalone PWA mode
 */
export function useIsStandalone(): boolean {
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
        const standalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            standaloneNavigator.standalone === true;
        setIsStandalone(standalone);
    }, []);

    return isStandalone;
}
