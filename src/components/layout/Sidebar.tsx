import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Printer, Sparkles } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getCachedAvatarUrl } from '../../lib/avatar';
import { cn } from '../../lib/utils';
import { PrinterSettings } from '../PrinterSettings';
import { ChangelogModal } from './ChangelogModal';
import { adminNavigation, isNavGroup, pathIsActive, type PortalNavGroup } from './portalNavigation';

export function Sidebar() {
    const location = useLocation();
    const { userRecord, signOut } = useAuth();
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
    const [flyoutTop, setFlyoutTop] = useState(0);
    const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
    const flyoutCloseTimer = useRef<number | null>(null);
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
    const profileName = userRecord?.full_name || userRecord?.email || 'Admin';
    const profileAvatarUrl = getCachedAvatarUrl(userRecord?.profile_image_url, { size: 96, quality: 70 });

    const activeGroup = useMemo(() => adminNavigation.find((entry) => (
        isNavGroup(entry) && entry.children.some((child) => pathIsActive(location.pathname, child.href))
    )), [location.pathname]);

    useEffect(() => {
        if (activeGroup && !expandedGroups.includes(activeGroup.name)) {
            setExpandedGroups((current) => [...current, activeGroup.name]);
        }
    }, [activeGroup, expandedGroups]);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(isCollapsed));
        window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed } }));
        if (!isCollapsed) setFlyoutGroup(null);
    }, [isCollapsed]);

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setFlyoutGroup(null);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, []);

    useEffect(() => () => {
        if (flyoutCloseTimer.current !== null) window.clearTimeout(flyoutCloseTimer.current);
    }, []);

    const openFlyout = useCallback((group: PortalNavGroup, element: HTMLElement) => {
        if (flyoutCloseTimer.current !== null) window.clearTimeout(flyoutCloseTimer.current);
        const rect = element.getBoundingClientRect();
        setFlyoutTop(Math.max(12, Math.min(rect.top, window.innerHeight - 280)));
        setFlyoutGroup(group.name);
    }, []);

    const scheduleFlyoutClose = useCallback(() => {
        flyoutCloseTimer.current = window.setTimeout(() => setFlyoutGroup(null), 180);
    }, []);

    const cancelFlyoutClose = useCallback(() => {
        if (flyoutCloseTimer.current !== null) window.clearTimeout(flyoutCloseTimer.current);
    }, []);

    const toggleGroup = (name: string) => {
        setExpandedGroups((current) => current.includes(name)
            ? current.filter((group) => group !== name)
            : [...current, name]);
    };

    return (
        <>
            <aside
                aria-label="Admin navigation"
                className={cn(
                    'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-shell)] transition-[width] duration-200',
                    isCollapsed ? 'w-[72px]' : 'w-64'
                )}
            >
                <div className={cn('flex h-16 shrink-0 items-center', isCollapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
                    <NavLink to="/admin" aria-label="Raven POS dashboard" className="flex min-w-0 items-center gap-3">
                        {isCollapsed ? (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] font-semibold text-[var(--color-primary-foreground)]">R</span>
                        ) : (
                            <img src="/ravenpos_logo.svg" alt="Raven POS" className="sidebar-logo-image h-auto max-h-10 w-32" />
                        )}
                    </NavLink>
                </div>

                {!isCollapsed && (
                    <div className="border-b border-[var(--color-border)] px-3 py-3">
                        <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-2.5">
                            {profileAvatarUrl ? (
                                <img src={profileAvatarUrl} alt="" className="h-9 w-9 rounded-full border border-[var(--color-border)] object-cover" />
                            ) : (
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">
                                    {getInitials(profileName)}
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">Admin</p>
                                <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{profileName}</p>
                            </div>
                        </div>
                    </div>
                )}

                <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                    {adminNavigation.map((entry) => {
                        const Icon = entry.icon;
                        if (!isNavGroup(entry)) {
                            const active = pathIsActive(location.pathname, entry.href);
                            return (
                                <NavLink
                                    key={entry.href}
                                    to={entry.href}
                                    aria-current={active ? 'page' : undefined}
                                    title={isCollapsed ? entry.name : undefined}
                                    className={cn(
                                        'group flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors',
                                        isCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                                        active
                                            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                            : entry.emphasis === 'primary'
                                                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15'
                                                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                    )}
                                >
                                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                                    {!isCollapsed && <span>{entry.name}</span>}
                                </NavLink>
                            );
                        }

                        const groupActive = entry.children.some((child) => pathIsActive(location.pathname, child.href));
                        const expanded = expandedGroups.includes(entry.name);

                        if (isCollapsed) {
                            return (
                                <button
                                    key={entry.name}
                                    type="button"
                                    aria-label={entry.name}
                                    aria-haspopup="menu"
                                    aria-expanded={flyoutGroup === entry.name}
                                    title={entry.name}
                                    onMouseEnter={(event) => openFlyout(entry, event.currentTarget)}
                                    onMouseLeave={scheduleFlyoutClose}
                                    onFocus={(event) => openFlyout(entry, event.currentTarget)}
                                    onClick={(event) => flyoutGroup === entry.name ? setFlyoutGroup(null) : openFlyout(entry, event.currentTarget)}
                                    className={cn(
                                        'flex min-h-11 w-full items-center justify-center rounded-lg px-2 transition-colors',
                                        groupActive || flyoutGroup === entry.name
                                            ? 'bg-[var(--color-surface)] text-[var(--color-primary)]'
                                            : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                    )}
                                >
                                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                                </button>
                            );
                        }

                        return (
                            <div key={entry.name}>
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(entry.name)}
                                    aria-expanded={expanded}
                                    className={cn(
                                        'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                                        groupActive || expanded
                                            ? 'bg-[var(--color-surface)] text-[var(--color-foreground)]'
                                            : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                    )}
                                >
                                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                                    <span className="flex-1 text-left">{entry.name}</span>
                                    <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                                </button>
                                {expanded && (
                                    <div className="ml-4 mt-1 space-y-1 border-l border-[var(--color-border)] pl-2">
                                        {entry.children.map((child) => {
                                            const childActive = pathIsActive(location.pathname, child.href);
                                            const ChildIcon = child.icon;
                                            return (
                                                <NavLink
                                                    key={child.href}
                                                    to={child.href}
                                                    aria-current={childActive ? 'page' : undefined}
                                                    className={cn(
                                                        'flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                                                        childActive
                                                            ? 'bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                                                            : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                                    )}
                                                >
                                                    <ChildIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                                    <span>{child.name}</span>
                                                </NavLink>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="shrink-0 space-y-1 border-t border-[var(--color-border)] p-2">
                    <button
                        type="button"
                        onClick={() => setIsCollapsed((value) => !value)}
                        className={cn('flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')}
                        aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                    >
                        {isCollapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
                        {!isCollapsed && 'Collapse navigation'}
                    </button>
                    {isElectron && (
                        <button
                            type="button"
                            onClick={() => setIsPrinterSettingsOpen(true)}
                            className={cn('flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')}
                            title={isCollapsed ? 'Printer settings' : undefined}
                        >
                            <Printer className="h-[18px] w-[18px]" aria-hidden="true" />
                            {!isCollapsed && 'Printer settings'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsChangelogOpen(true)}
                        className={cn('flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')}
                        title={isCollapsed ? "What's new" : undefined}
                    >
                        <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
                        {!isCollapsed && "What's new"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void signOut()}
                        className={cn('flex min-h-10 w-full items-center rounded-lg text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')}
                        title={isCollapsed ? 'Sign out' : undefined}
                    >
                        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                        {!isCollapsed && 'Sign out'}
                    </button>
                </div>
            </aside>

            {isCollapsed && flyoutGroup && (() => {
                const group = adminNavigation.find((entry) => isNavGroup(entry) && entry.name === flyoutGroup);
                if (!group || !isNavGroup(group)) return null;
                return (
                    <div
                        role="menu"
                        aria-label={group.name}
                        onMouseEnter={cancelFlyoutClose}
                        onMouseLeave={scheduleFlyoutClose}
                        className="fixed left-[80px] z-[60] min-w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 shadow-lg"
                        style={{ top: flyoutTop }}
                    >
                        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{group.name}</p>
                        {group.children.map((child) => {
                            const Icon = child.icon;
                            return (
                                <NavLink
                                    role="menuitem"
                                    key={child.href}
                                    to={child.href}
                                    onClick={() => setFlyoutGroup(null)}
                                    className={({ isActive }) => cn(
                                        'flex min-h-10 items-center gap-3 rounded-md px-2.5 text-sm transition-colors',
                                        isActive ? 'bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]' : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                    )}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {child.name}
                                </NavLink>
                            );
                        })}
                    </div>
                );
            })()}

            <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
            <PrinterSettings isOpen={isPrinterSettingsOpen} onClose={() => setIsPrinterSettingsOpen(false)} />
        </>
    );
}

function getInitials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'A';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}
