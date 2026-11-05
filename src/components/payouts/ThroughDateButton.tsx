import { useRef } from 'react';
import { Button } from '../ui/Button';
import { formatDay } from '../../lib/payoutRun';

export function ThroughDateButton({
    value,
    max,
    onChange,
}: {
    value: string;
    max: string;
    onChange: (date: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const openPicker = () => {
        const input = inputRef.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.focus();
    };

    return (
        <span className="relative inline-flex">
            <Button type="button" variant="secondary" onClick={openPicker}>
                Earnings through {formatDay(value)}
            </Button>
            <input
                ref={inputRef}
                type="date"
                value={value}
                max={max}
                tabIndex={-1}
                aria-label="Earnings through date"
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                onChange={(event) => {
                    if (event.target.value) onChange(event.target.value);
                }}
            />
        </span>
    );
}
