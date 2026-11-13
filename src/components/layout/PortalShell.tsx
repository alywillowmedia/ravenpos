import { type ReactNode, useCallback, useState } from 'react';
import type { useMessaging } from '../../hooks/useMessaging';
import { useMobile } from '../../hooks/useMobile';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';
import { cn } from '../../lib/utils';
import { hasUnseenWhatsNew, markWhatsNewSeen } from '../../lib/whatsNew';
import { MobileBottomNav } from './MobileBottomNav';
import { PortalSidebar, type PortalProfile, type ProfileMenuAction } from './PortalSidebar';
import { PortalTopBar } from './PortalTopBar';
import type { PortalNavEntry } from './portalNavigation';
import { WhatsNewModal } from './WhatsNewModal';

export interface PortalShellProps {
    portalBasePath: '/admin' | '/employee' | '/vendor';
    navigation: PortalNavEntry[];
    collapseStorageKey: 'sidebar-collapsed' | 'sidebar-collapsed-employee' | 'sidebar-collapsed-vendor';
    profile: PortalProfile;
    menuActions: ProfileMenuAction[];
    footerSlot?: ReactNode;
    messaging: ReturnType<typeof useMessaging>;
    children: ReactNode;
}

const PORTAL_HOME: Record<PortalShellProps['portalBasePath'], string> = {
    '/admin': '/admin',
    '/employee': '/employee/pos',
    '/vendor': '/vendor',
};

const MOBILE_VARIANT = {
    '/admin': 'admin',
    '/employee': 'employee',
    '/vendor': 'vendor',
} as const;

export function PortalShell({
    portalBasePath,
    navigation,
    collapseStorageKey,
    profile,
    menuActions,
    footerSlot,
    messaging,
    children,
}: PortalShellProps) {
    const { isMobile } = useMobile();
    const { isCollapsed, canToggle, toggle } = useSidebarCollapsed(collapseStorageKey);
    const role = MOBILE_VARIANT[portalBasePath];
    const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
    const [hasUnseen, setHasUnseen] = useState(() => hasUnseenWhatsNew(role));
    const openWhatsNew = useCallback(() => {
        markWhatsNewSeen(role);
        setHasUnseen(false);
        setIsWhatsNewOpen(true);
    }, [role]);

    return (
        <div className="min-h-screen bg-[var(--color-canvas)]">
            {!isMobile && (
                <PortalSidebar
                    homeHref={PORTAL_HOME[portalBasePath]}
                    navigation={navigation}
                    profile={profile}
                    menuActions={menuActions}
                    footerSlot={footerSlot}
                    onOpenWhatsNew={openWhatsNew}
                    hasUnseenWhatsNew={hasUnseen}
                    isCollapsed={isCollapsed}
                    canToggle={canToggle}
                    onToggle={toggle}
                />
            )}
            <main
                className={cn(
                    isMobile ? 'mobile-content-padding' : isCollapsed ? 'lg:pl-[100px]' : 'lg:pl-[272px]',
                    'min-h-screen transition-[padding] duration-200 ease-out'
                )}
            >
                <PortalTopBar messaging={messaging} portalBasePath={portalBasePath} />
                <div className="px-4 py-5 sm:px-6 lg:px-7">{children}</div>
            </main>
            {isMobile && <MobileBottomNav variant={role} onOpenWhatsNew={openWhatsNew} hasUnseenWhatsNew={hasUnseen} />}
            <WhatsNewModal isOpen={isWhatsNewOpen} onClose={() => setIsWhatsNewOpen(false)} role={role} />
        </div>
    );
}
