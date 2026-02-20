import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

export function PublicLayout() {
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen ravenlia-storefront bg-[var(--color-background)] text-[var(--color-foreground)]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--color-surface-elevated)]/95 backdrop-blur-md border-b-2 border-[var(--color-border)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo / Store Name */}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="w-11 h-11 rounded-full bg-[var(--color-primary)] flex items-center justify-center shadow-sm border border-black/30">
                                <img src="/raven.svg" alt="" className="w-7 h-7" />
                            </div>
                            <span className="text-lg sm:text-xl font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                                Ravenlia Galleria
                            </span>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            <Link
                                to="/"
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${isActive('/')
                                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                    }`}
                            >
                                Home
                            </Link>
                            <Link
                                to="/#categories"
                                className="px-4 py-2 rounded-full text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
                            >
                                Categories
                            </Link>
                            <Link
                                to="/#vendors"
                                className="px-4 py-2 rounded-full text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
                            >
                                Vendors
                            </Link>
                        </nav>

                        {/* Right side */}
                        <div className="flex items-center gap-3">
                            {/* Vendor Login Link */}
                            <Link
                                to="/login"
                                className="hidden sm:inline-flex text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
                            >
                                Vendor Login
                            </Link>

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
                            >
                                <svg
                                    className="w-6 h-6 text-[var(--color-foreground)]"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    {mobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Mobile Navigation */}
                    {mobileMenuOpen && (
                        <nav className="md:hidden py-4 border-t border-[var(--color-border)] animate-fadeIn">
                            <div className="flex flex-col gap-1">
                                <Link
                                    to="/"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/')
                                            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                >
                                    Home
                                </Link>
                                <Link
                                    to="/"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
                                >
                                    Categories
                                </Link>
                                <Link
                                    to="/"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
                                >
                                    Vendors
                                </Link>
                                <Link
                                    to="/login"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
                                >
                                    Vendor Login
                                </Link>
                            </div>
                        </nav>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main>
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface)] mt-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Store Info */}
                        <div>
                            <h3 className="text-h3 text-[var(--color-foreground)] mb-3 ravenlia-display">
                                Visit Us
                            </h3>
                            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                                682 Skyline Hwy<br />
                                Galax, VA 24333<br />
                                +1 (276) 601-3010
                            </p>
                        </div>

                        {/* Hours */}
                        <div>
                            <h3 className="text-h3 text-[var(--color-foreground)] mb-3 ravenlia-display">
                                Store Hours
                            </h3>
                            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                                Monday - Saturday: 10am - 6pm<br />
                                Sunday: 11am - 5pm
                            </p>
                        </div>

                        {/* About */}
                        <div>
                            <h3 className="text-h3 text-[var(--color-foreground)] mb-3 ravenlia-display">
                                About
                            </h3>
                            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                                Where art lives, stories linger, and community gathers. Browse online, then visit in person to take your find home.
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-[var(--color-border)] text-center text-sm text-[var(--color-muted)]">
                        © {new Date().getFullYear()} Ravenlia Galleria. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}
