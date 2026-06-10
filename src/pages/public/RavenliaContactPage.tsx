import { Mail, MapPin, Phone } from 'lucide-react';
import { FeatureRow, LinkCard, LocationHours, PageHeader, PageShell, PublicButton } from '../../components/storefront/RavenliaPageSections';
import { ravenliaContact, ravenliaImages, ravenliaLinks } from '../../content/ravenliaSite';

export function RavenliaContactPage() {
    return (
        <div className="animate-fadeIn">
            <PageShell>
                <PageHeader
                    eyebrow="Contact"
                    title="Plan a visit or send us a note."
                    body="Questions, suggestions, vendor interest, event questions, and directions all start here. No solicitations, please."
                />

                <section className="grid grid-cols-1 gap-4 py-8 md:grid-cols-3">
                    <LinkCard
                        title="Call"
                        body={ravenliaContact.phoneDisplay}
                        icon={<Phone className="h-5 w-5" />}
                        href={ravenliaLinks.phone}
                    />
                    <LinkCard
                        title="Email"
                        body={ravenliaContact.emailDisplay}
                        icon={<Mail className="h-5 w-5" />}
                        href={ravenliaLinks.email}
                    />
                    <LinkCard
                        title="Directions"
                        body="Open Ravenlia Galleria in Google Maps."
                        icon={<MapPin className="h-5 w-5" />}
                        href={ravenliaLinks.maps}
                        external
                    />
                </section>

                <FeatureRow
                    eyebrow="Directions"
                    title="Located between Galax and the Blue Ridge Parkway."
                    body="Find Ravenlia Galleria at 682 Skyline Hwy, Galax, VA 24333. Stop by for the gallery, Alywillow products, local market goods, and whatever new pieces have arrived since your last visit."
                    image={ravenliaImages.directions}
                    action={<PublicButton href={ravenliaLinks.maps} external>Open maps</PublicButton>}
                />

                <LocationHours />
            </PageShell>
        </div>
    );
}
