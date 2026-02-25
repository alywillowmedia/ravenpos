import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { ChangelogModal } from './ChangelogModal';
import { PrinterSettings } from '../PrinterSettings';

const navigation = [
    { name: 'Dashboard', href: '/admin', icon: DashboardIcon },
    { name: 'Consignors', href: '/admin/consignors', icon: UsersIcon },
    { name: 'Customers', href: '/admin/customers', icon: CustomersIcon },
    {
        name: 'Employees',
        icon: EmployeesIcon,
        children: [
            { name: 'Timecards', href: '/admin/employees', icon: TimecardIcon },
            { name: 'Roles', href: '/admin/employees/roles', icon: ShieldIcon },
            { name: 'Schedule', href: '/admin/employees/schedule', icon: ScheduleIcon },
        ]
    },
    {
        name: 'Inventory',
        icon: PackageIcon,
        children: [
            { name: 'Items', href: '/admin/inventory', icon: ListIcon },
            { name: 'Add Items', href: '/admin/add-items', icon: PlusIcon },
            { name: 'Scan In/Out', href: '/admin/scan', icon: BarcodeIcon },
            { name: 'Import CSV', href: '/admin/import', icon: UploadIcon },
            { name: 'Integrations', href: '/admin/integrations', icon: IntegrationsIcon },
            { name: 'Labels', href: '/admin/labels', icon: TagIcon },
        ]
    },
    { name: 'Point of Sale', href: '/admin/pos', icon: RegisterIcon },
    { name: 'Messages', href: '/admin/messages', icon: MessageIcon },
    { name: 'Email Campaigns', href: '/admin/email-campaigns', icon: MailIcon },
    { name: 'Profile', href: '/admin/profile', icon: UserIcon },
    {
        name: 'Finances',
        icon: WalletIcon,
        children: [
            { name: 'Sales', href: '/admin/sales', icon: ReceiptNavIcon },
            { name: 'Invoices', href: '/admin/finances/invoices', icon: InvoiceIcon },
            { name: 'Payouts', href: '/admin/payouts', icon: PayoutsIcon },
            { name: 'Marketing Fees', href: '/admin/finances/marketing-fees', icon: MegaphoneIcon },
            { name: 'Categories & Tax', href: '/admin/finances/categories', icon: CategoryIcon },
        ]
    },
];

export function Sidebar() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const location = useLocation();
    const { userRecord, signOut } = useAuth();
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

    // Flyout state for collapsed sidebar hover menus
    const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
    const [flyoutTop, setFlyoutTop] = useState(0);
    const flyoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleGroupMouseEnter = useCallback((groupName: string, event: React.MouseEvent) => {
        if (flyoutTimeoutRef.current) {
            clearTimeout(flyoutTimeoutRef.current);
            flyoutTimeoutRef.current = null;
        }
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        setFlyoutTop(rect.top);
        setHoveredGroup(groupName);
    }, []);

    const handleGroupMouseLeave = useCallback(() => {
        flyoutTimeoutRef.current = setTimeout(() => {
            setHoveredGroup(null);
        }, 200);
    }, []);

    const handleFlyoutMouseEnter = useCallback(() => {
        if (flyoutTimeoutRef.current) {
            clearTimeout(flyoutTimeoutRef.current);
            flyoutTimeoutRef.current = null;
        }
    }, []);

    const handleFlyoutMouseLeave = useCallback(() => {
        setHoveredGroup(null);
    }, []);

    // Clean up flyout timeout on unmount
    useEffect(() => {
        return () => {
            if (flyoutTimeoutRef.current) clearTimeout(flyoutTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        // Auto-expand groups if a child is active
        const activeGroup = navigation.find(group =>
            group.children?.some(child => child.href === location.pathname)
        );
        if (activeGroup && !expandedGroups.includes(activeGroup.name)) {
            setExpandedGroups(prev => [...prev, activeGroup.name]);
        }
    }, [location.pathname]);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', isCollapsed.toString());
        // Dispatch custom event to notify layout of width change
        window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed } }));
    }, [isCollapsed]);

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

    const toggleCollapse = () => {
        setIsCollapsed(prev => !prev);
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
                    'fixed inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out',
                    isCollapsed ? 'w-16' : 'w-64',
                    'bg-white border-r border-[var(--color-border)]',
                    'transform transition-transform duration-200 ease-out',
                    'lg:translate-x-0 flex flex-col',
                    isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                {/* Logo */}
                <div className="flex items-center justify-center h-20 px-4 py-4 border-b border-[var(--color-border)]">
                    {!isCollapsed ? (
                        <img
                            src="./ravenpos_logo.svg"
                            alt="RavenPOS"
                            className="w-35 h-auto max-h-18"
                        />
                    ) : (
                        <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                            R
                        </div>
                    )}
                </div>

                {/* Collapse Toggle Button - Desktop Only */}
                <div className="hidden lg:flex items-center justify-center py-2 border-b border-[var(--color-border)]">
                    <button
                        onClick={toggleCollapse}
                        className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                    </button>
                </div>

                {/* User Info */}
                {!isCollapsed && (
                    <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                        <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Admin</p>
                        <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                            {userRecord?.full_name || 'Unnamed Admin'}
                        </p>
                        <p className="text-xs text-[var(--color-muted)] truncate">
                            {userRecord?.email}
                        </p>
                    </div>
                )}

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navigation.map((item) => {
                        if (item.children) {
                            const isExpanded = expandedGroups.includes(item.name);
                            const hasActiveChild = item.children.some(child => child.href === location.pathname);

                            if (isCollapsed) {
                                // Show icon with hover flyout when collapsed
                                return (
                                    <div
                                        key={item.name}
                                        onMouseEnter={(e) => handleGroupMouseEnter(item.name, e)}
                                        onMouseLeave={handleGroupMouseLeave}
                                        className={cn(
                                            'flex items-center justify-center p-3 rounded-lg cursor-pointer',
                                            'text-sm font-medium transition-all duration-150',
                                            hasActiveChild || hoveredGroup === item.name
                                                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        )}
                                    >
                                        <item.icon />
                                    </div>
                                );
                            }

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
                                    'flex items-center rounded-lg',
                                    'text-sm font-medium transition-all duration-150',
                                    isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
                                    isActive
                                        ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                )}
                                title={isCollapsed ? item.name : undefined}
                            >
                                <item.icon />
                                {!isCollapsed && item.name}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Bottom section */}
                <div className={cn(
                    'border-t border-[var(--color-border)] space-y-3',
                    isCollapsed ? 'p-2' : 'p-4'
                )}>
                    {isElectron && (
                        <button
                            onClick={() => setIsPrinterSettingsOpen(true)}
                            className={cn(
                                'w-full flex items-center rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] transition-colors',
                                isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
                            )}
                            title={isCollapsed ? 'Printer Settings' : undefined}
                        >
                            <PrinterIcon />
                            {!isCollapsed && 'Printer Settings'}
                        </button>
                    )}
                    {!isCollapsed && (
                        <div
                            className="px-3 py-2 rounded-lg bg-[var(--color-surface)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
                            onClick={() => setIsChangelogOpen(true)}
                        >
                            <p className="text-xs text-[var(--color-muted)]">Version</p>
                            <p className="text-sm font-medium text-[var(--color-foreground)]">1.3.2</p>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className={cn(
                            'w-full flex items-center rounded-lg text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors',
                            isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
                        )}
                        title={isCollapsed ? 'Sign Out' : undefined}
                    >
                        <LogoutIcon />
                        {!isCollapsed && 'Sign Out'}
                    </button>
                </div>

                {/* Flyout menu for collapsed sidebar groups */}
                {isCollapsed && hoveredGroup && (() => {
                    const group = navigation.find(item => item.name === hoveredGroup);
                    if (!group?.children) return null;
                    return (
                        <div
                            className="fixed bg-white border border-[var(--color-border)] rounded-lg shadow-lg py-1.5 min-w-[180px] z-[60] animate-in fade-in slide-in-from-left-1 duration-150"
                            style={{ left: '72px', top: `${flyoutTop}px` }}
                            onMouseEnter={handleFlyoutMouseEnter}
                            onMouseLeave={handleFlyoutMouseLeave}
                        >
                            <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider border-b border-[var(--color-border)] mb-1">
                                {group.name}
                            </div>
                            {group.children.map((child) => {
                                const isActive = location.pathname === child.href;
                                return (
                                    <NavLink
                                        key={child.name}
                                        to={child.href}
                                        onClick={() => {
                                            setHoveredGroup(null);
                                            setIsMobileOpen(false);
                                        }}
                                        className={cn(
                                            'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors mx-1.5 rounded-md',
                                            isActive
                                                ? 'text-[var(--color-primary)] bg-[var(--color-surface)] font-medium'
                                                : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        )}
                                    >
                                        <child.icon />
                                        {child.name}
                                    </NavLink>
                                );
                            })}
                        </div>
                    );
                })()}
            </aside>

            <ChangelogModal
                isOpen={isChangelogOpen}
                onClose={() => setIsChangelogOpen(false)}
            />
            <PrinterSettings
                isOpen={isPrinterSettingsOpen}
                onClose={() => setIsPrinterSettingsOpen(false)}
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

function PrinterIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
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

function UserIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <circle cx="9" cy="11" r="2.5" />
            <path d="M14 11.5h4" />
            <path d="M14 15h3" />
            <path d="M5 17a3 3 0 0 1 8 0" />
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

function MegaphoneIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 11 14-5v12L3 13v-2Z" />
            <path d="M17 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
            <path d="M7 14v4a2 2 0 0 0 2 2h1" />
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
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <line x1="3" x2="21" y1="6" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
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

function TimecardIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
        </svg>
    );
}

function ScheduleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
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

function ShieldIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
    );
}

function ListIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" x2="21" y1="6" y2="6" />
            <line x1="8" x2="21" y1="12" y2="12" />
            <line x1="8" x2="21" y1="18" y2="18" />
            <line x1="3" x2="3.01" y1="6" y2="6" />
            <line x1="3" x2="3.01" y1="12" y2="12" />
            <line x1="3" x2="3.01" y1="18" y2="18" />
        </svg>
    );
}

function InvoiceIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <path d="M9 15h6" />
            <path d="M9 11h6" />
        </svg>
    );
}

function CategoryIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3H3v7h7V3Z" />
            <path d="M21 3h-7v7h7V3Z" />
            <path d="M21 14h-7v7h7v-7Z" />
            <path d="M10 14H3v7h7v-7Z" />
        </svg>
    );
}

function WalletIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
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

function ChevronLeftIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
        </svg>
    );
}

function BarcodeIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5v14" />
            <path d="M8 5v14" />
            <path d="M12 5v14" />
            <path d="M17 5v14" />
            <path d="M21 5v14" />
        </svg>
    );
}

function MessageIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10h10M7 14h6" />
            <path d="M21 12a8 8 0 0 1-8 8H4l-1 1v-9a8 8 0 1 1 18 0Z" />
        </svg>
    );
}

function MailIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
        </svg>
    );
}
