import { formatCurrency } from './utils';

export function splitMoney(amount: number): { whole: string; cents: string } {
    const formatted = formatCurrency(Number.isFinite(amount) ? amount : 0);
    const decimal = formatted.lastIndexOf('.');
    return { whole: formatted.slice(0, decimal), cents: formatted.slice(decimal) };
}
