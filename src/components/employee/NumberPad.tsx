// Number Pad component for PIN entry
// Touch-friendly design for POS terminals

import { useState } from 'react';

interface NumberPadProps {
    onDigit: (digit: string) => void;
    onClear: () => void;
    onBackspace: () => void;
    onSubmit?: () => void;
    disabled?: boolean;
}

export function NumberPad({ onDigit, onClear, onBackspace, onSubmit, disabled }: NumberPadProps) {
    const [pressedKey, setPressedKey] = useState<string | null>(null);

    const handlePress = (value: string) => {
        if (disabled) return;
        setPressedKey(value);
        setTimeout(() => setPressedKey(null), 100);
        onDigit(value);
    };

    const numberClass = (key: string) => `flex aspect-square w-full items-center justify-center rounded-xl border text-2xl font-semibold tabular-nums transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        pressedKey === key
            ? 'scale-95 border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
            : 'border-[var(--color-input)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]'
    }`;

    const actionClass = (key: string) => `flex aspect-square w-full items-center justify-center rounded-xl border text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        pressedKey === key
            ? 'scale-95 border-[var(--color-border-strong)] bg-[var(--color-surface-hover)]'
            : 'border-[var(--color-input)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]'
    }`;

    return (
        <div className="mx-auto w-full max-w-xs" aria-label="PIN keypad">
            <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                    <button key={digit} type="button" onClick={() => handlePress(digit)} className={numberClass(digit)} disabled={disabled} aria-label={digit}>
                        {digit}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        if (disabled) return;
                        setPressedKey('clear');
                        setTimeout(() => setPressedKey(null), 100);
                        onClear();
                    }}
                    className={actionClass('clear')}
                    disabled={disabled}
                >
                    Clear
                </button>
                <button
                    type="button"
                    onClick={() => handlePress('0')}
                    className={numberClass('0')}
                    disabled={disabled}
                >
                    0
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (disabled) return;
                        setPressedKey('back');
                        setTimeout(() => setPressedKey(null), 100);
                        onBackspace();
                    }}
                    className={actionClass('back')}
                    disabled={disabled}
                    aria-label="Delete last digit"
                >
                    Delete
                </button>
            </div>

            {/* Submit button (optional) */}
            {onSubmit && (
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={disabled}
                    className="mt-3 min-h-12 w-full rounded-xl bg-[var(--color-primary)] px-4 text-base font-semibold text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Enter
                </button>
            )}
        </div>
    );
}
