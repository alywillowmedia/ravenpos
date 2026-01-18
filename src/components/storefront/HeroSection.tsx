interface HeroSectionProps {
    storeName?: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
}

export function HeroSection({
    storeName = 'Our Store',
    searchValue,
    onSearchChange
}: HeroSectionProps) {
    return (
        <section className="relative bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-background)] overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[var(--color-primary)]/5 blur-3xl" />
                <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-amber-500/5 blur-3xl" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
                <div className="text-center max-w-2xl mx-auto">
                    {/* Welcome Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm font-medium mb-6">
                        <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse" />
                        Open Today
                    </div>

                    {/* Main Heading */}
                    <h1 className="text-4xl sm:text-5xl font-bold text-[var(--color-foreground)] tracking-tight">
                        Welcome to{' '}
                        <span className="text-[var(--color-primary)]">{storeName}</span>
                    </h1>

                    {/* Tagline */}
                    <p className="mt-4 text-lg text-[var(--color-muted)] leading-relaxed">
                        Browse our unique collection from local vendors.
                        Find something special online, then visit us in person to take it home!
                    </p>

                    {/* Search Bar */}
                    <div className="mt-8 max-w-lg mx-auto">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search for items..."
                                value={searchValue}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full px-5 py-4 pr-12 rounded-2xl bg-white border border-[var(--color-border)] text-[var(--color-foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] transition-all shadow-sm"
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
                    <div className="mt-8 flex items-center justify-center gap-8 text-sm text-[var(--color-muted)]">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Local pickup only
                        </div>
                        <div className="h-4 w-px bg-[var(--color-border)]" />
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Updated daily
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
