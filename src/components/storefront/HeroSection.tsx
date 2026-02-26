import type { PublicStorefrontSettings } from '../../lib/publicStorefrontSettings';

interface HeroSectionProps {
    settings: PublicStorefrontSettings;
}

export function HeroSection({
    settings
}: HeroSectionProps) {
    const hasPrimaryCta = Boolean(settings.hero_primary_cta_label?.trim());
    const primaryCtaHref = settings.hero_primary_cta_href?.trim() || '#categories';

    return (
        <section className="relative overflow-hidden py-16 sm:py-24 lg:py-32 border-b-2 border-[var(--color-border)]">
            {/* Background elements */}
            <div className="absolute inset-0 z-0">
                {settings.hero_feature_image_url ? (
                    <>
                        <img
                            src={settings.hero_feature_image_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-[var(--color-background)]/70 backdrop-blur-sm" />
                    </>
                ) : settings.hero_background_image_url ? (
                    <>
                        <img
                            src={settings.hero_background_image_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-[var(--color-background)]/85 backdrop-blur-sm" />
                    </>
                ) : (
                    <div className="absolute inset-0 bg-[var(--color-background)]" />
                )}
                <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
                    <div className="w-96 h-96 bg-[var(--color-primary)]/20 rounded-full blur-3xl" />
                </div>
                <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3">
                    <div className="w-96 h-96 bg-[var(--color-primary)]/20 rounded-full blur-3xl" />
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                {settings.hero_badge_text && (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm font-medium mb-8 border border-[var(--color-primary)]/20">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-primary)]"></span>
                        </span>
                        {settings.hero_badge_text}
                    </div>
                )}

                <h1 className="text-5xl sm:text-7xl font-bold text-[var(--color-foreground)] tracking-tight mb-6 max-w-4xl mx-auto leading-tight ravenlia-display">
                    {settings.hero_heading}
                </h1>
                
                <p className="text-xl sm:text-2xl text-[var(--color-muted)] mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
                    {settings.hero_subheading}
                </p>

                <div className="flex flex-wrap justify-center gap-4 text-sm text-[var(--color-muted)] font-medium">
                    {hasPrimaryCta && (
                        <a
                            href={primaryCtaHref}
                            className="flex items-center gap-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-5 py-2.5 rounded-full shadow-sm hover:opacity-90 transition-opacity"
                        >
                            {settings.hero_primary_cta_label}
                        </a>
                    )}
                    <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] px-4 py-2 rounded-full border border-[var(--color-border)] shadow-sm">
                        <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Local pickup only
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] px-4 py-2 rounded-full border border-[var(--color-border)] shadow-sm">
                        <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Updated daily
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] px-4 py-2 rounded-full border border-[var(--color-border)] shadow-sm">
                        <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        Vintage and handmade
                    </div>
                </div>
            </div>
        </section>
    );
}
