interface HeroSectionProps {
    storeName?: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
}

export function HeroSection({
    storeName = 'Ravenlia Galleria',
    searchValue,
    onSearchChange
}: HeroSectionProps) {
    return (
        <section className="relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[var(--color-primary)]/10 blur-3xl" />
                <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-black/5 blur-3xl" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
                <div className="text-center max-w-2xl mx-auto">
                    {/* Welcome Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-surface-elevated)] text-[var(--color-primary)] text-sm font-medium mb-6 ravenlia-card">
                        Curated Marketplace
                    </div>

                    {/* Main Heading */}
                    <p className="text-base sm:text-lg font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                        Welcome To
                    </p>
                    <h1 className="mt-2 text-4xl sm:text-6xl font-semibold text-[var(--color-primary)] tracking-tight ravenlia-display">
                        {storeName}
                    </h1>

                    {/* Tagline */}
                    <p className="mt-4 text-lg text-[var(--color-foreground)] leading-relaxed font-semibold">
                        Where art lives, stories linger, and community gathers.
                    </p>
                    <p className="mt-2 text-base text-[var(--color-muted)] leading-relaxed">
                        Explore local antiques, handmade goods, and uncommon finds online, then visit us in person.
                    </p>

                    {/* Search Bar */}
                    <div className="mt-8 max-w-lg mx-auto">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search for items..."
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

                    {/* Quick Stats */}
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[var(--color-muted)]">
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
            </div>
        </section>
    );
}
