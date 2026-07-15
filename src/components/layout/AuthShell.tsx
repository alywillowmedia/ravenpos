import type { ReactNode } from 'react';
import ravenposLogo from '../../../assets/ravenpos_logo.svg';

interface AuthShellProps {
    eyebrow: string;
    title: string;
    description: string;
    children: ReactNode;
    footer?: ReactNode;
    maxWidth?: 'sm' | 'md';
}

export function AuthShell({ eyebrow, title, description, children, footer, maxWidth = 'sm' }: AuthShellProps) {
    return (
        <main className="relative min-h-dvh overflow-hidden bg-[var(--color-background)] px-4 py-8 text-[var(--color-foreground)] sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(138,43,34,0.12),transparent_68%)]" aria-hidden="true" />
            <div className={`relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full ${maxWidth === 'md' ? 'max-w-2xl' : 'max-w-md'} flex-col justify-center`}>
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-5 w-full max-w-[15rem] rounded-2xl border border-[var(--color-border)] bg-white px-6 py-4 shadow-sm">
                        <img src={ravenposLogo} alt="RavenPOS" className="mx-auto h-12 w-auto" />
                    </div>
                    <p className="eyebrow mb-2">{eyebrow}</p>
                    <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-muted)] sm:text-base">{description}</p>
                </div>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-lg sm:p-6" aria-label={title}>
                    {children}
                </section>

                {footer && <div className="mt-6 text-center text-sm text-[var(--color-muted)]">{footer}</div>}
            </div>
        </main>
    );
}
