import { type ReactNode, useMemo, useState } from 'react';
import { ArrowLeftRight, History, LogOut, Printer } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMessaging } from '../../hooks/useMessaging';
import { getCachedAvatarUrl } from '../../lib/avatar';
import { PrinterSettings } from '../PrinterSettings';
import { ChangelogModal } from './ChangelogModal';
import { PortalShell } from './PortalShell';
import type { ProfileMenuAction } from './PortalSidebar';
import { adminNavigation } from './portalNavigation';

interface AdminLayoutProps {
    children?: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const messaging = useMessaging({ portalBasePath: '/admin' });
    const { userRecord, portalChoices, setActivePortal, signOut } = useAuth();
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
    const canSwitchPortal = portalChoices.length > 1;

    const menuActions = useMemo<ProfileMenuAction[]>(() => [
        ...(isElectron ? [{ label: 'Printer settings', icon: Printer, onSelect: () => setIsPrinterSettingsOpen(true) }] : []),
        { label: 'Release history', icon: History, onSelect: () => setIsChangelogOpen(true) },
        ...(canSwitchPortal ? [{
            label: 'Switch portal',
            icon: ArrowLeftRight,
            onSelect: () => {
                setActivePortal(null);
                navigate('/portal-select');
            },
        }] : []),
        { label: 'Sign out', icon: LogOut, tone: 'danger', onSelect: () => void signOut() },
    ], [canSwitchPortal, isElectron, navigate, setActivePortal, signOut]);

    return (
        <>
            <PortalShell
                portalBasePath="/admin"
                navigation={adminNavigation}
                collapseStorageKey="sidebar-collapsed"
                profile={{
                    name: userRecord?.full_name || userRecord?.email || 'Admin',
                    roleLabel: 'Admin',
                    avatarUrl: getCachedAvatarUrl(userRecord?.profile_image_url, { size: 96, quality: 70 }),
                }}
                menuActions={menuActions}
                messaging={messaging}
            >
                {children || <Outlet key={location.pathname} context={{ messaging }} />}
            </PortalShell>
            <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
            <PrinterSettings isOpen={isPrinterSettingsOpen} onClose={() => setIsPrinterSettingsOpen(false)} />
        </>
    );
}
