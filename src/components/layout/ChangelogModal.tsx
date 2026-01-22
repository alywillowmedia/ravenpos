import { useState } from 'react';
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
            title="What's New"
            description="The latest updates and improvements to RavenPOS."
            size="lg"
        >
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">

                {/* Version 0.1.5 */}
                <ChangelogSection version="0.1.5" date="Current" defaultOpen={true}>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                                <span className="p-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <PlusIcon className="w-4 h-4" />
                                </span>
                                New Features
                            </h3>
                            <div className="space-y-4 pl-2">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Inventory & Scanning</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Scan Actions:</span> Added ability to scan items in and out of inventory.</li>
                                        <li><span className="font-medium">Vendor Uploads:</span> Vendors can now upload CSV files directly.</li>
                                        <li><span className="font-medium">Label Printing:</span> Integrated label printing functionality.</li>
                                    </ul>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Employee Management</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Employment Details:</span> Added "Employment From" (Alywillow/Ravenlia) and "Employee Type" (Production/Sales).</li>
                                        <li><span className="font-medium">Time Tracking:</span> Auto-deduct 30-minute lunch break for shifts over 6 hours.</li>
                                    </ul>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">System & Payouts</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Customer Display:</span> New customer-facing display view.</li>
                                        <li><span className="font-medium">Custom Payouts:</span> Support for custom payout amounts.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                                <span className="p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                    <SparklesIcon className="w-4 h-4" />
                                </span>
                                Improvements
                            </h3>
                            <div className="space-y-4 pl-2">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">UX Enhancements</h4>
                                    <p className="text-sm text-[var(--color-muted-foreground)]">
                                        Minor visual adjustments for ease of use and clarity.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </ChangelogSection>

                {/* Version 0.1.4 */}
                <ChangelogSection version="0.1.4" date="Previous">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                                <span className="p-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <PlusIcon className="w-4 h-4" />
                                </span>
                                New Features
                            </h3>
                            <div className="space-y-4 pl-2">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Integrated Refund System</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">POS Refunds:</span> Refund items directly from the POS interface.</li>
                                        <li><span className="font-medium">Financial Accuracy:</span> Refunds automatically subtract from vendor payouts, total revenue, and tax calculations.</li>
                                        <li><span className="font-medium">Multi-Method:</span> Supports both Card and Cash refund processing.</li>
                                        <li><span className="font-medium">Digital Receipts:</span> Optional email and print capabilities for refund receipts.</li>
                                    </ul>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Checkout Discounts</h4>
                                    <p className="text-sm text-[var(--color-muted-foreground)]">
                                        Added the ability to apply discounts during checkout, supporting item-level, cart-total, or combined discounts.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                                <span className="p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                    <SparklesIcon className="w-4 h-4" />
                                </span>
                                Improvements
                            </h3>
                            <div className="space-y-4 pl-2">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Sidebar Navigation</h4>
                                    <p className="text-sm text-[var(--color-muted-foreground)]">
                                        Reorganized sidebar items into "Inventory" and "Finances" dropdowns for better organization and cleaner UI.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Label Tracking</h4>
                                    <p className="text-sm text-[var(--color-muted-foreground)]">
                                        Redesigned label tracking to use "unlabeled quantity", ensuring new and refunded inventory is correctly marked for labeling.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Inventory Management</h4>
                                    <p className="text-sm text-[var(--color-muted-foreground)]">
                                        Added capability to bulk edit items for more efficient inventory updates.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Label Printing</h4>
                                    <p className="text-sm text-[var(--color-muted-foreground)]">
                                        Added functionality to apply a single custom quantity to all selected labels at once.
                                    </p>
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
                                <li>Fixed an issue where Shopify inventory wouldn't update after a refund in RavenPOS.</li>
                            </ul>
                        </div>
                    </div>
                </ChangelogSection>

                {/* Version 0.1.3 */}
                <ChangelogSection version="0.1.3" date="Previous">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                                <span className="p-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <PlusIcon className="w-4 h-4" />
                                </span>
                                New Features
                            </h3>
                            <div className="space-y-4 pl-2">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Enhanced CSV Imports</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Image Support:</span> Added ability to include image URLs in CSV imports.</li>
                                        <li><span className="font-medium">One-Time Shopify Import:</span> Simplified import process for vendors to bring online Shopify inventory into the store without manual entry.</li>
                                    </ul>
                                </div>

                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Shopify Syncing Integration</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Import:</span> Pull products directly from Shopify via the new "Integrations" page.</li>
                                        <li><span className="font-medium">Force Sync:</span> Manually trigger updates from Shopify to RavenPOS to resolve discrepancies.</li>
                                        <li><span className="font-medium">Auto-Sync:</span> Automatic two-way synchronization for sales and quantity changes.</li>
                                        <li><span className="font-medium">Management UI:</span> User-friendly interface for managing sync settings, replacing hard-coded configurations.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </ChangelogSection>

                {/* Version 0.1.2 */}
                <ChangelogSection version="0.1.2" date="Previous">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-[var(--color-foreground)] flex items-center gap-2">
                                <span className="p-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <PlusIcon className="w-4 h-4" />
                                </span>
                                New Features
                            </h3>
                            <div className="space-y-4 pl-2">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Receipt System Overhaul</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Email Receipts:</span> Integrated Resend for reliable email delivery (currently using <code>email@ravenlia.com</code>).</li>
                                        <li><span className="font-medium">Print Receipts:</span> Added PDF generation that mirrors physical print output. Ready for physical printer testing.</li>
                                    </ul>
                                </div>

                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-[var(--color-foreground)]">Employee Management System</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-muted-foreground)]">
                                        <li><span className="font-medium">Employee View:</span> A restricted interface limiting access to essential functions (POS, Customers, Labels) while protecting sensitive business data.</li>
                                        <li><span className="font-medium">Pin Access:</span> Secure 4-digit PIN system for employee clock-in/out and system access.</li>
                                        <li><span className="font-medium">Admin Controls:</span> Comprehensive tools to add employees, manage PINs, track hours, and monitor payroll.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </ChangelogSection>

                {/* Version 0.1.1 */}
                <ChangelogSection version="0.1.1" date="Previous">
                    <div className="space-y-6">
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
                                <li>Fixed Chrome-specific infinite loading issue caused by blocking auth state.</li>
                                <li>Fixed React setState-during-render error in Login page that caused cascading re-renders.</li>
                                <li>Fixed Dashboard quick action buttons navigating to wrong routes.</li>
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
                                <li>Improved app performance with non-blocking auth loading — pages now render faster.</li>
                                <li>Added session recovery option for users stuck in broken auth states.</li>
                            </ul>
                        </div>
                    </div>
                </ChangelogSection>

                <div className="flex justify-end pt-4 mt-6 border-t border-[var(--color-border)]">
                    <Button onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
}

interface ChangelogSectionProps {
    version: string;
    date?: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

function ChangelogSection({ version, date, children, defaultOpen = false }: ChangelogSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-bg-subtle)]/30">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDownIcon className="w-5 h-5 text-[var(--color-muted-foreground)]" /> : <ChevronRightIcon className="w-5 h-5 text-[var(--color-muted-foreground)]" />}
                    <div>
                        <span className="font-semibold text-[var(--color-foreground)]">v{version}</span>
                        {date && <span className="ml-2 text-sm text-[var(--color-muted-foreground)]">({date})</span>}
                    </div>
                </div>
            </button>
            {isOpen && (
                <div className="p-4 bg-[var(--color-background)] border-t border-[var(--color-border)]">
                    {children}
                </div>
            )}
        </div>
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

function ChevronDownIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M6 9l6 6 6-6" />
        </svg>
    )
}

function ChevronRightIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M9 18l6-6-6-6" />
        </svg>
    )
}
