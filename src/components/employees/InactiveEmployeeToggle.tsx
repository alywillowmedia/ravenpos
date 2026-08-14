import { Button } from '../ui/Button';

interface InactiveEmployeeToggleProps {
    showInactive: boolean;
    inactiveCount: number;
    onChange: (showInactive: boolean) => void;
}

export function InactiveEmployeeToggle({
    showInactive,
    inactiveCount,
    onChange,
}: InactiveEmployeeToggleProps) {
    if (inactiveCount === 0) return null;

    return (
        <Button
            type="button"
            variant="secondary"
            onClick={() => onChange(!showInactive)}
            aria-pressed={showInactive}
        >
            {showInactive ? 'Hide inactive employees' : `Show inactive employees (${inactiveCount})`}
        </Button>
    );
}
