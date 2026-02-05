import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { MobileMoreSheet } from './MobileMoreSheet';

interface MobileBottomNavProps {
    variant: 'admin' | 'employee';
}

// Admin navigation items for bottom nav
const adminNavItems = [
    { name: 'POS', href: '/admin/pos', icon: RegisterIcon },
    { name: 'Items', href: '/admin/inventory', icon: PackageIcon },
    { name: 'Customers', href: '/admin/customers', icon: UsersIcon },
    { name: 'Sales', href: '/admin/sales', icon: ReceiptIcon },
    { name: 'More', href: null, icon: MenuIcon, isMenu: true },
];

// Employee navigation items for bottom nav
const employeeNavItems = [
    { name: 'POS', href: '/employee/pos', icon: RegisterIcon },
    { name: 'Customers', href: '/employee/customers', icon: UsersIcon },
    { name: 'Labels', href: '/employee/labels', icon: TagIcon },
    { name: 'More', href: null, icon: MenuIcon, isMenu: true },
];

export function MobileBottomNav({ variant }: MobileBottomNavProps) {
    const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
    const location = useLocation();

    const navItems = variant === 'admin' ? adminNavItems : employeeNavItems;

    const handleNavClick = (item: typeof navItems[0]) => {
        if (item.isMenu) {
            setIsMoreSheetOpen(true);
        }
    };

    return (
        <>
            <nav className="mobile-bottom-nav mobile-only">
                <div className="flex items-center justify-around h-[49px] safe-area-horizontal">
                    {navItems.map((item) => {
                        const isActive = item.href ? location.pathname === item.href : false;
                        const Icon = item.icon;

                        if (item.isMenu) {
                            return (
                                <button
                                    key={item.name}
                                    onClick={() => handleNavClick(item)}
                                    className={cn(
                                        'flex flex-col items-center justify-center w-full h-full',
                                        'text-[10px] font-medium transition-colors duration-150',
                                        'touch-manipulation tap-highlight-none select-none-touch',
                                        'text-[var(--color-muted)]'
                                    )}
                                >
                                    <Icon />
                                    <span className="mt-1">{item.name}</span>
                                </button>
                            );
                        }

                        return (
                            <NavLink
                                key={item.name}
                                to={item.href!}
                                className={cn(
                                    'flex flex-col items-center justify-center w-full h-full',
                                    'text-[10px] font-medium transition-colors duration-150',
                                    'touch-manipulation tap-highlight-none select-none-touch',
                                    isActive
                                        ? 'text-[var(--color-primary)]'
                                        : 'text-[var(--color-muted)]'
                                )}
                            >
                                <div className={cn(
                                    'p-1 rounded-lg transition-all duration-150',
                                    isActive && 'bg-[var(--color-primary)]/10 scale-110'
                                )}>
                                    <Icon isActive={isActive} />
                                </div>
                                <span className="mt-0.5">{item.name}</span>
                            </NavLink>
                        );
                    })}
                </div>
            </nav>

            <MobileMoreSheet
                isOpen={isMoreSheetOpen}
                onClose={() => setIsMoreSheetOpen(false)}
                variant={variant}
            />
        </>
    );
}

// Icons - Optimized for mobile with larger touch areas
interface IconProps {
    isActive?: boolean;
}

function RegisterIcon({ isActive }: IconProps) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={isActive ? "2.5" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
        </svg>
    );
}

function PackageIcon({ isActive }: IconProps) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={isActive ? "2.5" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
        </svg>
    );
}

function UsersIcon({ isActive }: IconProps) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={isActive ? "2.5" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function ReceiptIcon({ isActive }: IconProps) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={isActive ? "2.5" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

function MenuIcon() {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
        </svg>
    );
}

function TagIcon({ isActive }: IconProps) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={isActive ? "2.5" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
        </svg>
    );
}
