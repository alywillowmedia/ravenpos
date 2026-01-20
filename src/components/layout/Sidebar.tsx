import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { ChangelogModal } from './ChangelogModal';

const navigation = [
    { name: 'Dashboard', href: '/admin', icon: DashboardIcon },
    { name: 'Consignors', href: '/admin/consignors', icon: UsersIcon },
    { name: 'Customers', href: '/admin/customers', icon: CustomersIcon },
    { name: 'Employees', href: '/admin/employees', icon: EmployeesIcon },
    {
        name: 'Inventory',
        icon: PackageIcon,
        children: [
            { name: 'Items', href: '/admin/inventory', icon: PackageIcon },
            { name: 'Add Items', href: '/admin/add-items', icon: PlusIcon },
            { name: 'Import CSV', href: '/admin/import', icon: UploadIcon },
            { name: 'Integrations', href: '/admin/integrations', icon: IntegrationsIcon },
            { name: 'Labels', href: '/admin/labels', icon: TagIcon },
        ]
    },
    { name: 'Point of Sale', href: '/admin/pos', icon: RegisterIcon },
    {
        name: 'Finances',
        icon: PayoutsIcon,
        children: [
            { name: 'Sales', href: '/admin/sales', icon: ReceiptNavIcon },
            { name: 'Payouts', href: '/admin/payouts', icon: PayoutsIcon },
        ]
    },
];

export function Sidebar() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const location = useLocation();
    const { userRecord, signOut } = useAuth();

    useEffect(() => {
        // Auto-expand groups if a child is active
        const activeGroup = navigation.find(group =>
            group.children?.some(child => child.href === location.pathname)
        );
        if (activeGroup && !expandedGroups.includes(activeGroup.name)) {
            setExpandedGroups(prev => [...prev, activeGroup.name]);
        }
    }, [location.pathname]);

    const handleLogout = async () => {
        await signOut();
    };

    const toggleGroup = (name: string) => {
        setExpandedGroups(prev =>
            prev.includes(name)
                ? prev.filter(g => g !== name)
                : [...prev, name]
        );
    };

    return (
        <>
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
                        src="/ravenpos_logo.svg"
                        alt="RavenPOS"
                        className="w-35 h-auto max-h-18"
                    />
                </div>

                {/* User Info */}
                <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Admin</p>
                    <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                        {userRecord?.email}
                    </p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navigation.map((item) => {
                        if (item.children) {
                            const isExpanded = expandedGroups.includes(item.name);
                            const hasActiveChild = item.children.some(child => child.href === location.pathname);

                            return (
                                <div key={item.name} className="space-y-1">
                                    <button
                                        onClick={() => toggleGroup(item.name)}
                                        className={cn(
                                            'w-full flex items-center justify-between px-3 py-2.5 rounded-lg',
                                            'text-sm font-medium transition-all duration-150',
                                            hasActiveChild || isExpanded
                                                ? 'text-[var(--color-foreground)] bg-[var(--color-surface)]'
                                                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon />
                                            {item.name}
                                        </div>
                                        {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                                    </button>

                                    {isExpanded && (
                                        <div className="pl-4 space-y-1">
                                            {item.children.map((child) => {
                                                const isActive = location.pathname === child.href;
                                                return (
                                                    <NavLink
                                                        key={child.name}
                                                        to={child.href}
                                                        onClick={() => setIsMobileOpen(false)}
                                                        className={cn(
                                                            'flex items-center gap-3 px-3 py-2 rounded-lg',
                                                            'text-sm font-medium transition-all duration-150',
                                                            'border-l-2',
                                                            isActive
                                                                ? 'border-[var(--color-primary)] bg-[var(--color-surface)] text-[var(--color-primary)]'
                                                                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                                        )}
                                                    >
                                                        {/* <child.icon />  Optional: hide child icons for cleaner look in dropdown, or keep them? User didn't specify. Keeping generic structure but maybe icons are busy inside. Let's keep them as per requested struct. */}
                                                        {child.name}
                                                    </NavLink>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

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
                <div className="p-4 border-t border-[var(--color-border)] space-y-3">
                    <div
                        className="px-3 py-2 rounded-lg bg-[var(--color-surface)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
                        onClick={() => setIsChangelogOpen(true)}
                    >
                        <p className="text-xs text-[var(--color-muted)]">Version</p>
                        <p className="text-sm font-medium text-[var(--color-foreground)]">0.1.4.1</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                    >
                        <LogoutIcon />
                        Sign Out
                    </button>
                </div>
            </aside>

            <ChangelogModal
                isOpen={isChangelogOpen}
                onClose={() => setIsChangelogOpen(false)}
            />
        </>
    );
}

// Icons
function LogoutIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

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

function UsersIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
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

function PlusIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function UploadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
    );
}

function TagIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
        </svg>
    );
}

function RegisterIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
        </svg>
    );
}

function ReceiptNavIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
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

function CustomersIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function EmployeesIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
    );
}


function IntegrationsIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
            <path d="M22 12v4a2 2 0 0 1-2 2h-1" />
            <path d="M22 12h-4" />
        </svg>
    );
}

function ChevronDownIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

function ChevronRightIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

