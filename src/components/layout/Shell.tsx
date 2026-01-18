import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface ShellProps {
    children: ReactNode;
}

export function Shell({ children }: ShellProps) {
    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            <Sidebar />
            <main className="lg:pl-64">
                <div className="px-4 py-6 sm:px-6 lg:px-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
