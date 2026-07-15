import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployee } from '../../contexts/EmployeeContext';
import { getCachedAvatarUrl } from '../../lib/avatar';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { ClockStatusWidget } from '../employee/ClockStatusWidget';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { employeeNavigation, pathIsActive } from './portalNavigation';

export function EmployeeSidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { employee, logout, clockStatus } = useEmployee();
    const { userRecord } = useAuth();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed-employee') === 'true');
    const [employeeProfileUrl, setEmployeeProfileUrl] = useState<string | null>(null);
    const profileName = employee?.name || userRecord?.full_name || 'Employee';
    const profileAvatarUrl = getCachedAvatarUrl(
        userRecord?.profile_image_url || employee?.profile_image_url || employeeProfileUrl,
        { size: 96, quality: 70 }
    );

    useEffect(() => {
        const loadEmployeeProfileImage = async () => {
            if (!employee?.id || userRecord?.profile_image_url || employee?.profile_image_url) {
                setEmployeeProfileUrl(null);
                return;
            }
            const { data, error } = await supabase
                .from('users')
                .select('profile_image_url')
                .or(`employee_id.eq.${employee.id},linked_employee_id.eq.${employee.id}`)
                .not('profile_image_url', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) console.error('Failed to load employee profile image:', error);
            setEmployeeProfileUrl((data as { profile_image_url?: string | null } | null)?.profile_image_url ?? null);
        };
        void loadEmployeeProfileImage();
    }, [employee?.id, employee?.profile_image_url, userRecord?.profile_image_url]);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed-employee', String(isCollapsed));
        window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed } }));
    }, [isCollapsed]);

    const handleLogout = async () => {
        await logout();
        navigate('/employee/login');
    };

    return (
        <>
            <aside aria-label="Employee navigation" className={cn(
                'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)] transition-[width] duration-200',
                isCollapsed ? 'w-[72px]' : 'w-64'
            )}>
                <div className={cn('flex h-16 items-center border-b border-[var(--color-border)]', isCollapsed ? 'justify-center px-2' : 'px-4')}>
                    {isCollapsed ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] font-semibold text-[var(--color-primary-foreground)]">R</span>
                    ) : (
                        <img src="/ravenpos_logo.svg" alt="Raven POS" className="sidebar-logo-image h-auto max-h-10 w-32" />
                    )}
                </div>

                {!isCollapsed && (
                    <div className="border-b border-[var(--color-border)] px-3 py-3">
                        <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-2.5">
                            {profileAvatarUrl ? (
                                <img src={profileAvatarUrl} alt="" className="h-9 w-9 rounded-full border border-[var(--color-border)] object-cover" />
                            ) : (
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">{getInitials(profileName)}</span>
                            )}
                            <div className="min-w-0">
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">Employee</p>
                                <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{profileName}</p>
                            </div>
                        </div>
                    </div>
                )}

                <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                    {employeeNavigation.map((item) => {
                        const active = pathIsActive(location.pathname, item.href);
                        const Icon = item.icon;
                        return (
                            <NavLink key={item.href} to={item.href} aria-current={active ? 'page' : undefined} title={isCollapsed ? item.name : undefined} className={cn(
                                'flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors',
                                isCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                                active
                                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                    : item.emphasis === 'primary'
                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15'
                                        : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
                            )}>
                                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                                {!isCollapsed && item.name}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] p-2">
                    {!isCollapsed && <div className="px-1"><ClockStatusWidget /></div>}
                    <button type="button" onClick={() => setIsCollapsed((value) => !value)} className={cn('flex min-h-10 w-full items-center rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')} aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
                        {isCollapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
                        {!isCollapsed && 'Collapse navigation'}
                    </button>
                    <button type="button" onClick={() => setShowLogoutConfirm(true)} className={cn('flex min-h-10 w-full items-center rounded-lg text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]', isCollapsed ? 'justify-center' : 'gap-3 px-3')} title={isCollapsed ? 'Sign out' : undefined}>
                        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                        {!isCollapsed && 'Sign out'}
                    </button>
                </div>
            </aside>

            <Modal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} title="Sign out" size="sm">
                <p className="text-sm text-[var(--color-muted)]">
                    Sign out of this employee session?{clockStatus.isClockedIn ? ' You will remain clocked in.' : ''}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => void handleLogout()}>Sign out</Button>
                </div>
            </Modal>
        </>
    );
}

function getInitials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'E';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}
