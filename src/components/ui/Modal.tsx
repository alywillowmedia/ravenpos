import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
    className?: string;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    showCloseButton?: boolean;
}

export function Modal({
    isOpen,
    onClose,
    children,
    title,
    description,
    size = 'md',
    className,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    showCloseButton = false,
}: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = `${useId().replace(/:/g, '')}-title`;
    const descriptionId = `${titleId}-description`;

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;

        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const appRoot = document.getElementById('root');
        const wasInert = appRoot?.inert ?? false;
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = 'hidden';
        if (appRoot) appRoot.inert = true;

        const getFocusable = () => {
            if (!contentRef.current) return [];
            return Array.from(contentRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
        };

        const focusFrame = window.requestAnimationFrame(() => {
            const focusable = getFocusable();
            (focusable[0] || contentRef.current)?.focus();
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && closeOnEscape) {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab') return;
            const focusable = getFocusable();
            if (focusable.length === 0) {
                event.preventDefault();
                contentRef.current?.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            if (appRoot) appRoot.inert = wasInert;
            previousFocus?.focus();
        };
    }, [closeOnEscape, isOpen]);

    // Close on overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (closeOnOverlayClick && e.target === overlayRef.current) onClose();
    };

    if (!isOpen) return null;

    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-5xl',
        full: 'max-w-6xl',
    };

    return createPortal(
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className={cn(
                'fixed inset-0 z-50',
                'flex items-center justify-center p-4',
                'bg-black/50 backdrop-blur-sm',
                'animate-fadeIn'
            )}
        >
            <div
                ref={contentRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-describedby={description ? descriptionId : undefined}
                aria-label={!title ? 'Dialog' : undefined}
                tabIndex={-1}
                className={cn(
                    'w-full rounded-xl',
                    'bg-[var(--color-card)] shadow-xl',
                    'animate-fadeInUp',
                    'flex flex-col max-h-[85vh]',
                    sizes[size],
                    className
                )}
            >
                {(title || description) && (
                    <div className="px-6 py-4 border-b border-[var(--color-border)] shrink-0">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                {title && (
                                    <h2
                                        id={titleId}
                                        className="text-lg font-semibold text-[var(--color-foreground)]"
                                    >
                                        {title}
                                    </h2>
                                )}
                                {description && (
                                    <p
                                        id={descriptionId}
                                        className="mt-1 text-sm text-[var(--color-muted)]"
                                    >
                                        {description}
                                    </p>
                                )}
                            </div>
                            {showCloseButton && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] transition-colors"
                                    aria-label="Close modal"
                                    title="Close"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                )}
                <div className="px-6 py-4 overflow-y-auto">{children}</div>
            </div>
        </div>,
        document.body
    );
}

export interface ModalFooterProps {
    children: ReactNode;
    className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
    return (
        <div
            className={cn(
                'flex items-center justify-end gap-3',
                'pt-4 mt-4 border-t border-[var(--color-border)]',
                className
            )}
        >
            {children}
        </div>
    );
}
