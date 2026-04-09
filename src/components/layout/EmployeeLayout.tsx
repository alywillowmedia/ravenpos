import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { EmployeeSidebar } from './EmployeeSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { PortalTopBar } from './PortalTopBar';
import { useMessaging } from '../../hooks/useMessaging';

export function EmployeeLayout() {
    const { employee, isLoading } = useEmployee();
    const { isMobile } = useMobile();
    const messaging = useMessaging({ portalBasePath: '/employee' });
    const location = useLocation();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed-employee');
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

    // Show loading while checking session
    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
                <div className="text-[var(--color-muted)]">Loading...</div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!employee) {
        return <Navigate to="/employee/login" replace />;
    }

    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            {/* Desktop Sidebar - hidden on mobile */}
            {!isMobile && <EmployeeSidebar />}
            {!isMobile && (
                <div
                    aria-hidden="true"
                    className={cn(
                        'pointer-events-none fixed top-14 z-[35] h-6 w-6 rounded-tl-3xl bg-[var(--color-surface)]',
                        isSidebarCollapsed ? 'left-16' : 'left-64'
                    )}
                />
            )}

            <main className={cn(
                isMobile ? 'mobile-content-padding' : (isSidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'),
                'bg-[var(--color-surface-elevated)] transition-all duration-300 ease-in-out'
            )}>
                <PortalTopBar messaging={messaging} portalBasePath="/employee" />
                <div className={cn(
                    'bg-[var(--color-surface)] px-4 py-6 sm:px-6',
                    !isMobile && 'lg:rounded-tl-3xl lg:px-8'
                )}>
                    <Outlet key={location.pathname} context={{ messaging }} />
                </div>
            </main>

            {/* Mobile Bottom Nav - hidden on desktop */}
            {isMobile && <MobileBottomNav variant="employee" />}
        </div>
    );
}
