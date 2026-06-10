import { Camera, ClipboardList, Mail, Sparkles } from 'lucide-react';
import { CtaBand, FeatureRow, LinkCard, PageHeader, PageShell, PublicButton } from '../../components/storefront/RavenliaPageSections';
import { ravenliaImages, ravenliaLinks, vendorCrafts } from '../../content/ravenliaSite';

export function RavenliaVendorsPage() {
    return (
        <div className="animate-fadeIn">
            <PageShell>
                <PageHeader
                    eyebrow="Vendors"
                    title="Calling creators, makers, and decorators."
                    body="Ravenlia is building a curated consignment marketplace for handcrafted goods, Appalachian crafts, primitives, natural products, art, foods, and uncommon finds."
                />

                <FeatureRow
                    eyebrow="Your galleria awaits"
                    title="Turn your passion into your business."
                    body="We have shelves, flat walls, and boutique spaces for rent. You set up your area to show off your creations, and your items are sold on consignment without requiring you to be in the store every day."
                    image={ravenliaImages.turtleArt}
                    action={<PublicButton href={ravenliaLinks.vendorApplication} external>Fill out the application</PublicButton>}
                />

                <section className="grid grid-cols-1 gap-4 py-10 md:grid-cols-3">
                    <LinkCard
                        title="Apply"
                        body="Complete the consignment application so Ravenlia can learn about your work."
                        icon={<ClipboardList className="h-5 w-5" />}
                        href={ravenliaLinks.vendorApplication}
                        external
                    />
                    <LinkCard
                        title="Send photos"
                        body="Email product and booth-style photos to ravenliagalleria@gmail.com."
                        icon={<Camera className="h-5 w-5" />}
                        href={ravenliaLinks.vendorPhotosEmail}
                    />
                    <LinkCard
                        title="Ask a question"
                        body="Reach out if you want to understand fit, space, or next steps."
                        icon={<Mail className="h-5 w-5" />}
                        to="/contact"
                    />
                </section>

                <section className="grid grid-cols-1 gap-8 py-12 lg:grid-cols-[0.85fr_1.15fr]">
                    <div>
                        <p className="ravenlia-eyebrow mb-3">What fits</p>
                        <h2 className="ravenlia-display text-3xl leading-tight text-[var(--color-foreground)] sm:text-5xl">A large variety of handcrafted goodness.</h2>
                        <p className="mt-5 text-lg leading-relaxed text-[var(--color-muted)]">
                            Space is limited, with preference for local makers, natural items, handmade work, primitives, and Appalachian-themed goods.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {vendorCrafts.map((craft) => (
                            <div key={craft} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5 shadow-[var(--shadow-gallery)]">
                                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)]">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <p className="text-sm leading-relaxed text-[var(--color-muted)]">{craft}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <FeatureRow
                    eyebrow="The basics"
                    title="Keep your area fresh, inviting, and distinctly yours."
                    body="A rotation of products helps each booth stay clean, fresh, and worth revisiting. Whether you are new or experienced in retail, Ravenlia is designed for focused makers who want to grow with a community."
                    image={ravenliaImages.handmadeGallery}
                    imageSide="left"
                />

                <CtaBand
                    title="Ready to share your work?"
                    body="Start with the application, then email photos so the Ravenlia team can review your products and setup."
                    primary={<PublicButton href={ravenliaLinks.vendorApplication} external>Apply now</PublicButton>}
                    secondary={<PublicButton href={ravenliaLinks.vendorPhotosEmail} variant="secondary">Email photos</PublicButton>}
                />
            </PageShell>
        </div>
    );
}
