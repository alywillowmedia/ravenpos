import { LATEST_RELEASE, type WhatsNewRole } from '../../lib/whatsNew';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface WhatsNewModalProps {
    isOpen: boolean;
    onClose: () => void;
    role: WhatsNewRole;
}

export function WhatsNewModal({ isOpen, onClose, role }: WhatsNewModalProps) {
    const notes = LATEST_RELEASE.notes[role];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="What's new"
            description={`Version ${LATEST_RELEASE.version}`}
            size="md"
        >
            <ul className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {notes.map((note) => (
                    <li key={note.title}>
                        <p className="text-sm font-semibold text-[var(--color-foreground)]">{note.title}</p>
                        <p className="mt-1 text-sm text-[var(--color-muted)]">{note.body}</p>
                    </li>
                ))}
            </ul>
            <div className="mt-6 flex justify-end">
                <Button variant="primary" onClick={onClose}>Got it</Button>
            </div>
        </Modal>
    );
}
