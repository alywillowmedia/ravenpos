import { Outlet } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { EmployeeSidebar } from './EmployeeSidebar';

export function EmployeeLayout() {
    const { employee } = useEmployee();

    if (!employee) {
        return null;
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

