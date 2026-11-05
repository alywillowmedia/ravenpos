import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveSidebarState } from '../components/layout/portalNavigation';

export function useSidebarCollapsed(storageKey: string) {
    const { pathname } = useLocation();
    const [savedCollapsed, setSavedCollapsed] = useState(() => localStorage.getItem(storageKey) === 'true');

    useEffect(() => {
        localStorage.setItem(storageKey, String(savedCollapsed));
    }, [savedCollapsed, storageKey]);

    const toggle = useCallback(() => setSavedCollapsed((value) => !value), []);

    return { ...resolveSidebarState(savedCollapsed, pathname), toggle };
}
