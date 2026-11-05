import { splitMoney } from '../../lib/money';

export interface MoneyProps {
    amount: number;
    className?: string;
}

export function Money({ amount, className }: MoneyProps) {
    const { whole, cents } = splitMoney(amount);

    return (
        <span className={className}>
            {whole}
            <span className="text-[0.62em] font-medium tracking-normal text-[var(--color-muted)]">{cents}</span>
        </span>
    );
}
