import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import {
    getActiveHref,
    isNavGroup,
    shouldCloseFlyoutOnClick,
    type PortalNavEntry,
    type PortalNavGroup,
    type PortalNavItem,
} from './portalNavigation';

export interface ProfileMenuAction {
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    tone?: 'danger';
}

export interface PortalProfile {
    name: string;
    roleLabel: string;
    avatarUrl: string | null;
}

interface PortalSidebarProps {
    homeHref: string;
    navigation: PortalNavEntry[];
    profile: PortalProfile;
    menuActions: ProfileMenuAction[];
    footerSlot?: ReactNode;
    isCollapsed: boolean;
    canToggle: boolean;
    onToggle: () => void;
}

const menuRowStyles = 'flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors';

export function PortalSidebar({
    homeHref,
    navigation,
    profile,
    menuActions,
    footerSlot,
    isCollapsed,
    canToggle,
    onToggle,
}: PortalSidebarProps) {
    const location = useLocation();
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
    const [flyoutTop, setFlyoutTop] = useState(0);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const flyoutCloseTimer = useRef<number | null>(null);
    const pressOpenedFlyout = useRef(false);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);

    const activeHref = getActiveHref(location.pathname, navigation);
    const primaryItem = navigation.find((entry): entry is PortalNavItem => !isNavGroup(entry) && entry.emphasis === 'primary');
    const footerItems = navigation.filter((entry): entry is PortalNavItem => !isNavGroup(entry) && entry.placement === 'footer');
    const listEntries = navigation.filter((entry) => isNavGroup(entry) || (entry.emphasis !== 'primary' && entry.placement !== 'footer'));
    const activeGroupName = useMemo(() => navigation.find((entry) => (
        isNavGroup(entry) && entry.children.some((child) => child.href === activeHref)
    ))?.name, [activeHref, navigation]);

    useEffect(() => {
        if (!activeGroupName) return;
        setExpandedGroups((current) => current.includes(activeGroupName) ? current : [...current, activeGroupName]);
    }, [activeGroupName]);

    useEffect(() => {
        if (!isCollapsed) setFlyoutGroup(null);
    }, [isCollapsed]);

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setFlyoutGroup(null);
            setIsProfileMenuOpen(false);
        };
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            if (!(event.target as Element).closest('[data-sidebar-flyout]')) setFlyoutGroup(null);
        };
        document.addEventListener('keydown', closeOnEscape);
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => {
            document.removeEventListener('keydown', closeOnEscape);
            document.removeEventListener('mousedown', closeOnOutsideClick);
        };
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
        <aside
            aria-label="Main navigation"
            className={cn(
                'fixed bottom-3 left-3 top-3 z-40 flex flex-col rounded-2xl bg-[var(--color-card)] shadow-[var(--shadow-surface)] transition-[width] duration-200',
                isCollapsed ? 'w-[76px]' : 'w-[248px]'
            )}
        >
            <div className={cn('flex h-16 shrink-0 items-center', isCollapsed ? 'justify-center px-2' : 'px-4')}>
                <Link to={homeHref} aria-label="Raven POS home" className="flex min-w-0 items-center">
                    {isCollapsed ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-foreground)] font-bold text-[var(--color-card)]">R</span>
                    ) : (
                        <img src="/ravenpos_logo.svg" alt="Raven POS" className="sidebar-logo-image h-auto max-h-10 w-32" />
                    )}
                </Link>
            </div>

            {primaryItem && (
                <div className="shrink-0 px-3 pb-3">
                    <Link
                        to={primaryItem.href}
                        aria-label="Open register"
                        title={isCollapsed ? 'Open register' : undefined}
                        className={cn(
                            'flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                            isCollapsed && activeHref === primaryItem.href
                                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                                : 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)]'
                        )}
                    >
                        <primaryItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        {!isCollapsed && 'Open register'}
                    </Link>
                </div>
            )}

            <nav aria-label="Sections" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
                {listEntries.map((entry) => {
                    if (!isNavGroup(entry)) {
                        return (
                            <SidebarLink
                                key={entry.href}
                                item={entry}
                                active={entry.href === activeHref}
                                isCollapsed={isCollapsed}
                            />
                        );
                    }

                    const Icon = entry.icon;
                    const groupActive = entry.name === activeGroupName;
                    const expanded = expandedGroups.includes(entry.name);

                    if (isCollapsed) {
                        const flyoutOpen = flyoutGroup === entry.name;
                        return (
                            <div key={entry.name} data-sidebar-flyout>
                                <button
                                    type="button"
                                    aria-label={entry.name}
                                    aria-haspopup="menu"
                                    aria-expanded={flyoutOpen}
                                    title={entry.name}
                                    onPointerDown={() => {
                                        pressOpenedFlyout.current = !flyoutOpen;
                                    }}
                                    onMouseEnter={(event) => openFlyout(entry, event.currentTarget)}
                                    onMouseLeave={scheduleFlyoutClose}
                                    onFocus={(event) => openFlyout(entry, event.currentTarget)}
                                    onClick={(event) => {
                                        if (shouldCloseFlyoutOnClick(flyoutOpen, pressOpenedFlyout.current)) setFlyoutGroup(null);
                                        else openFlyout(entry, event.currentTarget);
                                        pressOpenedFlyout.current = false;
                                    }}
                                    className={cn(
                                        'flex min-h-11 w-full items-center justify-center rounded-lg border border-transparent px-2 transition-colors',
                                        groupActive || flyoutOpen
                                            ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)]'
                                            : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                    )}
                                >
                                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                                </button>
                                {flyoutOpen && (
                                    <GroupFlyout
                                        group={entry}
                                        activeHref={activeHref}
                                        top={flyoutTop}
                                        onMouseEnter={cancelFlyoutClose}
                                        onMouseLeave={scheduleFlyoutClose}
                                        onNavigate={() => setFlyoutGroup(null)}
                                    />
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={entry.name}>
                            <button
                                type="button"
                                onClick={() => toggleGroup(entry.name)}
                                aria-expanded={expanded}
                                className={cn(
                                    'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                                    groupActive
                                        ? 'font-semibold text-[var(--color-foreground)]'
                                        : 'font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                )}
                            >
                                <Icon className={cn('h-[18px] w-[18px] shrink-0', groupActive && 'text-[var(--color-primary)]')} aria-hidden="true" />
                                <span className="flex-1 text-left">{entry.name}</span>
                                <ChevronDown className={cn('h-4 w-4 text-[var(--color-muted-foreground)] transition-transform', !expanded && '-rotate-90')} aria-hidden="true" />
                            </button>
                            {expanded && (
                                <div className="mb-1.5 mt-0.5 space-y-0.5">
                                    {entry.children.map((child) => {
                                        const childActive = child.href === activeHref;
                                        return (
                                            <Link
                                                key={child.href}
                                                to={child.href}
                                                aria-current={childActive ? 'page' : undefined}
                                                className={cn(
                                                    'relative flex min-h-9 items-center rounded-[10px] pl-[42px] pr-3 text-[13.5px] transition-colors',
                                                    childActive
                                                        ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)]'
                                                        : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                                )}
                                            >
                                                {childActive && <span className="absolute left-[21px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />}
                                                {child.name}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="shrink-0 space-y-2 p-3">
                {!isCollapsed && footerSlot}
                {canToggle && (
                    <button
                        type="button"
                        onClick={onToggle}
                        className={cn(
                            'flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]',
                            isCollapsed ? 'justify-center' : 'gap-3 px-3'
                        )}
                        aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                    >
                        {isCollapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
                        {!isCollapsed && 'Collapse navigation'}
                    </button>
                )}

                <div ref={profileMenuRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setIsProfileMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={isProfileMenuOpen}
                        aria-label={`${profile.name} account menu`}
                        className={cn(
                            'flex w-full items-center gap-2.5 rounded-[14px] text-left transition-colors hover:bg-[var(--color-surface-hover)]',
                            isCollapsed ? 'justify-center p-1' : 'bg-[var(--color-surface)] p-2'
                        )}
                    >
                        {profile.avatarUrl ? (
                            <img src={profile.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
                                {getInitials(profile.name)}
                            </span>
                        )}
                        {!isCollapsed && (
                            <>
                                <span className="min-w-0 flex-1 leading-tight">
                                    <span className="block truncate text-[13.5px] font-semibold text-[var(--color-foreground)]">{profile.name}</span>
                                    <span className="block truncate text-[12.5px] text-[var(--color-muted)]">{profile.roleLabel}</span>
                                </span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden="true" />
                            </>
                        )}
                    </button>

                    {isProfileMenuOpen && (
                        <div
                            role="menu"
                            aria-label="Account"
                            className={cn(
                                'absolute z-[60] rounded-xl bg-[var(--color-surface-elevated)] p-2 shadow-lg ring-1 ring-[var(--color-border)]',
                                isCollapsed ? 'bottom-0 left-full ml-3 w-56' : 'bottom-full left-0 right-0 mb-2'
                            )}
                        >
                            {footerItems.map((item) => (
                                <Link
                                    key={item.href}
                                    role="menuitem"
                                    to={item.href}
                                    onClick={() => setIsProfileMenuOpen(false)}
                                    className={cn(menuRowStyles, 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]')}
                                >
                                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    {item.name}
                                </Link>
                            ))}
                            {menuActions.map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setIsProfileMenuOpen(false);
                                        action.onSelect();
                                    }}
                                    className={cn(
                                        menuRowStyles,
                                        action.tone === 'danger'
                                            ? 'font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]'
                                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                    )}
                                >
                                    <action.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </aside>

    );
}

interface GroupFlyoutProps {
    group: PortalNavGroup;
    activeHref: string | null;
    top: number;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onNavigate: () => void;
}

function GroupFlyout({ group, activeHref, top, onMouseEnter, onMouseLeave, onNavigate }: GroupFlyoutProps) {
    return (
        <div
            role="menu"
            aria-label={group.name}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className="fixed left-[100px] z-[60] min-w-56 rounded-xl bg-[var(--color-surface-elevated)] p-2 shadow-lg ring-1 ring-[var(--color-border)]"
            style={{ top }}
        >
            <p className="px-2.5 py-1.5 text-[13px] font-medium text-[var(--color-muted)]">{group.name}</p>
            {group.children.map((child) => (
                <Link
                    key={child.href}
                    role="menuitem"
                    to={child.href}
                    onClick={onNavigate}
                    className={cn(
                        menuRowStyles,
                        child.href === activeHref
                            ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)]'
                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                    )}
                >
                    <child.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {child.name}
                </Link>
            ))}
        </div>
    );
}

function SidebarLink({ item, active, isCollapsed }: { item: PortalNavItem; active: boolean; isCollapsed: boolean }) {
    const Icon = item.icon;

    return (
        <Link
            to={item.href}
            aria-current={active ? 'page' : undefined}
            title={isCollapsed ? item.name : undefined}
            className={cn(
                'flex min-h-10 items-center rounded-lg border border-transparent text-sm transition-colors',
                isCollapsed ? 'min-h-11 justify-center px-2' : 'gap-3 px-3',
                active
                    ? 'border-[var(--color-border)] bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)]'
                    : 'font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
            )}
        >
            <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-[var(--color-primary)]')} aria-hidden="true" />
            {!isCollapsed && item.name}
        </Link>
    );
}

function getInitials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}
