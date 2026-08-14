import { useEffect, useState } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMessaging } from '../../hooks/useMessaging';
import { useMobile } from '../../hooks/useMobile';
import { getCachedAvatarUrl } from '../../lib/avatar';
import { cn } from '../../lib/utils';
import { MobileBottomNav } from './MobileBottomNav';
import { PortalTopBar } from './PortalTopBar';
import { pathIsActive, vendorNavigation } from './portalNavigation';

export function VendorLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isMobile } = useMobile();
    const { userRecord, portalChoices, setActivePortal, signOut } = useAuth();
    const messaging = useMessaging({ portalBasePath: '/vendor' });
    const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed-vendor') === 'true');
    const profileName = userRecord?.full_name || userRecord?.email || 'Vendor';
    const profileAvatarUrl = getCachedAvatarUrl(userRecord?.profile_image_url, { size: 96, quality: 70 });

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed-vendor', String(isCollapsed));
    }, [isCollapsed]);

    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            {!isMobile && (
                <aside aria-label="Vendor navigation" className={cn(
                    'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-shell)] transition-[width] duration-200',
                    isCollapsed ? 'w-[72px]' : 'w-64'
                )}>
                    <div className={cn('flex h-16 items-center', isCollapsed ? 'justify-center px-2' : 'px-4')}>
                        {isCollapsed ? (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] font-semibold text-[var(--color-primary-foreground)]">R</span>
                        ) : (
                            <img src="/ravenpos_logo.svg" alt="Raven POS" className="sidebar-logo-image h-auto max-h-10 w-32" />
                        )}
                    </div>

                    {!isCollapsed && (
                        <div className="border-b border-[var(--color-border)] px-3 py-3">
                            <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-2.5">
                                {profileAvatarUrl ? (
                                    <img src={profileAvatarUrl} alt="" className="h-9 w-9 rounded-full border border-[var(--color-border)] object-cover" />
                                ) : (
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">{getInitials(profileName)}</span>
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">Vendor</p>
                                    <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{profileName}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                        {vendorNavigation.map((item) => {
                            const active = pathIsActive(location.pathname, item.href);
                            const Icon = item.icon;
                            return (
                                <NavLink key={item.href} to={item.href} aria-current={active ? 'page' : undefined} title={isCollapsed ? item.name : undefined} className={cn(
                                    'flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors',
                                    isCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                                    active ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                                )}>
                                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                                    {!isCollapsed && item.name}
                                </NavLink>
                            );
                        })}
                    </nav>

                    <div className="shrink-0 space-y-1 border-t border-[var(--color-border)] p-2">
                        <button type="button" onClick={() => setIsCollapsed((value) => !value)} className={cn('flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')} aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
                            {isCollapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
                            {!isCollapsed && 'Collapse navigation'}
                        </button>
                        {portalChoices.length > 1 && (
                            <button type="button" onClick={() => { setActivePortal(null); navigate('/portal-select'); }} className={cn('flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')} title={isCollapsed ? 'Switch portal' : undefined}>
                                <ArrowLeftRight className="h-[18px] w-[18px]" aria-hidden="true" />
                                {!isCollapsed && 'Switch portal'}
                            </button>
                        )}
                        <button type="button" onClick={() => void signOut()} className={cn('flex min-h-10 w-full items-center rounded-lg text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')} title={isCollapsed ? 'Sign out' : undefined}>
                            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                            {!isCollapsed && 'Sign out'}
                        </button>
                    </div>
                </aside>
            )}

            <main className={cn(
                isMobile ? 'mobile-content-padding' : isCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64',
                'min-h-screen bg-[var(--color-surface)] transition-[padding] duration-200 ease-out'
            )}>
                <PortalTopBar messaging={messaging} portalBasePath="/vendor" />
                <div className="bg-[var(--color-surface)] px-4 py-5 sm:px-6 lg:px-7">
                    <Outlet key={location.pathname} context={{ messaging }} />
                </div>
            </main>

            {isMobile && <MobileBottomNav variant="vendor" />}
        </div>
    );
}

function getInitials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'V';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}
