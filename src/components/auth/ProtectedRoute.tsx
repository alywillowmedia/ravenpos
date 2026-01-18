import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const { user, userRecord, isLoading, isAdmin, isVendor } = useAuth();
    const location = useLocation();

    // Show loading while checking auth state
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

    // No user record (shouldn't happen, but handle gracefully)
    if (!userRecord) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
                <div className="text-center p-8">
                    <h1 className="text-xl font-semibold mb-2">Account Not Found</h1>
                    <p className="text-[var(--color-muted)]">
                        Your user account is not properly configured. Please contact an administrator.
                    </p>
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
