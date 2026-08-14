import {
    type ClipboardEvent,
    forwardRef,
    useEffect,
    useId,
    useRef,
    useState,
    type InputHTMLAttributes,
    type ReactNode,
} from 'react';
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
            maxLength,
            onBeforeInput,
            onPaste,
            ...props
        },
        ref
    ) => {
        const generatedId = useId();
        const inputId = id || `field-${generatedId.replace(/:/g, '')}`;
        const errorId = `${inputId}-error`;
        const hintId = `${inputId}-hint`;
        const describedBy = [props['aria-describedby'], error ? errorId : hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined;
        const [showMaxLengthTooltip, setShowMaxLengthTooltip] = useState(false);
        const [flashMaxLengthWarning, setFlashMaxLengthWarning] = useState(false);
        const hideTooltipTimeoutRef = useRef<number | null>(null);
        const hideFlashTimeoutRef = useRef<number | null>(null);

        useEffect(() => {
            return () => {
                if (hideTooltipTimeoutRef.current !== null) {
                    window.clearTimeout(hideTooltipTimeoutRef.current);
                }
                if (hideFlashTimeoutRef.current !== null) {
                    window.clearTimeout(hideFlashTimeoutRef.current);
                }
            };
        }, []);

        const triggerMaxLengthFeedback = () => {
            if (!maxLength || maxLength < 1) return;
            setShowMaxLengthTooltip(true);
            setFlashMaxLengthWarning(true);

            if (hideTooltipTimeoutRef.current !== null) {
                window.clearTimeout(hideTooltipTimeoutRef.current);
            }
            if (hideFlashTimeoutRef.current !== null) {
                window.clearTimeout(hideFlashTimeoutRef.current);
            }

            hideFlashTimeoutRef.current = window.setTimeout(() => {
                setFlashMaxLengthWarning(false);
            }, 450);

            hideTooltipTimeoutRef.current = window.setTimeout(() => {
                setShowMaxLengthTooltip(false);
            }, 1400);
        };

        const wouldExceedMaxLength = (
            element: HTMLInputElement,
            incomingTextLength: number
        ) => {
            if (!maxLength || maxLength < 1) return false;
            const start = element.selectionStart ?? element.value.length;
            const end = element.selectionEnd ?? element.value.length;
            const selectedLength = end - start;
            const nextLength = element.value.length - selectedLength + incomingTextLength;
            return nextLength > maxLength;
        };

        const handleBeforeInput: NonNullable<InputProps['onBeforeInput']> = (e) => {
            const native = e.nativeEvent as globalThis.InputEvent;
            const incoming = native.data ?? '';
            const isDelete = native.inputType?.startsWith('delete');

            if (!isDelete && incoming.length > 0 && wouldExceedMaxLength(e.currentTarget, incoming.length)) {
                e.preventDefault();
                triggerMaxLengthFeedback();
            }

            onBeforeInput?.(e);
        };

        const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted.length > 0 && wouldExceedMaxLength(e.currentTarget, pasted.length)) {
                e.preventDefault();
                triggerMaxLengthFeedback();
            }

            onPaste?.(e);
        };

        const sizes = {
            sm: 'h-9 min-h-[36px] text-sm px-3',
            md: 'h-11 min-h-[44px] text-sm px-3',
            lg: 'h-12 min-h-[48px] text-base px-4',
        };

        const inputStyles = `
      w-full rounded-lg
      bg-[var(--color-surface-elevated)]
      border border-[var(--color-input)]
      shadow-[var(--shadow-control)]
      text-[var(--color-foreground)]
      placeholder:text-[var(--color-muted-foreground)]
      transition-all duration-150
      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)]
      touch-manipulation tap-highlight-none
      text-[16px] md:text-sm
      ${error || flashMaxLengthWarning ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]' : ''}
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
                        maxLength={maxLength}
                        {...props}
                        onBeforeInput={handleBeforeInput}
                        onPaste={handlePaste}
                        aria-invalid={error ? true : props['aria-invalid']}
                        aria-describedby={describedBy}
                        className={cn(
                            inputStyles,
                            sizes[inputSize],
                            leftIcon && 'pl-10',
                            rightIcon && 'pr-10',
                            flashMaxLengthWarning && 'ring-2 ring-[var(--color-danger)] ring-offset-1',
                            className
                        )}
                    />
                    {showMaxLengthTooltip && maxLength && (
                        <div className="pointer-events-none absolute -top-9 right-0 rounded-md bg-[var(--color-danger)] px-2 py-1 text-xs font-medium text-white shadow-sm">
                            Max {maxLength} characters
                        </div>
                    )}
                    {rightIcon && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
                            {rightIcon}
                        </div>
                    )}
                </div>
                {error && (
                    <p id={errorId} role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>
                )}
                {hint && !error && (
                    <p id={hintId} className="text-sm text-[var(--color-muted)]">{hint}</p>
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
    ({ className, label, error, hint, id, maxLength, onBeforeInput, onPaste, ...props }, ref) => {
        const generatedId = useId();
        const inputId = id || `field-${generatedId.replace(/:/g, '')}`;
        const errorId = `${inputId}-error`;
        const hintId = `${inputId}-hint`;
        const describedBy = [props['aria-describedby'], error ? errorId : hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined;
        const [showMaxLengthTooltip, setShowMaxLengthTooltip] = useState(false);
        const [flashMaxLengthWarning, setFlashMaxLengthWarning] = useState(false);
        const hideTooltipTimeoutRef = useRef<number | null>(null);
        const hideFlashTimeoutRef = useRef<number | null>(null);

        useEffect(() => {
            return () => {
                if (hideTooltipTimeoutRef.current !== null) {
                    window.clearTimeout(hideTooltipTimeoutRef.current);
                }
                if (hideFlashTimeoutRef.current !== null) {
                    window.clearTimeout(hideFlashTimeoutRef.current);
                }
            };
        }, []);

        const triggerMaxLengthFeedback = () => {
            if (!maxLength || maxLength < 1) return;
            setShowMaxLengthTooltip(true);
            setFlashMaxLengthWarning(true);

            if (hideTooltipTimeoutRef.current !== null) {
                window.clearTimeout(hideTooltipTimeoutRef.current);
            }
            if (hideFlashTimeoutRef.current !== null) {
                window.clearTimeout(hideFlashTimeoutRef.current);
            }

            hideFlashTimeoutRef.current = window.setTimeout(() => {
                setFlashMaxLengthWarning(false);
            }, 450);

            hideTooltipTimeoutRef.current = window.setTimeout(() => {
                setShowMaxLengthTooltip(false);
            }, 1400);
        };

        const wouldExceedMaxLength = (
            element: HTMLTextAreaElement,
            incomingTextLength: number
        ) => {
            if (!maxLength || maxLength < 1) return false;
            const start = element.selectionStart ?? element.value.length;
            const end = element.selectionEnd ?? element.value.length;
            const selectedLength = end - start;
            const nextLength = element.value.length - selectedLength + incomingTextLength;
            return nextLength > maxLength;
        };

        const handleBeforeInput: NonNullable<TextareaProps['onBeforeInput']> = (e) => {
            const native = e.nativeEvent as globalThis.InputEvent;
            const incoming = native.data ?? '';
            const isDelete = native.inputType?.startsWith('delete');

            if (!isDelete && incoming.length > 0 && wouldExceedMaxLength(e.currentTarget, incoming.length)) {
                e.preventDefault();
                triggerMaxLengthFeedback();
            }

            onBeforeInput?.(e);
        };

        const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted.length > 0 && wouldExceedMaxLength(e.currentTarget, pasted.length)) {
                e.preventDefault();
                triggerMaxLengthFeedback();
            }

            onPaste?.(e);
        };

        const textareaStyles = `
      w-full rounded-lg
      bg-[var(--color-surface-elevated)]
      border border-[var(--color-input)]
      shadow-[var(--shadow-control)]
      text-[var(--color-foreground)]
      placeholder:text-[var(--color-muted-foreground)]
      transition-all duration-150
      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)]
      px-3 py-2 text-sm
      min-h-[80px] resize-y
      ${error || flashMaxLengthWarning ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]' : ''}
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
                    <textarea
                        ref={ref}
                        id={inputId}
                        maxLength={maxLength}
                        {...props}
                        onBeforeInput={handleBeforeInput}
                        onPaste={handlePaste}
                        aria-invalid={error ? true : props['aria-invalid']}
                        aria-describedby={describedBy}
                        className={cn(
                            textareaStyles,
                            flashMaxLengthWarning && 'ring-2 ring-[var(--color-danger)] ring-offset-1',
                            className
                        )}
                    />
                    {showMaxLengthTooltip && maxLength && (
                        <div className="pointer-events-none absolute -top-9 right-0 rounded-md bg-[var(--color-danger)] px-2 py-1 text-xs font-medium text-white shadow-sm">
                            Max {maxLength} characters
                        </div>
                    )}
                </div>
                {error && (
                    <p id={errorId} role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>
                )}
                {hint && !error && (
                    <p id={hintId} className="text-sm text-[var(--color-muted)]">{hint}</p>
                )}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';
