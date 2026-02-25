type ClassValue = string | number | bigint | boolean | undefined | null | ClassValue[];

// Combine class names (simplified clsx implementation)
export function cn(...inputs: ClassValue[]): string {
    return inputs
        .flat()
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .join(' ');
}

// Format currency
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
}

// Generate SKU: shortcode-###-## (e.g., aly-123-45)
export function generateSKU(consignorNumber: string): string {
    const prefix = consignorNumber
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 3)
        .padEnd(3, 'x');
    const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '');
    const fiveDigits = digits.slice(-5).padStart(5, '0');
    return `${prefix}-${fiveDigits.slice(0, 3)}-${fiveDigits.slice(3)}`;
}

// Generate next consignor number (C001, C002, etc.)
export function generateConsignorNumber(existingNumbers: string[]): string {
    const prefix = 'C';
    const numbers = existingNumbers
        .filter(n => n.startsWith(prefix))
        .map(n => parseInt(n.slice(1), 10))
        .filter(n => !isNaN(n));

    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `${prefix}${nextNum.toString().padStart(3, '0')}`;
}

// Format date for display
export function formatDate(date: string | Date): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(date));
}

// Format date+time for display
export function formatDateTime(date: string | Date): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(date));
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// Parse currency string to number
export function parseCurrency(value: string): number {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}
