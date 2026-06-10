import { CalendarDays, Mail, MapPin } from 'lucide-react';
import { CtaBand, FeatureRow, LinkCard, LocationHours, PageHeader, PageShell, PublicButton } from '../../components/storefront/RavenliaPageSections';
import { ravenliaImages, ravenliaLinks } from '../../content/ravenliaSite';

export function RavenliaEventsPage() {
    return (
        <div className="animate-fadeIn">
            <PageShell>
                <PageHeader
                    eyebrow="Events"
                    title="Classes and gatherings are coming soon."
                    body="Events on natural living, eating for wellness, skincare, and Alywillow open house parties will be hosted inside Ravenlia Galleria."
                />

                <FeatureRow
                    title="A place to learn, gather, and linger."
                    body="Our classrooms are located inside Ravenlia Galleria at 682 Skyline Hwy in Galax. Join the update list to hear when new classes, vendor events, and promotional offers are announced."
                    image={ravenliaImages.frontDoor}
                    action={<PublicButton href={ravenliaLinks.events} external>See scheduled events</PublicButton>}
                />

                <section className="grid grid-cols-1 gap-4 py-10 md:grid-cols-3">
                    <LinkCard
                        title="Scheduled events"
                        body="Open the current Ravenlia Eventcube schedule in a new tab."
                        icon={<CalendarDays className="h-5 w-5" />}
                        href={ravenliaLinks.events}
                        external
                    />
                    <LinkCard
                        title="Get updates"
                        body="Join the email list for event announcements, vendor news, and new offerings."
                        icon={<Mail className="h-5 w-5" />}
                        href={ravenliaLinks.updates}
                        external
                    />
                    <LinkCard
                        title="Visit the classroom"
                        body="Find directions to Ravenlia Galleria between Galax and the Blue Ridge Parkway."
                        icon={<MapPin className="h-5 w-5" />}
                        href={ravenliaLinks.maps}
                        external
                    />
                </section>

                <CtaBand
                    title="Want to know when the next class opens?"
                    body="The email list is the best place to follow classes, Alywillow events, new vendors, and seasonal offerings."
                    primary={<PublicButton href={ravenliaLinks.updates} external>Get updates</PublicButton>}
                    secondary={<PublicButton to="/contact" variant="secondary">Ask a question</PublicButton>}
                />

                <LocationHours />
            </PageShell>
        </div>
    );
}
