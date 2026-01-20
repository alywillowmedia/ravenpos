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

    const buttonStyle = (key: string): React.CSSProperties => ({
        width: '80px',
        height: '80px',
        fontSize: '28px',
        fontWeight: 600,
        border: 'none',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.1s ease',
        backgroundColor: pressedKey === key ? 'var(--color-primary)' : 'var(--color-gray-700)',
        color: pressedKey === key ? 'white' : 'var(--color-gray-100)',
        opacity: disabled ? 0.5 : 1,
        transform: pressedKey === key ? 'scale(0.95)' : 'scale(1)',
    });

    const actionButtonStyle = (key: string): React.CSSProperties => ({
        ...buttonStyle(key),
        fontSize: '16px',
        fontWeight: 500,
        backgroundColor: pressedKey === key ? 'var(--color-gray-500)' : 'var(--color-gray-800)',
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            {/* Row 1: 1-2-3 */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {['1', '2', '3'].map(digit => (
                    <button
                        key={digit}
                        onClick={() => handlePress(digit)}
                        style={buttonStyle(digit)}
                        disabled={disabled}
                    >
                        {digit}
                    </button>
                ))}
            </div>

            {/* Row 2: 4-5-6 */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {['4', '5', '6'].map(digit => (
                    <button
                        key={digit}
                        onClick={() => handlePress(digit)}
                        style={buttonStyle(digit)}
                        disabled={disabled}
                    >
                        {digit}
                    </button>
                ))}
            </div>

            {/* Row 3: 7-8-9 */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {['7', '8', '9'].map(digit => (
                    <button
                        key={digit}
                        onClick={() => handlePress(digit)}
                        style={buttonStyle(digit)}
                        disabled={disabled}
                    >
                        {digit}
                    </button>
                ))}
            </div>

            {/* Row 4: Clear-0-Back */}
            <div style={{ display: 'flex', gap: '12px' }}>
                <button
                    onClick={() => {
                        if (disabled) return;
                        setPressedKey('clear');
                        setTimeout(() => setPressedKey(null), 100);
                        onClear();
                    }}
                    style={actionButtonStyle('clear')}
                    disabled={disabled}
                >
                    Clear
                </button>
                <button
                    onClick={() => handlePress('0')}
                    style={buttonStyle('0')}
                    disabled={disabled}
                >
                    0
                </button>
                <button
                    onClick={() => {
                        if (disabled) return;
                        setPressedKey('back');
                        setTimeout(() => setPressedKey(null), 100);
                        onBackspace();
                    }}
                    style={actionButtonStyle('back')}
                    disabled={disabled}
                >
                    ⌫
                </button>
            </div>

            {/* Submit button (optional) */}
            {onSubmit && (
                <button
                    onClick={onSubmit}
                    disabled={disabled}
                    style={{
                        marginTop: '8px',
                        width: '260px',
                        height: '56px',
                        fontSize: '18px',
                        fontWeight: 600,
                        border: 'none',
                        borderRadius: '12px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        opacity: disabled ? 0.5 : 1,
                    }}
                >
                    Enter
                </button>
            )}
        </div>
    );
}
