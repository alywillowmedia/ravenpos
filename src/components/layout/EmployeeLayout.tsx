import { Outlet, Navigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { EmployeeSidebar } from './EmployeeSidebar';

export function EmployeeLayout() {
    const { employee, isLoading } = useEmployee();

    // Show loading while checking session
    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
                <div className="text-[var(--color-muted)]">Loading...</div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!employee) {
        return <Navigate to="/employee/login" replace />;
    }

    return (
        <div className="min-h-screen bg-[var(--color-surface)]">
            <EmployeeSidebar />
            <main className="lg:pl-64">
                <div className="px-4 py-6 sm:px-6 lg:px-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
