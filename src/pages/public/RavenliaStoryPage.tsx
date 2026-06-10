import { Heart, Leaf, Mountain } from 'lucide-react';
import { CtaBand, FeatureRow, LinkCard, PageHeader, PageShell, PublicButton } from '../../components/storefront/RavenliaPageSections';
import { ravenliaImages, ravenliaLinks } from '../../content/ravenliaSite';

export function RavenliaStoryPage() {
    return (
        <div className="animate-fadeIn">
            <PageShell>
                <PageHeader
                    eyebrow="Our story"
                    title="A fusion of art, nature, and healthier options."
                    body="Ravenlia grew from the spark of an idea into a place to shop, learn, relax, and celebrate the handmade character of the Appalachian region."
                />

                <FeatureRow
                    eyebrow="Our vision"
                    title="A place where you can stay, relax, shop, and enjoy."
                    body="The vision is a galleria where you can grab a drink or snack, attend a class, browse booths and boutiques, and leave with something that enhances daily life and brings warmth to your home."
                    image={ravenliaImages.frontDoor}
                />

                <section className="grid grid-cols-1 gap-4 py-10 md:grid-cols-3">
                    <LinkCard
                        title="Art and craft"
                        body="Handmade goods, paintings, textiles, pottery, woodworking, primitives, and decor shaped by human hands."
                        icon={<Mountain className="h-5 w-5" />}
                        to="/shop"
                    />
                    <LinkCard
                        title="Natural living"
                        body="Alywillow products are made on site with pure plant ingredients and no synthetic additives."
                        icon={<Leaf className="h-5 w-5" />}
                        href={ravenliaLinks.alywillow}
                        external
                    />
                    <LinkCard
                        title="Community"
                        body="A place for makers, families, visitors, and locals to build a healthier local economy together."
                        icon={<Heart className="h-5 w-5" />}
                        to="/vendors"
                    />
                </section>

                <FeatureRow
                    eyebrow="How it started"
                    title="From Alywillow to a wider galleria."
                    body="Aliya Trinity spent years creating natural alternatives through Alywillow, including products now made on site behind the showroom. The old building between Galax and the Parkway became a chance to build something larger: a home for handcrafted goods, local vendors, classes, and thoughtful discovery."
                    image={ravenliaImages.aliya}
                    imageSide="left"
                    action={<PublicButton href={ravenliaLinks.alywillow} external variant="secondary">Visit Alywillow</PublicButton>}
                />

                <FeatureRow
                    eyebrow="Our commitment"
                    title="A standard of care that unfolds over time."
                    body="Ravenlia is built around high-quality products, honest work, customer care, and ethical business practices. The story will keep unfolding as vendors arrive, classes open, and the community grows."
                    image={ravenliaImages.vintageGoods}
                />

                <CtaBand
                    title="Ravenlia - more than you are expecting."
                    body="Browse online, visit in person, or apply to become part of the galleria."
                    primary={<PublicButton to="/shop">Shop now</PublicButton>}
                    secondary={<PublicButton to="/vendors" variant="secondary">Become a vendor</PublicButton>}
                />
            </PageShell>
        </div>
    );
}
