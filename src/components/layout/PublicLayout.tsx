import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, Grid2X2, PackageSearch, Store } from 'lucide-react';
import { ravenliaContact, ravenliaLinks } from '../../content/ravenliaSite';

export function PublicLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const embedParam = new URLSearchParams(location.search).get('embed');
    const isEmbedMode = embedParam === '1' || embedParam === 'true';
    const querySearch = new URLSearchParams(location.search).get('q') || '';
    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
    };
    const shopActive =
        isActive('/shop') ||
        isActive('/shopping') ||
        isActive('/categories') ||
        isActive('/category') ||
        isActive('/vendor') ||
        isActive('/item');
    const shopLinks = [
        { to: '/shop', label: 'All Products', description: 'Browse every listed piece.', icon: PackageSearch },
        { to: '/shop/categories', label: 'Categories', description: 'Shop by room, style, or type.', icon: Grid2X2 },
        { to: '/shop/vendors', label: 'Vendors', description: 'Visit each vendor storefront.', icon: Store },
    ];
    const navLinks = [
        { to: '/', label: 'Home', active: isActive('/') },
        { to: '/shop', label: 'Shop', active: shopActive },
        { to: '/events', label: 'Events', active: isActive('/events') || isActive('/classes') },
        { to: '/vendors', label: 'Vendors', active: isActive('/vendors') },
        { to: '/our-story', label: 'Our Story', active: isActive('/our-story') },
        { to: '/contact', label: 'Contact', active: isActive('/contact') },
    ];

    useEffect(() => {
        setSearchValue(querySearch);
    }, [querySearch]);

    const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const params = new URLSearchParams();
        const trimmed = searchValue.trim();
        if (trimmed) {
            params.set('q', trimmed);
        }
        navigate({
            pathname: '/shop',
            search: params.toString() ? `?${params.toString()}` : '',
        });
        setMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen ravenlia-storefront bg-[var(--color-background)] text-[var(--color-foreground)]">
            {!isEmbedMode && (
                <header className="sticky top-0 z-50 bg-[var(--color-background)]/80 backdrop-blur-xl border-b border-[var(--color-border)]">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between gap-4 h-20">
                            <Link to="/" className="flex items-center gap-2.5 group">
                                <img src="/raven.svg" alt="" className="w-7 h-7 transition-transform group-hover:scale-105" />
                                <span className="ravenlia-display text-xl sm:text-2xl text-[var(--color-foreground)] transition-colors group-hover:text-[var(--color-primary)]">
                                    Ravenlia Galleria
                                </span>
                            </Link>

                            <nav className="hidden lg:flex items-center gap-5">
                                {navLinks.map((link) => {
                                    if (link.to === '/shop') {
                                        return (
                                            <div key={link.to} className="group relative">
                                                <Link
                                                    to={link.to}
                                                    className={`relative inline-flex items-center gap-1.5 text-sm transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-px after:bg-[var(--color-foreground)] after:transition-all ${link.active
                                                        ? 'text-[var(--color-foreground)] after:w-full'
                                                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] after:w-0 hover:after:w-full'
                                                        }`}
                                                >
                                                    {link.label}
                                                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
                                                </Link>
                                                <div className="invisible absolute left-1/2 top-full z-50 w-[22rem] -translate-x-1/2 pt-5 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                                                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 shadow-[var(--shadow-gallery-lifted)]">
                                                        <p className="ravenlia-eyebrow px-3 py-2">Shop menu</p>
                                                        <div className="space-y-1">
                                                            {shopLinks.map((item) => {
                                                                const Icon = item.icon;
                                                                return (
                                                                    <Link
                                                                        key={item.to}
                                                                        to={item.to}
                                                                        className="group/item flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--color-surface)] focus:bg-[var(--color-surface)] focus:outline-none"
                                                                    >
                                                                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)] transition-colors group-hover/item:bg-[var(--color-primary)] group-hover/item:text-[var(--color-primary-foreground)]">
                                                                            <Icon className="h-4 w-4" />
                                                                        </span>
                                                                        <span>
                                                                            <span className="block text-sm text-[var(--color-foreground)]">{item.label}</span>
                                                                            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">{item.description}</span>
                                                                        </span>
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <Link
                                            key={link.to}
                                            to={link.to}
                                            className={`relative text-sm transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-px after:bg-[var(--color-foreground)] after:transition-all ${link.active
                                                ? 'text-[var(--color-foreground)] after:w-full'
                                                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] after:w-0 hover:after:w-full'
                                                }`}
                                        >
                                            {link.label}
                                        </Link>
                                    );
                                })}
                            </nav>

                            <form onSubmit={handleSearchSubmit} className="hidden xl:flex flex-1 max-w-[15rem]">
                                <div className="relative w-full">
                                    <input
                                        type="text"
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        placeholder="Search items"
                                        className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] py-2.5 pl-11 pr-4 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] transition-colors focus:outline-none focus:border-[var(--color-foreground)]"
                                    />
                                    <svg className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                            </form>

                            <div className="flex items-center gap-3">
                                <Link
                                    to="/login"
                                    className="hidden sm:inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-5 py-2.5 text-sm font-medium text-[var(--color-foreground)] transition-all hover:border-[var(--color-foreground)]"
                                >
                                    Vendor Login
                                </Link>
                                <a
                                    href={ravenliaLinks.updates}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="hidden sm:inline-flex items-center justify-center rounded-full bg-[var(--color-foreground)] px-5 py-2.5 text-sm font-medium text-[var(--color-background)] transition-all hover:bg-[var(--color-primary)]"
                                >
                                    Get Updates
                                </a>

                                <button
                                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                    className="lg:hidden p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
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
                            <nav className="lg:hidden py-4 border-t border-[var(--color-border)] animate-fadeIn">
                                <div className="flex flex-col gap-1">
                                    {navLinks.map((link) => (
                                        <div key={link.to}>
                                            <Link
                                                to={link.to}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${link.active
                                                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                                    : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                                    }`}
                                            >
                                                {link.label}
                                            </Link>
                                            {link.to === '/shop' && (
                                                <div className="ml-4 mt-1 space-y-1 border-l border-[var(--color-border)] pl-3">
                                                    {shopLinks.map((item) => (
                                                        <Link
                                                            key={item.to}
                                                            to={item.to}
                                                            onClick={() => setMobileMenuOpen(false)}
                                                            className="block rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
                                                        >
                                                            {item.label}
                                                        </Link>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
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
                                    <a
                                        href={ravenliaLinks.updates}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="mx-4 mt-2 inline-flex items-center justify-center rounded-full bg-[var(--color-foreground)] px-5 py-3 text-sm font-medium text-[var(--color-background)] transition-colors hover:bg-[var(--color-primary)]"
                                    >
                                        Get Updates
                                    </a>
                                    <Link
                                        to="/login"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
                                    >
                                        Login
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
                <footer className="border-t border-[var(--color-border)] mt-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                            <div className="space-y-3">
                                <p className="ravenlia-eyebrow">Visit Us</p>
                                <p className="text-[var(--color-muted)] text-base leading-relaxed">
                                    {ravenliaContact.addressLines.map((line) => (
                                        <span key={line} className="block">{line}</span>
                                    ))}
                                    <a href={ravenliaLinks.phone} className="text-[var(--color-foreground)] hover:text-[var(--color-primary)] transition-colors mt-2 inline-block">{ravenliaContact.phoneDisplay}</a>
                                </p>
                            </div>

                            <div className="space-y-3">
                                <p className="ravenlia-eyebrow">Store Hours</p>
                                <p className="text-[var(--color-muted)] text-base leading-relaxed">
                                    Wednesday - Saturday: 10 AM - 7 PM<br />
                                    Sunday: 1 PM - 5 PM<br />
                                    Monday - Tuesday: Closed
                                </p>
                            </div>

                            <div className="space-y-3">
                                <p className="ravenlia-eyebrow">About</p>
                                <p className="text-[var(--color-muted)] text-base leading-relaxed">
                                    Where art lives, stories linger, and community gathers. Browse online, then visit in person to take your find home.
                                </p>
                            </div>
                        </div>

                        <div className="mt-16 pt-8 border-t border-[var(--color-border)] flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[var(--color-muted)]">
                            <p>© {new Date().getFullYear()} Ravenlia Galleria</p>
                            <div className="flex items-center gap-6">
                                <Link to="/contact" className="hover:text-[var(--color-foreground)] transition-colors">Contact</Link>
                                <Link to="/login" className="hover:text-[var(--color-foreground)] transition-colors">Login</Link>
                            </div>
                        </div>
                    </div>
                </footer>
            )}
        </div>
    );
}
