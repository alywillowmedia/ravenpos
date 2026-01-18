import { type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

interface AdminLayoutProps {
    children?: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            <Sidebar />
            <main className="lg:pl-64">
                <div className="px-4 py-6 sm:px-6 lg:px-8">
                    {children || <Outlet />}
                </div>
            </main>
        </div>
    );
}
