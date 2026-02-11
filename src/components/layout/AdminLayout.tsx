import { type ReactNode, useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';
import { cn } from '../../lib/utils';

interface AdminLayoutProps {
    children?: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
    const { isMobile } = useMobile();
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
                isMobile ? 'mobile-content-padding' : (isSidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'),
                'transition-all duration-300 ease-in-out'
            )}>
                <div className={cn(
                    'px-4 py-6 sm:px-6',
                    !isMobile && 'lg:px-8'
                )}>
                    {children || <Outlet />}
                </div>
            </main>

            {/* Mobile Bottom Nav - hidden on desktop */}
            {isMobile && <MobileBottomNav variant="admin" />}
        </div>
    );
}
