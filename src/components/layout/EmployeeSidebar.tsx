import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ClockStatusWidget } from '../employee/ClockStatusWidget';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { getCachedAvatarUrl } from '../../lib/avatar';

// Icons need to be defined or imported. 
// Since we want to be strict about not modifying un-related files, 
// and Sidebar.tsx has them locally defined (mostly), we will define the relevant ones here too
// or import them if they were shared (but they were local in Sidebar.tsx).

function RegisterIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
        </svg>
    );
}

function TillIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H7" />
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

function TagIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
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

function UserIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 1 0-16 0" />
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

function ReceiptIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
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

function MenuIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
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


const navigation = [
    { name: 'POS', href: '/employee/pos', icon: RegisterIcon },
    { name: 'My Sales', href: '/employee/sales', icon: ReceiptIcon },
    { name: 'Till Count', href: '/employee/till-count', icon: TillIcon },
    { name: 'Schedule & Time Off', href: '/employee/schedule', icon: ScheduleIcon },
    { name: 'Customers', href: '/employee/customers', icon: CustomersIcon },
    { name: 'Labels', href: '/employee/labels', icon: TagIcon },
    { name: 'Messages', href: '/employee/messages', icon: MessageIcon },
    { name: 'Profile', href: '/employee/profile', icon: UserIcon },
];

export function EmployeeSidebar() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed-employee');
        return saved === 'true';
    });
    const location = useLocation();
    const navigate = useNavigate();
    const { employee, logout, clockStatus } = useEmployee();
    const { userRecord } = useAuth();
    const [employeeProfileUrl, setEmployeeProfileUrl] = useState<string | null>(null);
    const profileName = employee?.name || userRecord?.full_name || 'Employee';
    const profileAvatarUrl = getCachedAvatarUrl(userRecord?.profile_image_url || employeeProfileUrl, { size: 96, quality: 70 });

    useEffect(() => {
        const loadEmployeeProfileImage = async () => {
            if (!employee?.id || userRecord?.profile_image_url) {
                setEmployeeProfileUrl(null);
                return;
            }

            const { data } = await supabase
                .from('users')
                .select('profile_image_url')
                .or(`employee_id.eq.${employee.id},linked_employee_id.eq.${employee.id}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            setEmployeeProfileUrl((data as { profile_image_url?: string | null } | null)?.profile_image_url ?? null);
        };

        void loadEmployeeProfileImage();
    }, [employee?.id, userRecord?.profile_image_url]);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed-employee', isCollapsed.toString());
        window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed } }));
    }, [isCollapsed]);

    const handleLogout = async () => {
        await logout();
        navigate('/employee/login');
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
                        <h1 style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, var(--color-primary), #a855f7)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                            Ravenlia
                        </h1>
                    ) : (
                        <div className="w-8 h-8 bg-gradient-to-br from-[var(--color-primary)] to-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
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
                        <div className="flex items-center gap-2.5">
                            {profileAvatarUrl ? (
                                <img
                                    src={profileAvatarUrl}
                                    alt={profileName}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-9 w-9 shrink-0 rounded-full border border-[var(--color-border)] object-cover"
                                />
                            ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
                                    {getInitials(profileName)}
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Employee</p>
                                <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                                    {employee?.name}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navigation.map((item) => {
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

                {/* Bottom section with Clock and Logout */}
                <div className={cn(
                    'border-t border-[var(--color-border)] space-y-3',
                    isCollapsed ? 'p-2' : 'p-4'
                )}>
                    {!isCollapsed && (
                        <div className="px-1">
                            <ClockStatusWidget />
                        </div>
                    )}

                    <button
                        onClick={() => setShowLogoutConfirm(true)}
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
            </aside>

            <Modal
                isOpen={showLogoutConfirm}
                onClose={() => setShowLogoutConfirm(false)}
                title="Sign Out"
            >
                <div className="p-4">
                    <p className="text-[var(--color-muted)] mb-6">
                        Are you sure you want to sign out?{clockStatus.isClockedIn ? ' You will remain clocked in.' : ''}
                    </p>
                    <div className="flex gap-3 justify-end">
                        <Button variant="secondary" onClick={() => setShowLogoutConfirm(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleLogout}>
                            Logout
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function getInitials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'U';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}
