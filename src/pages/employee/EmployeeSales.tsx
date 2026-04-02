import { Header } from '../../components/layout/Header';
import { useEmployee } from '../../contexts/EmployeeContext';
import { EmployeeSalesSummary } from '../../components/employee/EmployeeSalesSummary';

export function EmployeeSales() {
    const { employee } = useEmployee();

    return (
        <div className="animate-fadeIn space-y-6">
            <Header
                title="My Sales"
                description="Your attributed sales from the last 7 days."
            />
            <EmployeeSalesSummary
                employeeId={employee?.id || null}
                employeeName={employee?.name || null}
                days={7}
            />
        </div>
    );
}
