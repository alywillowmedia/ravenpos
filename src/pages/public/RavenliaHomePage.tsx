import { CalendarDays, Heart, Leaf, ShoppingBag, Users } from 'lucide-react';
import { LinkCard, LocationHours, MarketingHero, PageShell, PublicButton, FeatureRow, CtaBand } from '../../components/storefront/RavenliaPageSections';
import { ravenliaImages, ravenliaLinks, shoppingHighlights } from '../../content/ravenliaSite';

export function RavenliaHomePage() {
    return (
        <div className="animate-fadeIn">
            <MarketingHero
                eyebrow="Open Wednesday - Saturday and Sunday afternoons"
                title="Ravenlia Galleria"
                body="A thoughtfully curated marketplace in the heart of the Blue Ridge, where art lives, stories linger, and community gathers."
                image={ravenliaImages.frontDoor}
                primaryAction={<PublicButton to="/shop">Shop the gallery</PublicButton>}
                secondaryAction={<PublicButton href={ravenliaLinks.updates} external variant="secondary">Get updates</PublicButton>}
            />

            <PageShell className="pt-8">
                <section className="grid grid-cols-1 gap-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
                    <LinkCard
                        title="Shop"
                        body="Browse available pieces from the public RavenPOS storefront."
                        icon={<ShoppingBag className="h-5 w-5" />}
                        to="/shop"
                    />
                    <LinkCard
                        title="Events"
                        body="Watch for classes, wellness sessions, and open house gatherings."
                        icon={<CalendarDays className="h-5 w-5" />}
                        to="/events"
                    />
                    <LinkCard
                        title="Vendors"
                        body="Apply to bring your handmade, local, or Appalachian goods into the galleria."
                        icon={<Users className="h-5 w-5" />}
                        to="/vendors"
                    />
                    <LinkCard
                        title="Alywillow"
                        body="Explore plant-based products made on site in small batches."
                        icon={<Leaf className="h-5 w-5" />}
                        href={ravenliaLinks.alywillow}
                        external
                    />
                </section>

                <FeatureRow
                    eyebrow="Now open"
                    title="A living gallery, booth by booth."
                    body="Each booth is independently curated. Every vendor carries a distinct voice and vision, creating a store that keeps unfolding with handcrafted goods, rare finds, natural products, and local character."
                    image={ravenliaImages.handmadeGallery}
                    action={<PublicButton to="/our-story" variant="secondary">Read the story</PublicButton>}
                />

                <section className="py-12">
                    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="ravenlia-eyebrow mb-2">Discover</p>
                            <h2 className="ravenlia-display text-3xl text-[var(--color-foreground)] sm:text-5xl">What you will find here</h2>
                        </div>
                        <PublicButton to="/shop" variant="quiet">Browse current items</PublicButton>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {shoppingHighlights.map((item) => (
                            <article key={item.title} className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-gallery)]">
                                <img src={item.image.src} alt={item.image.alt} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                                <div className="p-5">
                                    <h3 className="text-lg text-[var(--color-foreground)]">{item.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{item.text}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <FeatureRow
                    eyebrow="Community"
                    title="A stop between Galax and the Blue Ridge Parkway."
                    body="Ravenlia is designed to enrich daily life for the local community while giving travelers a memorable place to wander, discover, and stay awhile."
                    image={ravenliaImages.directions}
                    imageSide="left"
                    action={<PublicButton to="/contact" variant="secondary">Plan your visit</PublicButton>}
                />

                <CtaBand
                    title="Come wander. Come discover. Come stay awhile."
                    body="Join the email list for new vendors, upcoming events, classes, and special offerings."
                    primary={<PublicButton href={ravenliaLinks.updates} external>Get updates</PublicButton>}
                    secondary={<PublicButton to="/contact" variant="secondary">Contact us</PublicButton>}
                />

                <LocationHours />

                <section className="py-12 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)]">
                        <Heart className="h-6 w-6" />
                    </div>
                    <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--color-muted)]">
                        Every time you shop with Ravenlia, you support a gallery of small businesses and local families building something lasting together.
                    </p>
                </section>
            </PageShell>
        </div>
    );
}
