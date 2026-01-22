import { useEffect, useRef, type ReactNode } from 'react';
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
}

export function Modal({
    isOpen,
    onClose,
    children,
    title,
    description,
    size = 'md',
    className,
}: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    // Close on overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
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
                aria-labelledby={title ? 'modal-title' : undefined}
                aria-describedby={description ? 'modal-description' : undefined}
                className={cn(
                    'w-full rounded-xl',
                    'bg-white shadow-xl',
                    'animate-fadeInUp',
                    'flex flex-col max-h-[85vh]',
                    sizes[size],
                    className
                )}
            >
                {(title || description) && (
                    <div className="px-6 py-4 border-b border-[var(--color-border)] shrink-0">
                        {title && (
                            <h2
                                id="modal-title"
                                className="text-lg font-semibold text-[var(--color-foreground)]"
                            >
                                {title}
                            </h2>
                        )}
                        {description && (
                            <p
                                id="modal-description"
                                className="mt-1 text-sm text-[var(--color-muted)]"
                            >
                                {description}
                            </p>
                        )}
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
