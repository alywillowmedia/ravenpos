import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    inputSize?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            className,
            label,
            error,
            hint,
            leftIcon,
            rightIcon,
            inputSize = 'md',
            type = 'text',
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

        const inputStyles = `
      w-full rounded-lg
      bg-white
      border border-[var(--color-border)]
      text-[var(--color-foreground)]
      placeholder:text-[var(--color-muted-foreground)]
      transition-all duration-150
      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)]
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
                    {leftIcon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
                            {leftIcon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        type={type}
                        className={cn(
                            inputStyles,
                            sizes[inputSize],
                            leftIcon && 'pl-10',
                            rightIcon && 'pr-10',
                            className
                        )}
                        {...props}
                    />
                    {rightIcon && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
                            {rightIcon}
                        </div>
                    )}
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

Input.displayName = 'Input';

// Textarea variant
export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, label, error, hint, id, ...props }, ref) => {
        const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

        const textareaStyles = `
      w-full rounded-lg
      bg-white
      border border-[var(--color-border)]
      text-[var(--color-foreground)]
      placeholder:text-[var(--color-muted-foreground)]
      transition-all duration-150
      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)]
      px-3 py-2 text-sm
      min-h-[80px] resize-y
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
                <textarea
                    ref={ref}
                    id={inputId}
                    className={cn(textareaStyles, className)}
                    {...props}
                />
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

Textarea.displayName = 'Textarea';
