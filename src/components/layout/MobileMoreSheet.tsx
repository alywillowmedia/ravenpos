import React, { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployee } from '../../contexts/EmployeeContext';
import { cn } from '../../lib/utils';
import { Circle, CircleDot } from 'lucide-react';

interface MobileMoreSheetProps {
    isOpen: boolean;
    onClose: () => void;
    variant: 'admin' | 'employee';
}

interface MoreNavItem {
    name: string;
    href: string;
    icon: () => React.ReactElement;
}

// Additional admin navigation items for the "More" sheet
const adminMoreItems: MoreNavItem[] = [
    { name: 'Dashboard', href: '/admin', icon: DashboardIcon },
    { name: 'Consignors', href: '/admin/consignors', icon: ConsignorsIcon },
    { name: 'Timecards', href: '/admin/employees', icon: TimecardIcon },
    { name: 'Roles', href: '/admin/employees/roles', icon: EmployeesIcon },
    { name: 'Schedule', href: '/admin/employees/schedule', icon: ScheduleIcon },
    { name: 'Add Products', href: '/admin/add-items', icon: PlusIcon },
    { name: 'Scan In/Out', href: '/admin/scan', icon: BarcodeIcon },
    { name: 'Import CSV', href: '/admin/import', icon: UploadIcon },
    { name: 'Labels', href: '/admin/labels', icon: TagIcon },
    { name: 'Payouts', href: '/admin/payouts', icon: PayoutsIcon },
    { name: 'Marketing Fees', href: '/admin/finances/marketing-fees', icon: MegaphoneIcon },
    { name: 'Messages', href: '/admin/messages', icon: MessageIcon },
    { name: 'Email Campaigns', href: '/admin/email-campaigns', icon: EmailIcon },
    { name: 'Categories & Tax', href: '/admin/finances/categories', icon: TaxIcon },
    { name: 'Integrations', href: '/admin/integrations', icon: IntegrationsIcon },
    { name: 'Profile', href: '/admin/profile', icon: ProfileIcon },
];

const employeeMoreItems: MoreNavItem[] = [
    { name: 'Sales', href: '/employee/sales', icon: ReceiptIcon },
    { name: 'Till Count', href: '/employee/till-count', icon: CashIcon },
    { name: 'Labels', href: '/employee/labels', icon: TagIcon },
    { name: 'Messages', href: '/employee/messages', icon: MessageIcon },
    { name: 'Profile', href: '/employee/profile', icon: ProfileIcon },
];

export function MobileMoreSheet({ isOpen, onClose, variant }: MobileMoreSheetProps) {
    const { signOut } = useAuth();
    const { logout: employeeLogout, clockStatus } = useEmployee();
    const navigate = useNavigate();

    const moreItems = variant === 'admin' ? adminMoreItems : employeeMoreItems;

    // Lock body scroll when sheet is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    const handleLogout = async () => {
        if (variant === 'admin') {
            await signOut();
        } else {
            await employeeLogout();
            navigate('/employee/login');
        }
        onClose();
    };

    const handleNavClick = () => {
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className="mobile-sheet-overlay active"
                onClick={onClose}
            />

            {/* Sheet */}
            <div className={cn('mobile-sheet', isOpen && 'open')}>
                {/* Handle */}
                <div className="mobile-sheet-handle" />

                {/* Header */}
                <div className="px-4 pb-4 border-b border-[var(--color-border)]">
                    <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
                        More Options
                    </h2>
                    {variant === 'employee' && clockStatus && (
                        <p className="text-sm text-[var(--color-muted)] mt-1">
                            <span className="inline-flex items-center gap-1.5">
                                {clockStatus.isClockedIn ? <CircleDot size={14} /> : <Circle size={14} />}
                                {clockStatus.isClockedIn ? 'Clocked In' : 'Clocked Out'}
                            </span>
                            {clockStatus.isClockedIn && clockStatus.startTime && (
                                <span className="ml-2">
                                    since {new Date(clockStatus.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </p>
                    )}
                </div>

                {/* Navigation Grid */}
                <div className="p-4 grid grid-cols-3 gap-3">
                    {moreItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                onClick={handleNavClick}
                                className={({ isActive }) => cn(
                                    'flex flex-col items-center justify-center p-4 rounded-xl',
                                    'text-sm font-medium transition-all duration-150',
                                    'touch-manipulation tap-highlight-none active:scale-95',
                                    isActive
                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                        : 'bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                )}
                            >
                                <Icon />
                                <span className="mt-2 text-center text-xs leading-tight">{item.name}</span>
                            </NavLink>
                        );
                    })}
                </div>

                {/* Sign Out Button */}
                <div className="p-4 border-t border-[var(--color-border)]">
                    <button
                        onClick={handleLogout}
                        className={cn(
                            'w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl',
                            'text-sm font-medium transition-all duration-150',
                            'touch-manipulation tap-highlight-none active:scale-98',
                            'text-[var(--color-danger)] bg-[var(--color-danger-bg)]',
                            'hover:bg-[var(--color-danger)]/20'
                        )}
                    >
                        <LogoutIcon />
                        Sign Out
                    </button>
                </div>
            </div>
        </>
    );
}

// Icons
function DashboardIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    );
}

function ConsignorsIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function EmployeesIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
    );
}

function CashIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H7" />
        </svg>
    );
}

function ReceiptIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

function TimecardIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
        </svg>
    );
}

function ScheduleIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function BarcodeIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5v14" />
            <path d="M8 5v14" />
            <path d="M12 5v14" />
            <path d="M17 5v14" />
            <path d="M21 5v14" />
        </svg>
    );
}

function UploadIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
    );
}

function TagIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
        </svg>
    );
}

function PayoutsIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    );
}

function MessageIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10h10M7 14h6" />
            <path d="M21 12a8 8 0 0 1-8 8H4l-1 1v-9a8 8 0 1 1 18 0Z" />
        </svg>
    );
}

function EmailIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
        </svg>
    );
}

function IntegrationsIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
            <path d="M22 12v4a2 2 0 0 1-2 2h-1" />
            <path d="M22 12h-4" />
        </svg>
    );
}

function TaxIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    );
}

function MegaphoneIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 11 14-5v12L3 13v-2Z" />
            <path d="M17 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
            <path d="M7 14v4a2 2 0 0 0 2 2h1" />
        </svg>
    );
}

function ProfileIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="8" r="5" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}
