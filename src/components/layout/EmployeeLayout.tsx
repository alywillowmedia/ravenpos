import { Outlet, Navigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { EmployeeSidebar } from './EmployeeSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';
import { cn } from '../../lib/utils';

export function EmployeeLayout() {
    const { employee, isLoading } = useEmployee();
    const { isMobile } = useMobile();

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

            <main className={cn(
                isMobile ? 'mobile-content-padding' : 'lg:pl-64'
            )}>
                <div className={cn(
                    'px-4 py-6 sm:px-6',
                    !isMobile && 'lg:px-8'
                )}>
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Nav - hidden on desktop */}
            {isMobile && <MobileBottomNav variant="employee" />}
        </div>
    );
}
