import { useEffect, useId, useMemo, useRef } from 'react';
import { Circle, CircleDot, LogOut, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployee } from '../../contexts/EmployeeContext';
import { cn } from '../../lib/utils';
import { adminNavigation, employeeNavigation, isNavGroup, vendorNavigation, type PortalNavItem } from './portalNavigation';

interface MobileMoreSheetProps {
    isOpen: boolean;
    onClose: () => void;
    variant: 'admin' | 'employee' | 'vendor';
}

interface NavigationSection {
    name: string;
    items: PortalNavItem[];
}

export function MobileMoreSheet({ isOpen, onClose, variant }: MobileMoreSheetProps) {
    const { signOut } = useAuth();
    const { logout: employeeLogout, clockStatus } = useEmployee();
    const navigate = useNavigate();
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const titleId = `${useId().replace(/:/g, '')}-mobile-nav-title`;

    const sections = useMemo<NavigationSection[]>(() => {
        if (variant === 'employee') return [{ name: 'Employee tools', items: employeeNavigation }];
        if (variant === 'vendor') return [{ name: 'Vendor tools', items: vendorNavigation }];
        return adminNavigation.map((entry) => isNavGroup(entry)
            ? { name: entry.name, items: entry.children }
            : {
                name: entry.name === 'Point of Sale' ? 'Sell' : entry.name === 'Dashboard' ? 'Overview' : 'Settings',
                items: [entry],
            });
    }, [variant]);

    useEffect(() => {
        if (!isOpen) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !sheetRef.current) return;
            const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, [isOpen, onClose]);

    const handleLogout = async () => {
        if (variant === 'admin' || variant === 'vendor') {
            await signOut();
        } else {
            await employeeLogout();
            navigate('/employee/login');
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="mobile-sheet-overlay active" onClick={onClose} aria-hidden="true" />
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="mobile-sheet open"
            >
                <div className="mobile-sheet-handle" aria-hidden="true" />
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 pb-4">
                    <div>
                        <h2 id={titleId} className="text-lg font-semibold text-[var(--color-foreground)]">All workspaces</h2>
                        {variant === 'employee' && clockStatus && (
                            <p className="mt-1 text-sm text-[var(--color-muted)]">
                                <span className="inline-flex items-center gap-1.5">
                                    {clockStatus.isClockedIn ? <CircleDot size={14} /> : <Circle size={14} />}
                                    {clockStatus.isClockedIn ? 'Clocked in' : 'Clocked out'}
                                </span>
                                {clockStatus.isClockedIn && clockStatus.startTime && (
                                    <span className="ml-2">since {new Date(clockStatus.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                )}
                            </p>
                        )}
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]" aria-label="Close navigation">
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="space-y-6 p-4">
                    {sections.map((section, sectionIndex) => (
                        <section key={`${section.name}-${sectionIndex}`}>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{section.name}</h3>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {section.items.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <NavLink
                                            key={item.href}
                                            to={item.href}
                                            onClick={onClose}
                                            className={({ isActive }) => cn(
                                                'flex min-h-16 items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium transition-colors',
                                                isActive
                                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]'
                                            )}
                                        >
                                            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                                            <span>{item.name}</span>
                                        </NavLink>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
                    <button type="button" onClick={() => void handleLogout()} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[var(--color-danger-bg)] px-4 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20">
                        <LogOut className="h-5 w-5" aria-hidden="true" />
                        Sign out
                    </button>
                </div>
            </div>
        </>
    );
}
