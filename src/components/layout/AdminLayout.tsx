import { type ReactNode } from 'react';
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

    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            {/* Desktop Sidebar - hidden on mobile */}
            {!isMobile && <Sidebar />}

            <main className={cn(
                isMobile ? 'mobile-content-padding' : 'lg:pl-64'
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
