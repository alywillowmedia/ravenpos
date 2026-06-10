import type { PublicStorefrontSettings } from '../../lib/publicStorefrontSettings';

interface HeroSectionProps {
    settings: PublicStorefrontSettings;
}

export function HeroSection({
    settings
}: HeroSectionProps) {
    const hasPrimaryCta = Boolean(settings.hero_primary_cta_label?.trim());
    const primaryCtaHref = settings.hero_primary_cta_href?.trim() || '#categories';
    const heroImage = settings.hero_feature_image_url || settings.hero_background_image_url;
    const onImage = Boolean(heroImage);

    const trustItems = ['Local pickup only', 'Updated daily', 'Vintage & handmade'];

    return (
        <section className="relative overflow-hidden border-b border-[var(--color-border)]">
            {onImage && (
                <>
                    <img
                        src={heroImage ?? undefined}
                        alt=""
                        className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]"
                    />
                    {/* Darken for legible light type */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/65" />
                    <div className="absolute inset-0 bg-black/15" />
                </>
            )}

            <div className="relative z-10 mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-36">
                {settings.hero_badge_text && (
                    <p className={`ravenlia-eyebrow mb-6 ${onImage ? '!text-white/80' : ''}`}>
                        {settings.hero_badge_text}
                    </p>
                )}

                <h1 className={`ravenlia-display mx-auto max-w-3xl text-balance text-4xl leading-[1.08] sm:text-6xl ${onImage ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]' : 'text-[var(--color-foreground)]'}`}>
                    {settings.hero_heading}
                </h1>

                <p className={`mx-auto mt-6 max-w-xl text-lg leading-relaxed sm:text-xl ${onImage ? 'text-white/85' : 'text-[var(--color-muted)]'}`}>
                    {settings.hero_subheading}
                </p>

                {hasPrimaryCta && (
                    <div className="mt-9">
                        <a
                            href={primaryCtaHref}
                            className={`inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium transition-all hover:shadow-[var(--shadow-gallery-lifted)] ${onImage
                                ? 'bg-white text-[var(--color-foreground)] hover:bg-white/90'
                                : 'bg-[var(--color-foreground)] text-[var(--color-background)] hover:bg-[var(--color-primary)]'}`}
                        >
                            {settings.hero_primary_cta_label}
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </a>
                    </div>
                )}

                {/* Trust line — plain text with hairline separators, no pills */}
                <div className={`mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs ${onImage ? 'text-white/75' : 'text-[var(--color-muted)]'}`}>
                    {trustItems.map((label, idx) => (
                        <span key={label} className="inline-flex items-center gap-3">
                            {idx > 0 && <span className={`h-1 w-1 rounded-full ${onImage ? 'bg-white/50' : 'bg-[var(--color-muted-foreground)]'}`} aria-hidden />}
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
