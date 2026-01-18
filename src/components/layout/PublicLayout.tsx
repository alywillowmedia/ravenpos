import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

export function PublicLayout() {
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen bg-[var(--color-background)]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[var(--color-border)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo / Store Name */}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                                <svg
                                    className="w-6 h-6 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                </svg>
                            </div>
                            <span className="text-xl font-bold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                                RavenPOS
                            </span>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            <Link
                                to="/"
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/')
                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)]'
                                    }`}
                            >
                                Home
                            </Link>
                            <Link
                                to="/#categories"
                                className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors"
                            >
                                Categories
                            </Link>
                            <Link
                                to="/#vendors"
                                className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors"
                            >
                                Vendors
                            </Link>
                        </nav>

                        {/* Right side */}
                        <div className="flex items-center gap-3">
                            {/* Vendor Login Link */}
                            <Link
                                to="/login"
                                className="hidden sm:inline-flex text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                            >
                                Vendor Login
                            </Link>

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
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
                                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface)]'
                                        }`}
                                >
                                    Home
                                </Link>
                                <Link
                                    to="/"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors"
                                >
                                    Categories
                                </Link>
                                <Link
                                    to="/"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors"
                                >
                                    Vendors
                                </Link>
                                <Link
                                    to="/login"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] transition-colors"
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
            <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] mt-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Store Info */}
                        <div>
                            <h3 className="text-h3 text-[var(--color-foreground)] mb-3">
                                Visit Us
                            </h3>
                            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                                123 Main Street<br />
                                Anytown, USA 12345<br />
                                (555) 123-4567
                            </p>
                        </div>

                        {/* Hours */}
                        <div>
                            <h3 className="text-h3 text-[var(--color-foreground)] mb-3">
                                Store Hours
                            </h3>
                            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                                Monday - Saturday: 10am - 6pm<br />
                                Sunday: 12pm - 5pm
                            </p>
                        </div>

                        {/* About */}
                        <div>
                            <h3 className="text-h3 text-[var(--color-foreground)] mb-3">
                                About
                            </h3>
                            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                                We're a community marketplace featuring unique items from local vendors. Come browse our ever-changing selection!
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-[var(--color-border)] text-center text-sm text-[var(--color-muted)]">
                        © {new Date().getFullYear()} RavenPOS. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}
