import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { getActiveTheme, setTheme, type ThemeMode } from '../../lib/theme';
import type { useMessaging } from '../../hooks/useMessaging';

type MessagingController = ReturnType<typeof useMessaging>;

interface PortalTopBarProps {
    messaging: MessagingController;
    portalBasePath: '/admin' | '/vendor' | '/employee';
}

export function PortalTopBar({ messaging, portalBasePath }: PortalTopBarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [theme, setThemeState] = useState<ThemeMode>(() => getActiveTheme());
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!panelRef.current) return;
            if (!panelRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleTheme = () => {
        const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
        setThemeState(nextTheme);
    };

    return (
        <>
            <div className="h-14 bg-[var(--color-surface-elevated)] backdrop-blur">
                <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{messaging.actorRoleLabel}</p>
                        <p className="text-sm font-medium text-[var(--color-foreground)]">Team Messaging</p>
                    </div>

                    <div ref={panelRef} className="relative flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface)]"
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                        >
                            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsOpen((prev) => !prev)}
                            className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface)]"
                            aria-label="Open message notifications"
                        >
                            <BellIcon />
                            {messaging.unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                                    {messaging.unreadCount > 99 ? '99+' : messaging.unreadCount}
                                </span>
                            )}
                        </button>

                        {isOpen && (
                            <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-lg">
                                <div className="px-2 py-1.5">
                                    <p className="text-sm font-semibold text-[var(--color-foreground)]">Unread messages</p>
                                </div>

                                {messaging.unreadThreads.length === 0 ? (
                                    <p className="px-2 py-3 text-sm text-[var(--color-muted)]">No unread messages.</p>
                                ) : (
                                    <div className="max-h-80 space-y-1 overflow-y-auto">
                                        {messaging.unreadThreads.slice(0, 8).map((thread) => (
                                            <button
                                                key={thread.thread.id}
                                                type="button"
                                                onClick={() => {
                                                    setIsOpen(false);
                                                    messaging.openThreadFromNotification(thread.thread.id);
                                                }}
                                                className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--color-surface)]"
                                            >
                                                <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{thread.title}</p>
                                                <p className="truncate text-xs text-[var(--color-muted)]">{thread.lastMessagePreview || 'New message'}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="border-t border-[var(--color-border)] px-2 pt-2">
                                    <Link
                                        to={`${portalBasePath}/messages`}
                                        onClick={() => setIsOpen(false)}
                                        className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                                    >
                                        Open messages
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
                {messaging.toasts.map((toast) => (
                    <button
                        key={toast.id}
                        type="button"
                        onClick={() => messaging.openThreadFromNotification(toast.threadId)}
                        className={cn(
                            'pointer-events-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-left shadow-lg',
                            'transition hover:bg-[var(--color-surface)]'
                        )}
                    >
                        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">New message</p>
                        <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{toast.title}</p>
                        <p className="truncate text-xs text-[var(--color-muted)]">{toast.sender}</p>
                        <p className="mt-1 truncate text-sm text-[var(--color-foreground)]">{toast.message}</p>
                    </button>
                ))}
            </div>
        </>
    );
}

function BellIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
            <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
    );
}

function SunIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a7.5 7.5 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
    );
}
