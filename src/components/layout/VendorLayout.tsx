import { useMemo } from 'react';
import { ArrowLeftRight, LogOut } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMessaging } from '../../hooks/useMessaging';
import { getCachedAvatarUrl } from '../../lib/avatar';
import { PortalShell } from './PortalShell';
import type { ProfileMenuAction } from './PortalSidebar';
import { vendorNavigation } from './portalNavigation';

export function VendorLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { userRecord, portalChoices, setActivePortal, signOut } = useAuth();
    const messaging = useMessaging({ portalBasePath: '/vendor' });
    const canSwitchPortal = portalChoices.length > 1;

    const menuActions = useMemo<ProfileMenuAction[]>(() => [
        ...(canSwitchPortal ? [{
            label: 'Switch portal',
            icon: ArrowLeftRight,
            onSelect: () => {
                setActivePortal(null);
                navigate('/portal-select');
            },
        }] : []),
        { label: 'Sign out', icon: LogOut, tone: 'danger', onSelect: () => void signOut() },
    ], [canSwitchPortal, navigate, setActivePortal, signOut]);

    return (
        <PortalShell
            portalBasePath="/vendor"
            navigation={vendorNavigation}
            collapseStorageKey="sidebar-collapsed-vendor"
            profile={{
                name: userRecord?.full_name || userRecord?.email || 'Vendor',
                roleLabel: 'Vendor',
                avatarUrl: getCachedAvatarUrl(userRecord?.profile_image_url, { size: 96, quality: 70 }),
            }}
            menuActions={menuActions}
            messaging={messaging}
        >
            <Outlet key={location.pathname} context={{ messaging }} />
        </PortalShell>
    );
}
