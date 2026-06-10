import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RavenliaImage } from '../../content/ravenliaSite';
import { ravenliaContact, ravenliaLinks } from '../../content/ravenliaSite';

interface PublicButtonProps {
    children: ReactNode;
    to?: string;
    href?: string;
    variant?: 'primary' | 'secondary' | 'quiet';
    external?: boolean;
}

export function PublicButton({ children, to, href, variant = 'primary', external = false }: PublicButtonProps) {
    const classes = {
        primary: 'bg-[var(--color-foreground)] text-[var(--color-background)] hover:bg-[var(--color-primary)]',
        secondary: 'border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] hover:border-[var(--color-foreground)]',
        quiet: 'text-[var(--color-foreground)] hover:text-[var(--color-primary)]',
    }[variant];

    const className = `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all ${classes}`;
    const icon = external ? <ExternalLink className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />;

    if (to) {
        return (
            <Link to={to} className={className}>
                {children}
                {icon}
            </Link>
        );
    }

    return (
        <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined} className={className}>
            {children}
            {icon}
        </a>
    );
}

interface MarketingHeroProps {
    title: string;
    body: string;
    image: RavenliaImage;
    eyebrow?: string;
    primaryAction?: ReactNode;
    secondaryAction?: ReactNode;
}

export function MarketingHero({ title, body, image, eyebrow, primaryAction, secondaryAction }: MarketingHeroProps) {
    return (
        <section className="relative min-h-[72vh] overflow-hidden border-b border-[var(--color-border)]">
            <img src={image.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/42 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--color-background)] to-transparent" />

            <div className="relative z-10 mx-auto flex min-h-[72vh] max-w-7xl items-end px-4 pb-14 pt-28 sm:px-6 lg:px-8 lg:pb-20">
                <div className="max-w-3xl">
                    {eyebrow && <p className="ravenlia-eyebrow mb-5 !text-white/75">{eyebrow}</p>}
                    <h1 className="ravenlia-display text-balance text-5xl leading-[1.02] text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.5)] sm:text-7xl">
                        {title}
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/88 sm:text-xl">
                        {body}
                    </p>
                    {(primaryAction || secondaryAction) && (
                        <div className="mt-9 flex flex-wrap gap-3">
                            {primaryAction}
                            {secondaryAction}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

interface PageShellProps {
    children: ReactNode;
    className?: string;
}

export function PageShell({ children, className = '' }: PageShellProps) {
    return (
        <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>
            {children}
        </div>
    );
}

interface PageHeaderProps {
    eyebrow: string;
    title: string;
    body: string;
}

export function PageHeader({ eyebrow, title, body }: PageHeaderProps) {
    return (
        <header className="mx-auto max-w-3xl py-16 text-center sm:py-20">
            <p className="ravenlia-eyebrow mb-3">{eyebrow}</p>
            <h1 className="ravenlia-display text-4xl leading-tight text-[var(--color-foreground)] sm:text-6xl">{title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--color-muted)]">{body}</p>
        </header>
    );
}

interface FeatureRowProps {
    eyebrow?: string;
    title: string;
    body: string;
    image: RavenliaImage;
    imageSide?: 'left' | 'right';
    action?: ReactNode;
}

export function FeatureRow({ eyebrow, title, body, image, imageSide = 'right', action }: FeatureRowProps) {
    const imageMarkup = (
        <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-[var(--shadow-gallery)]">
            <img src={image.src} alt={image.alt} className="aspect-[5/4] h-full w-full object-cover" loading="lazy" />
        </div>
    );

    const copyMarkup = (
        <div className="flex flex-col justify-center">
            {eyebrow && <p className="ravenlia-eyebrow mb-3">{eyebrow}</p>}
            <h2 className="ravenlia-display text-3xl leading-tight text-[var(--color-foreground)] sm:text-5xl">{title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-[var(--color-muted)]">{body}</p>
            {action && <div className="mt-7">{action}</div>}
        </div>
    );

    return (
        <section className="grid grid-cols-1 gap-8 py-12 md:grid-cols-2 md:gap-12 md:py-16">
            {imageSide === 'left' ? imageMarkup : copyMarkup}
            {imageSide === 'left' ? copyMarkup : imageMarkup}
        </section>
    );
}

interface LinkCardProps {
    title: string;
    body: string;
    icon: ReactNode;
    to?: string;
    href?: string;
    external?: boolean;
}

export function LinkCard({ title, body, icon, to, href, external = false }: LinkCardProps) {
    const content = (
        <>
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)]">
                {icon}
            </div>
            <h3 className="text-xl text-[var(--color-foreground)]">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm text-[var(--color-foreground)] transition-colors group-hover:text-[var(--color-primary)]">
                Learn more
                {external ? <ExternalLink className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </span>
        </>
    );

    const className = 'group block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-gallery)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-gallery-lifted)]';

    if (to) {
        return (
            <Link to={to} className={className}>
                {content}
            </Link>
        );
    }

    return (
        <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined} className={className}>
            {content}
        </a>
    );
}

interface CtaBandProps {
    title: string;
    body: string;
    primary: ReactNode;
    secondary?: ReactNode;
}

export function CtaBand({ title, body, primary, secondary }: CtaBandProps) {
    return (
        <section className="my-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-10 shadow-[var(--shadow-gallery)] sm:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl">
                    <h2 className="ravenlia-display text-3xl leading-tight text-[var(--color-foreground)] sm:text-4xl">{title}</h2>
                    <p className="mt-3 text-[var(--color-muted)]">{body}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                    {primary}
                    {secondary}
                </div>
            </div>
        </section>
    );
}

export function LocationHours() {
    return (
        <section className="grid grid-cols-1 gap-6 py-12 md:grid-cols-[1fr_1.2fr] md:py-16">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-gallery)]">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)]">
                    <MapPin className="h-5 w-5" />
                </div>
                <p className="ravenlia-eyebrow mb-3">Visit us</p>
                <h2 className="ravenlia-display text-3xl text-[var(--color-foreground)]">{ravenliaContact.name}</h2>
                <p className="mt-4 leading-relaxed text-[var(--color-muted)]">
                    {ravenliaContact.addressLines.map((line) => (
                        <span key={line} className="block">{line}</span>
                    ))}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <PublicButton href={ravenliaLinks.maps} external variant="secondary">Directions</PublicButton>
                    <PublicButton href={ravenliaLinks.phone} variant="quiet">{ravenliaContact.phoneDisplay}</PublicButton>
                </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-[var(--shadow-gallery)]">
                <p className="ravenlia-eyebrow mb-4">Store hours</p>
                <div className="divide-y divide-[var(--color-border)]">
                    {ravenliaContact.hours.map((row) => (
                        <div key={row.day} className="flex items-center justify-between gap-4 py-3 text-sm">
                            <span className="text-[var(--color-foreground)]">{row.day}</span>
                            <span className="text-right text-[var(--color-muted)]">{row.hours}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
