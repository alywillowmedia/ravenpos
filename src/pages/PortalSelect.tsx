import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type PortalChoice } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

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
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] p-4">
            <div className="w-full max-w-lg animate-fadeIn">
                <Card variant="elevated">
                    <CardHeader>
                        <CardTitle>Choose Your View</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-[var(--color-muted)]">
                            This login has access to multiple areas. Choose where you want to go.
                        </p>
                        {portalChoices.map((portal) => (
                            <Button
                                key={portal}
                                type="button"
                                className="w-full"
                                onClick={() => handleChoose(portal)}
                            >
                                {portalLabel(portal)}
                            </Button>
                        ))}
                        <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
                            Sign Out
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
