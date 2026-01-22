import { useState } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

const navigation = [
    { name: 'Dashboard', href: '/vendor', icon: DashboardIcon },
    { name: 'My Inventory', href: '/vendor/inventory', icon: PackageIcon },
    { name: 'My Sales', href: '/vendor/sales', icon: ReceiptIcon },
    { name: 'My Payouts', href: '/vendor/payouts', icon: PayoutsIcon },
    { name: 'Profile', href: '/vendor/profile', icon: UserIcon },
];

export function VendorLayout() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const location = useLocation();
    const { userRecord, signOut } = useAuth();

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            {/* Mobile menu button */}
            <div className="lg:hidden fixed top-4 left-4 z-50">
                <button
                    onClick={() => setIsMobileOpen(!isMobileOpen)}
                    className="p-2 rounded-lg bg-white shadow-md border border-[var(--color-border)] text-[var(--color-foreground)]"
                    aria-label="Toggle menu"
                >
                    <MenuIcon />
                </button>
            </div>

            {/* Mobile overlay */}
            {isMobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/50"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 w-64',
                    'bg-white border-r border-[var(--color-border)]',
                    'transform transition-transform duration-200 ease-out',
                    'lg:translate-x-0 flex flex-col',
                    isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                {/* Logo */}
                <div className="flex items-center justify-center h-20 px-4 py-4 border-b border-[var(--color-border)]">
                    <img
                        src="./ravenpos_logo.svg"
                        alt="RavenPOS"
                        className="w-35 h-auto max-h-18"
                    />
                </div>

                {/* User Info */}
                <div className="px-4 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Vendor Portal</p>
                    <p className="font-medium text-[var(--color-foreground)] truncate">
                        {userRecord?.email}
                    </p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                onClick={() => setIsMobileOpen(false)}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                                    'text-sm font-medium transition-all duration-150',
                                    isActive
                                        ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                )}
                            >
                                <item.icon />
                                {item.name}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Bottom section */}
                <div className="p-4 border-t border-[var(--color-border)]">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                    >
                        <LogoutIcon />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="lg:pl-64">
                <div className="px-4 py-6 sm:px-6 lg:px-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

// Icons
function MenuIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
    );
}

function DashboardIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    );
}

function PackageIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
        </svg>
    );
}

function ReceiptIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

function UserIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 1 0-16 0" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

function PayoutsIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    );
}
