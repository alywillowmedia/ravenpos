import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
    id: string;
    variant: ToastVariant;
    title: string;
    description?: string;
}

interface ShowToastInput {
    variant?: ToastVariant;
    title: string;
    description?: string;
    durationMs?: number;
}

interface ToastContextValue {
    showToast: (input: ShowToastInput) => void;
    success: (title: string, description?: string, durationMs?: number) => void;
    error: (title: string, description?: string, durationMs?: number) => void;
    warning: (title: string, description?: string, durationMs?: number) => void;
    info: (title: string, description?: string, durationMs?: number) => void;
}

const DEFAULT_DURATION_MS = 4200;
const MAX_TOASTS = 5;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback(({ variant = 'info', title, description, durationMs = DEFAULT_DURATION_MS }: ShowToastInput) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        setToasts((prev) => [{ id, variant, title, description }, ...prev].slice(0, MAX_TOASTS));

        window.setTimeout(() => {
            removeToast(id);
        }, durationMs);
    }, [removeToast]);

    const value = useMemo<ToastContextValue>(() => ({
        showToast,
        success: (title, description, durationMs) => showToast({ variant: 'success', title, description, durationMs }),
        error: (title, description, durationMs) => showToast({ variant: 'error', title, description, durationMs }),
        warning: (title, description, durationMs) => showToast({ variant: 'warning', title, description, durationMs }),
        info: (title, description, durationMs) => showToast({ variant: 'info', title, description, durationMs }),
    }), [showToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastViewport toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-full max-w-sm flex-col gap-2">
            {toasts.map((toast) => {
                const toneStyles = getToneStyles(toast.variant);
                return (
                    <div
                        key={toast.id}
                        className={cn(
                            'pointer-events-auto animate-fadeInUp rounded-xl border p-4 shadow-lg backdrop-blur',
                            'bg-white/96'
                        )}
                        style={{
                            borderColor: toneStyles.border,
                            boxShadow: `0 10px 30px -16px ${toneStyles.shadow}`,
                        }}
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex items-start gap-3">
                            <span
                                className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                                style={{ color: toneStyles.icon }}
                            >
                                <ToastIcon variant={toast.variant} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[var(--color-foreground)]">{toast.title}</p>
                                {toast.description ? (
                                    <p className="mt-1 text-xs text-[var(--color-muted)]">{toast.description}</p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => onDismiss(toast.id)}
                                className="rounded-md p-1 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
                                aria-label="Dismiss notification"
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>,
        document.body
    );
}

function getToneStyles(variant: ToastVariant): { border: string; icon: string; shadow: string } {
    if (variant === 'success') return { border: 'var(--color-success)', icon: 'var(--color-success)', shadow: 'rgba(16, 185, 129, 0.35)' };
    if (variant === 'error') return { border: 'var(--color-danger)', icon: 'var(--color-danger)', shadow: 'rgba(239, 68, 68, 0.35)' };
    if (variant === 'warning') return { border: 'var(--color-warning)', icon: 'var(--color-warning)', shadow: 'rgba(245, 158, 11, 0.35)' };
    return { border: 'var(--color-info)', icon: 'var(--color-info)', shadow: 'rgba(59, 130, 246, 0.35)' };
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
    if (variant === 'success') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
            </svg>
        );
    }

    if (variant === 'error') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
            </svg>
        );
    }

    if (variant === 'warning') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        );
    }

    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m18 6-12 12" />
            <path d="m6 6 12 12" />
        </svg>
    );
}
