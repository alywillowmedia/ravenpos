import { type ReactNode, useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';
import { cn } from '../../lib/utils';
import { PortalTopBar } from './PortalTopBar';
import { useMessaging } from '../../hooks/useMessaging';

interface AdminLayoutProps {
    children?: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
    const { isMobile } = useMobile();
    const messaging = useMessaging({ portalBasePath: '/admin' });
    const location = useLocation();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });

    useEffect(() => {
        const handleSidebarToggle = (event: CustomEvent) => {
            setIsSidebarCollapsed(event.detail.isCollapsed);
        };

        window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
        return () => {
            window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
        };
    }, []);

    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            {/* Desktop Sidebar - hidden on mobile */}
            {!isMobile && <Sidebar />}
            <main className={cn(
                isMobile ? 'mobile-content-padding' : (isSidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'),
                'min-h-screen bg-[var(--color-surface)] transition-[padding] duration-200 ease-out'
            )}>
                <PortalTopBar messaging={messaging} portalBasePath="/admin" />
                <div
                    className={cn(
                        'bg-[var(--color-surface)] px-4 py-5 sm:px-6 lg:px-7'
                    )}
                >
                    {children || <Outlet key={location.pathname} context={{ messaging }} />}
                </div>
            </main>

            {/* Mobile Bottom Nav - hidden on desktop */}
            {isMobile && <MobileBottomNav variant="admin" />}
        </div>
    );
}
