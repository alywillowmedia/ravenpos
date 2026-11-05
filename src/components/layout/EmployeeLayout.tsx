import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployee } from '../../contexts/EmployeeContext';
import { useMessaging } from '../../hooks/useMessaging';
import { getCachedAvatarUrl } from '../../lib/avatar';
import { supabase } from '../../lib/supabase';
import { ClockStatusWidget } from '../employee/ClockStatusWidget';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PortalShell } from './PortalShell';
import type { ProfileMenuAction } from './PortalSidebar';
import { employeeNavigation } from './portalNavigation';

export function EmployeeLayout() {
    const { employee, isLoading, logout, clockStatus } = useEmployee();
    const { userRecord } = useAuth();
    const navigate = useNavigate();
    const messaging = useMessaging({ portalBasePath: '/employee' });
    const location = useLocation();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [employeeProfileUrl, setEmployeeProfileUrl] = useState<string | null>(null);

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

    const menuActions = useMemo<ProfileMenuAction[]>(() => [
        { label: 'Sign out', icon: LogOut, tone: 'danger', onSelect: () => setShowLogoutConfirm(true) },
    ], []);

    const handleLogout = async () => {
        await logout();
        navigate('/employee/login');
    };

    // Show loading while checking session
    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center">
                <div className="text-[var(--color-muted)]">Loading...</div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!employee) {
        return <Navigate to="/employee/login" replace />;
    }

    return (
        <>
            <PortalShell
                portalBasePath="/employee"
                navigation={employeeNavigation}
                collapseStorageKey="sidebar-collapsed-employee"
                profile={{
                    name: employee.name || userRecord?.full_name || 'Employee',
                    roleLabel: 'Employee',
                    avatarUrl: getCachedAvatarUrl(
                        userRecord?.profile_image_url || employee.profile_image_url || employeeProfileUrl,
                        { size: 96, quality: 70 }
                    ),
                }}
                menuActions={menuActions}
                footerSlot={<ClockStatusWidget />}
                messaging={messaging}
            >
                <Outlet key={location.pathname} context={{ messaging }} />
            </PortalShell>

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
