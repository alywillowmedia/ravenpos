import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Command, Moon, Search, Sun } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { useMessaging } from '../../hooks/useMessaging';
import { getActiveTheme, setTheme, type ThemeMode } from '../../lib/theme';
import { cn } from '../../lib/utils';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import {
    adminNavigation,
    employeeNavigation,
    isNavGroup,
    pathIsActive,
    vendorNavigation,
    type PortalNavEntry,
    type PortalNavItem,
} from './portalNavigation';

type MessagingController = ReturnType<typeof useMessaging>;

interface PortalTopBarProps {
    messaging: MessagingController;
    portalBasePath: '/admin' | '/vendor' | '/employee';
}

function flattenNavigation(entries: PortalNavEntry[]): PortalNavItem[] {
    return entries.flatMap((entry) => isNavGroup(entry) ? entry.children : [entry]);
}

export function PortalTopBar({ messaging, portalBasePath }: PortalTopBarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState('');
    const [theme, setThemeState] = useState<ThemeMode>(() => getActiveTheme());
    const notificationPanelRef = useRef<HTMLDivElement | null>(null);

    const navigation = useMemo(() => {
        if (portalBasePath === '/admin') return flattenNavigation(adminNavigation);
        if (portalBasePath === '/vendor') return vendorNavigation;
        return employeeNavigation;
    }, [portalBasePath]);

    const currentPage = navigation.find((item) => pathIsActive(location.pathname, item.href));
    const filteredDestinations = navigation.filter((item) => {
        const query = commandQuery.trim().toLowerCase();
        if (!query) return true;
        return `${item.name} ${item.description || ''}`.toLowerCase().includes(query);
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationPanelRef.current && !notificationPanelRef.current.contains(event.target as Node)) {
                setNotificationsOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !isTyping) {
                event.preventDefault();
                setCommandOpen(true);
            }
            if (event.key === 'Escape') setNotificationsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const toggleTheme = () => {
        const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
        setThemeState(nextTheme);
    };

    const goTo = (href: string) => {
        setCommandOpen(false);
        setCommandQuery('');
        navigate(href);
    };

    return (
        <>
            <header className="sticky top-0 z-30 h-16 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]/96 backdrop-blur">
                <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-7">
                    <div className="min-w-0">
                        <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                            {messaging.actorRoleLabel}
                        </p>
                        <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                            {currentPage?.name || 'Raven POS'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCommandOpen(true)}
                            className="hidden h-10 min-w-56 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-left text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-foreground)] md:flex"
                            aria-label="Go to a page"
                        >
                            <Search className="h-4 w-4" aria-hidden="true" />
                            <span className="flex-1">Go to…</span>
                            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-1.5 py-0.5 text-[11px]">⌘K</kbd>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCommandOpen(true)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] hover:bg-[var(--color-surface)] md:hidden"
                            aria-label="Go to a page"
                        >
                            <Search className="h-[18px] w-[18px]" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface)]"
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                        >
                            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                        </button>

                        <div ref={notificationPanelRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setNotificationsOpen((open) => !open)}
                                className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface)]"
                                aria-label="Message notifications"
                                aria-expanded={notificationsOpen}
                            >
                                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                                {messaging.unreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                                        {messaging.unreadCount > 99 ? '99+' : messaging.unreadCount}
                                    </span>
                                )}
                            </button>

                            {notificationsOpen && (
                                <section aria-label="Unread message notifications" className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 shadow-lg">
                                    <div className="flex items-center justify-between px-2 py-1.5">
                                        <p className="text-sm font-semibold text-[var(--color-foreground)]">Unread messages</p>
                                        <span className="text-xs text-[var(--color-muted)]">{messaging.unreadCount}</span>
                                    </div>
                                    {messaging.unreadThreads.length === 0 ? (
                                        <p className="px-2 py-4 text-sm text-[var(--color-muted)]">You’re all caught up.</p>
                                    ) : (
                                        <div className="max-h-80 space-y-1 overflow-y-auto">
                                            {messaging.unreadThreads.slice(0, 8).map((thread) => (
                                                <button
                                                    key={thread.thread.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setNotificationsOpen(false);
                                                        messaging.openThreadFromNotification(thread.thread.id);
                                                    }}
                                                    className="min-h-11 w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-surface)]"
                                                >
                                                    <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{thread.title}</p>
                                                    <p className="truncate text-xs text-[var(--color-muted)]">{thread.lastMessagePreview || 'New message'}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="mt-1 border-t border-[var(--color-border)] px-2 pt-2">
                                        <Link to={`${portalBasePath}/messages`} onClick={() => setNotificationsOpen(false)} className="inline-flex min-h-10 items-center text-sm font-medium text-[var(--color-primary)] hover:underline">
                                            Open messages
                                        </Link>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <div className="pointer-events-none fixed left-4 right-4 top-20 z-50 flex max-w-sm flex-col gap-2 sm:left-auto sm:w-full">
                {messaging.toasts.map((toast) => (
                    <button
                        key={toast.id}
                        type="button"
                        onClick={() => messaging.openThreadFromNotification(toast.threadId)}
                        className={cn(
                            'pointer-events-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3 text-left shadow-lg',
                            'transition-colors hover:bg-[var(--color-surface)]'
                        )}
                    >
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">New message</p>
                        <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{toast.title}</p>
                        <p className="mt-1 truncate text-sm text-[var(--color-foreground)]">{toast.message}</p>
                    </button>
                ))}
            </div>

            <Modal
                isOpen={commandOpen}
                onClose={() => {
                    setCommandOpen(false);
                    setCommandQuery('');
                }}
                title="Go to"
                description="Find a Raven POS workspace."
                size="md"
                showCloseButton
            >
                <div className="space-y-3">
                    <Input
                        type="search"
                        label="Search destinations"
                        value={commandQuery}
                        onChange={(event) => setCommandQuery(event.target.value)}
                        placeholder="Inventory, payouts, messages…"
                        leftIcon={<Command className="h-4 w-4" aria-hidden="true" />}
                        autoFocus
                    />
                    <div className="max-h-[50vh] space-y-1 overflow-y-auto" role="list">
                        {filteredDestinations.length === 0 ? (
                            <p className="rounded-lg bg-[var(--color-surface)] px-3 py-5 text-center text-sm text-[var(--color-muted)]">No matching workspace.</p>
                        ) : filteredDestinations.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.href}
                                    type="button"
                                    role="listitem"
                                    onClick={() => goTo(item.href)}
                                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                                >
                                    <Icon className="h-[18px] w-[18px] text-[var(--color-muted)]" aria-hidden="true" />
                                    <span className="flex-1 font-medium">{item.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Modal>
        </>
    );
}
