import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    options: SelectOption[];
    placeholder?: string;
    selectSize?: 'sm' | 'md' | 'lg';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    (
        {
            className,
            label,
            error,
            hint,
            options,
            placeholder,
            selectSize = 'md',
            id,
            ...props
        },
        ref
    ) => {
        const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

        const sizes = {
            sm: 'h-8 text-sm px-3',
            md: 'h-10 text-sm px-3',
            lg: 'h-12 text-base px-4',
        };

        const selectStyles = `
      w-full rounded-lg
      bg-white
      border border-[var(--color-border)]
      text-[var(--color-foreground)]
      transition-all duration-150
      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)]
      appearance-none
      cursor-pointer
      pr-10
      ${error ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]' : ''}
    `;

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="text-sm font-medium text-[var(--color-foreground)]"
                    >
                        {label}
                    </label>
                )}
                <div className="relative">
                    <select
                        ref={ref}
                        id={inputId}
                        className={cn(selectStyles, sizes[selectSize], className)}
                        {...props}
                    >
                        {placeholder && (
                            <option value="" disabled>
                                {placeholder}
                            </option>
                        )}
                        {options.map((option) => (
                            <option
                                key={option.value}
                                value={option.value}
                                disabled={option.disabled}
                            >
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-muted)]">
                        <ChevronDownIcon />
                    </div>
                </div>
                {error && (
                    <p className="text-sm text-[var(--color-danger)]">{error}</p>
                )}
                {hint && !error && (
                    <p className="text-sm text-[var(--color-muted)]">{hint}</p>
                )}
            </div>
        );
    }
);

Select.displayName = 'Select';

function ChevronDownIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
