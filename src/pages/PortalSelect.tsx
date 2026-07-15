import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type PortalChoice } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { AuthShell } from '../components/layout/AuthShell';

function portalLabel(portal: PortalChoice): string {
    if (portal === 'admin') return 'Admin View';
    if (portal === 'vendor') return 'Vendor View';
    return 'Employee View';
}

export function PortalSelect() {
    const navigate = useNavigate();
    const { isLoading, user, userRecord, portalChoices, setActivePortal, resolveHomePath, signOut } = useAuth();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            navigate('/login', { replace: true });
            return;
        }
        if (!userRecord) return;
        if (portalChoices.length <= 1) {
            navigate(resolveHomePath(), { replace: true });
        }
    }, [isLoading, navigate, portalChoices.length, resolveHomePath, user, userRecord]);

    const handleChoose = (portal: PortalChoice) => {
        setActivePortal(portal);
        if (portal === 'admin') navigate('/admin', { replace: true });
        else if (portal === 'vendor') navigate('/vendor', { replace: true });
        else navigate('/employee-portal', { replace: true });
    };

    return (
        <AuthShell
            eyebrow="Workspace"
            title="Choose your view"
            description="Your account has access to multiple areas. You can switch again from the portal navigation."
            maxWidth="md"
        >
                    <div className="grid gap-3 sm:grid-cols-3">
                        {portalChoices.map((portal) => (
                            <Button
                                key={portal}
                                type="button"
                                className="min-h-20 w-full flex-col gap-1"
                                onClick={() => handleChoose(portal)}
                            >
                                {portalLabel(portal)}
                                <span className="text-xs font-normal opacity-75">Open workspace</span>
                            </Button>
                        ))}
                    </div>
                        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={signOut}>
                            Sign Out
                        </Button>
        </AuthShell>
    );
}
