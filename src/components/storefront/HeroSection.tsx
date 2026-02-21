import type { PublicStorefrontSettings } from '../../lib/publicStorefrontSettings';

interface HeroSectionProps {
    settings: PublicStorefrontSettings;
    searchValue: string;
    onSearchChange: (value: string) => void;
}

export function HeroSection({
    settings,
    searchValue,
    onSearchChange
}: HeroSectionProps) {
    const hasPrimaryCta = Boolean(settings.hero_primary_cta_label?.trim());
    const primaryCtaHref = settings.hero_primary_cta_href?.trim() || '#categories';

    return (
        <section className="relative overflow-hidden border-b-2 border-[var(--color-border)]">
            <div className="absolute inset-0 overflow-hidden">
                {settings.hero_background_image_url && (
                    <img
                        src={settings.hero_background_image_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface)]/95 via-[var(--color-surface)]/80 to-[var(--color-background)]/90" />
                <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[var(--color-primary)]/20 blur-3xl" />
                <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-black/10 blur-3xl" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    <div>
                        {settings.hero_badge_text && (
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-surface-elevated)] text-[var(--color-primary)] text-sm font-medium mb-5 border border-[var(--color-border)]">
                                {settings.hero_badge_text}
                            </div>
                        )}

                        <h1 className="text-4xl sm:text-6xl font-semibold text-[var(--color-primary)] tracking-tight ravenlia-display">
                            {settings.hero_heading}
                        </h1>
                        <p className="mt-4 text-lg text-[var(--color-foreground)] leading-relaxed font-semibold">
                            {settings.hero_subheading}
                        </p>
                        <p className="mt-2 text-base text-[var(--color-muted)] leading-relaxed max-w-xl">
                            {settings.hero_body}
                        </p>

                        <div className="mt-5 max-w-xl">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={settings.hero_search_placeholder || 'Search for items...'}
                                    value={searchValue}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    className="w-full px-5 py-4 pr-12 rounded-2xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] text-[var(--color-foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 focus:border-[var(--color-primary)] transition-all shadow-sm"
                                />
                                <svg
                                    className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)]"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            {hasPrimaryCta && (
                                <a
                                    href={primaryCtaHref}
                                    className="inline-flex items-center px-5 py-2.5 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium hover:opacity-90 transition-opacity"
                                >
                                    {settings.hero_primary_cta_label}
                                </a>
                            )}
                            <a
                                href="#vendors"
                                className="inline-flex items-center px-5 py-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-foreground)] font-medium hover:bg-[var(--color-surface-hover)] transition-colors"
                            >
                                Meet Vendors
                            </a>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="aspect-square max-w-md lg:max-w-sm xl:max-w-md mx-auto rounded-3xl overflow-hidden border-2 border-[var(--color-border)] shadow-2xl bg-[var(--color-surface-elevated)]">
                            {settings.hero_feature_image_url ? (
                                <img
                                    src={settings.hero_feature_image_url}
                                    alt={settings.store_name}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="h-full w-full bg-gradient-to-br from-[var(--color-primary)]/20 via-[var(--color-surface)] to-[var(--color-primary)]/10 flex items-end p-8">
                                    <p className="text-xl sm:text-2xl font-semibold text-[var(--color-foreground)]">
                                        {settings.store_name}
                                    </p>
                                </div>
                            )}
                        </div>

                        {settings.hero_accent_image_url && (
                            <div className="hidden sm:block absolute -bottom-10 -left-12 h-36 w-36 rounded-2xl overflow-hidden border-2 border-[var(--color-border)] shadow-xl">
                                <img
                                    src={settings.hero_accent_image_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-[var(--color-muted)]">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Local pickup only
                    </div>
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Updated daily
                    </div>
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        Vintage and handmade
                    </div>
                </div>
            </div>
        </section>
    );
}
