import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

export function PublicLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const embedParam = new URLSearchParams(location.search).get('embed');
    const isEmbedMode = embedParam === '1' || embedParam === 'true';
    const querySearch = new URLSearchParams(location.search).get('q') || '';

    useEffect(() => {
        setSearchValue(querySearch);
    }, [querySearch]);

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

    const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const params = new URLSearchParams();
        const trimmed = searchValue.trim();
        if (trimmed) {
            params.set('q', trimmed);
        }
        navigate({
            pathname: '/',
            search: params.toString() ? `?${params.toString()}` : '',
        });
        setMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen ravenlia-storefront bg-[var(--color-background)] text-[var(--color-foreground)]">
            {!isEmbedMode && (
                <header className="sticky top-0 z-50 bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl border-b border-[var(--color-border)]/50 shadow-sm">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between gap-4 h-20">
                            <Link to="/" className="flex items-center gap-3 group">
                                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center shadow-md border border-black/10 group-hover:scale-105 transition-transform">
                                    <img src="/raven.svg" alt="" className="w-8 h-8" />
                                </div>
                                <span className="text-xl sm:text-2xl font-bold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors tracking-tight">
                                    Ravenlia Galleria
                                </span>
                            </Link>

                            <nav className="hidden md:flex items-center gap-2 bg-[var(--color-surface)]/50 px-2 py-1.5 rounded-full border border-[var(--color-border)]/50">
                                <Link
                                    to="/"
                                    className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${isActive('/')
                                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                >
                                    Home
                                </Link>
                                <Link
                                    to="/categories"
                                    className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${isActive('/categories') || isActive('/category')
                                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                >
                                    Categories
                                </Link>
                                <Link
                                    to="/vendors"
                                    className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${isActive('/vendors') || isActive('/vendor')
                                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                >
                                    Vendors
                                </Link>
                            </nav>

                            <form onSubmit={handleSearchSubmit} className="hidden lg:flex flex-1 max-w-md">
                                <div className="relative w-full">
                                    <input
                                        type="text"
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        placeholder="Search items..."
                                        className="w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-11 pr-24 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                                    />
                                    <svg className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <button
                                        type="submit"
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary-foreground)]"
                                    >
                                        Search
                                    </button>
                                </div>
                            </form>

                            <div className="flex items-center gap-4">
                                <Link
                                    to="/login"
                                    className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--color-surface)] border-2 border-[var(--color-border)] text-[var(--color-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all shadow-sm"
                                >
                                    Vendor Login
                                </Link>

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
                                        to="/categories"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
                                    >
                                        Categories
                                    </Link>
                                    <Link
                                        to="/vendors"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
                                    >
                                        Vendors
                                    </Link>
                                    <form onSubmit={handleSearchSubmit} className="px-4 pt-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={searchValue}
                                                onChange={(e) => setSearchValue(e.target.value)}
                                                placeholder="Search items..."
                                                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                                            />
                                            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                    </form>
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
            )}

            {/* Main Content */}
            <main>
                <Outlet />
            </main>

            {!isEmbedMode && (
                <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] mt-24">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                            <div className="space-y-4">
                                <h3 className="text-2xl font-bold text-[var(--color-foreground)] ravenlia-display tracking-tight">
                                    Visit Us
                                </h3>
                                <p className="text-[var(--color-muted)] text-base leading-relaxed font-medium">
                                    682 Skyline Hwy<br />
                                    Galax, VA 24333<br />
                                    <a href="tel:+12766013010" className="text-[var(--color-primary)] hover:underline mt-2 inline-block">+1 (276) 601-3010</a>
                                </p>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-2xl font-bold text-[var(--color-foreground)] ravenlia-display tracking-tight">
                                    Store Hours
                                </h3>
                                <p className="text-[var(--color-muted)] text-base leading-relaxed font-medium">
                                    Monday - Saturday: 10am - 6pm<br />
                                    Sunday: 11am - 5pm
                                </p>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-2xl font-bold text-[var(--color-foreground)] ravenlia-display tracking-tight">
                                    About
                                </h3>
                                <p className="text-[var(--color-muted)] text-base leading-relaxed font-medium">
                                    Where art lives, stories linger, and community gathers. Browse online, then visit in person to take your find home.
                                </p>
                            </div>
                        </div>

                        <div className="mt-16 pt-8 border-t border-[var(--color-border)] flex flex-col md:flex-row items-center justify-between gap-4 text-sm font-medium text-[var(--color-muted)]">
                            <p>© {new Date().getFullYear()} Ravenlia Galleria. All rights reserved.</p>
                            <div className="flex items-center gap-6">
                                <a href="#" className="hover:text-[var(--color-primary)] transition-colors">Privacy Policy</a>
                                <a href="#" className="hover:text-[var(--color-primary)] transition-colors">Terms of Service</a>
                            </div>
                        </div>
                    </div>
                </footer>
            )}
        </div>
    );
}
