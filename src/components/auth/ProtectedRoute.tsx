import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const { user, userRecord, isLoading, isAdmin, isVendor, signOut } = useAuth();
    const location = useLocation();

    // Show loading while checking initial auth state
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    // Not authenticated - redirect to login
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // User is logged in but user record is still loading (non-blocking fetch)
    // Show a brief loading state while we wait for it
    if (!userRecord) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
                <div className="text-center">
                    <LoadingSpinner size={32} />
                    <p className="mt-4 text-sm text-[var(--color-muted)]">Loading your account...</p>
                    {/* Add a timeout recovery after 10 seconds */}
                    <button
                        onClick={async () => {
                            await signOut();
                            window.location.href = '/login';
                        }}
                        className="mt-4 text-sm text-[var(--color-primary)] hover:underline"
                    >
                        Taking too long? Sign out and retry
                    </button>
                </div>
            </div>
        );
    }

    // Check role requirement
    if (requiredRole) {
        if (requiredRole === 'admin' && !isAdmin) {
            // Vendor trying to access admin area - redirect to vendor dashboard
            return <Navigate to="/vendor" replace />;
        }
        if (requiredRole === 'vendor' && !isVendor) {
            // Admin trying to access vendor area - redirect to admin dashboard
            return <Navigate to="/admin" replace />;
        }
    }

    return <>{children}</>;
}
