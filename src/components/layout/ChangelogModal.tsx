import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Changelog - Version 0.1.1"
            description="Here's what's new in this update:"
            size="lg"
        >
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-3">
                    <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                        <span className="p-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <PlusIcon className="w-4 h-4" />
                        </span>
                        New Features
                    </h3>
                    <div className="space-y-4 pl-2">
                        <div className="space-y-1">
                            <h4 className="font-medium text-sm text-[var(--color-foreground)]">Public Storefront</h4>
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                                Launched a comprehensive public storefront allowing customers to browse full store inventory by vendor and category.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <h4 className="font-medium text-sm text-[var(--color-foreground)]">Vendor Portal & Management</h4>
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                                Introduced a dedicated portal for vendors to manage inventory, view real-time analytics, track payouts, and identify returning customers. Admins can now generate vendor credentials.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <h4 className="font-medium text-sm text-[var(--color-foreground)]">Consignor Functionality</h4>
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                                Added support for complicated commission splits, monthly booth charges, and customer sales tracking.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <h4 className="font-medium text-sm text-[var(--color-foreground)]">Admin Dashboard Enhancements</h4>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                <li><span className="font-medium">Live Analytics:</span> Real-time tracking of sales and performance.</li>
                                <li><span className="font-medium">Payouts Page:</span> Centralized view for tracking owed amounts, store splits, and taxes with easy reconciliation.</li>
                                <li><span className="font-medium">Sales Tracking:</span> dedicated page for detailed sales monitoring.</li>
                            </ul>
                        </div>

                        <div className="space-y-1">
                            <h4 className="font-medium text-sm text-[var(--color-foreground)]">Payment Integration</h4>
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                                Added a simulated Stripe Terminal card reader to the checkout process, allowing for full end-to-end testing of integrated credit card payments without requiring physical hardware.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <h4 className="font-medium text-sm text-[var(--color-foreground)]">General Improvements</h4>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                <li>Added image upload capability for inventory items.</li>
                                <li>Implemented customer account functionality.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                        <span className="p-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <WrenchIcon className="w-4 h-4" />
                        </span>
                        Bug Fixes
                    </h3>
                    <ul className="list-disc pl-9 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                        <li>Fixed image uploads not saving when vendors create new items.</li>
                        <li>Resolved an issue with autofocus behavior during checkout.</li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                        <span className="p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            <SparklesIcon className="w-4 h-4" />
                        </span>
                        Improvements
                    </h3>
                    <ul className="list-disc pl-9 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                        <li>Added image thumbnails to inventory lists for both admin and vendor views.</li>
                        <li>Redesigned the admin item edit modal with a compact 3-column layout.</li>
                    </ul>
                </div>

                <div className="flex justify-end pt-4 mt-6 border-t border-[var(--color-border)]">
                    <Button onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
}

function PlusIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}

function WrenchIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
    )
}

function SparklesIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
            <path d="M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" />
            <path d="M19 11h2m-1 -1v2" />
        </svg>
    )
}
