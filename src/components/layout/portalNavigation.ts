import type { LucideIcon } from 'lucide-react';
import {
    BadgeDollarSign,
    Banknote,
    Barcode,
    CalendarDays,
    CircleDollarSign,
    ContactRound,
    FileSpreadsheet,
    FileText,
    HandCoins,
    History,
    LayoutDashboard,
    Mail,
    Megaphone,
    MessageSquare,
    Package,
    Percent,
    Plug,
    PlusCircle,
    ReceiptText,
    ScanLine,
    ShieldCheck,
    ShoppingCart,
    Store,
    Tags,
    UserCircle,
    Users,
    WalletCards,
} from 'lucide-react';

export interface PortalNavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    description?: string;
    emphasis?: 'primary';
    placement?: 'footer';
}

export interface PortalNavGroup {
    name: string;
    icon: LucideIcon;
    children: PortalNavItem[];
}

export type PortalNavEntry = PortalNavItem | PortalNavGroup;

export function isNavGroup(entry: PortalNavEntry): entry is PortalNavGroup {
    return 'children' in entry;
}

export const adminNavigation: PortalNavEntry[] = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Point of Sale', href: '/admin/pos', icon: ShoppingCart, emphasis: 'primary' },
    { name: 'Sales history', href: '/admin/sales', icon: History },
    {
        name: 'Inventory',
        icon: Package,
        children: [
            { name: 'Products', href: '/admin/inventory', icon: Package },
            { name: 'Add products', href: '/admin/add-items', icon: PlusCircle },
            { name: 'Scan in / out', href: '/admin/scan', icon: ScanLine },
            { name: 'Import CSV', href: '/admin/import', icon: FileSpreadsheet },
            { name: 'Labels', href: '/admin/labels', icon: Tags },
        ],
    },
    {
        name: 'People',
        icon: ContactRound,
        children: [
            { name: 'Consignors', href: '/admin/consignors', icon: Store },
            { name: 'Customers', href: '/admin/customers', icon: Users },
            { name: 'Dealers', href: '/admin/dealers', icon: ContactRound },
            { name: 'Purchase from dealer', href: '/admin/dealers/purchases', icon: HandCoins },
        ],
    },
    {
        name: 'Money',
        icon: WalletCards,
        children: [
            { name: 'Vendor payouts', href: '/admin/payouts', icon: Banknote },
            { name: 'Payroll', href: '/admin/employees/payroll', icon: BadgeDollarSign },
            { name: 'Invoices', href: '/admin/finances/invoices', icon: FileText },
            { name: 'Till floats', href: '/admin/finances/till-floats', icon: CircleDollarSign },
            { name: 'Tax reports', href: '/admin/finances/tax-reports', icon: FileText },
            { name: 'Categories & tax', href: '/admin/finances/categories', icon: Percent },
            { name: 'Marketing fees', href: '/admin/finances/marketing-fees', icon: Megaphone },
        ],
    },
    {
        name: 'Team',
        icon: Users,
        children: [
            { name: 'Timecards', href: '/admin/employees', icon: Users },
            { name: 'Schedule', href: '/admin/employees/schedule', icon: CalendarDays },
            { name: 'Roles', href: '/admin/employees/roles', icon: ShieldCheck },
        ],
    },
    {
        name: 'Store',
        icon: Store,
        children: [
            { name: 'Messages', href: '/admin/messages', icon: MessageSquare },
            { name: 'Email campaigns', href: '/admin/email-campaigns', icon: Mail },
            { name: 'Integrations', href: '/admin/integrations', icon: Plug },
            { name: 'Shopify setup', href: '/admin/shopify-setup', icon: Store },
        ],
    },
    { name: 'Profile & settings', href: '/admin/profile', icon: UserCircle, placement: 'footer' },
];

export const employeeNavigation: PortalNavEntry[] = [
    { name: 'Point of Sale', href: '/employee/pos', icon: ShoppingCart, emphasis: 'primary' },
    { name: 'Inventory', href: '/employee/inventory', icon: Package },
    { name: 'Add products', href: '/employee/add-items', icon: PlusCircle },
    { name: 'Till count', href: '/employee/till-count', icon: CircleDollarSign },
    { name: 'Sales', href: '/employee/sales', icon: ReceiptText },
    {
        name: 'People',
        icon: ContactRound,
        children: [
            { name: 'Consignors', href: '/employee/consignors', icon: Store },
            { name: 'Customers', href: '/employee/customers', icon: Users },
            { name: 'Dealers', href: '/employee/dealers', icon: ContactRound },
            { name: 'Purchase from dealer', href: '/employee/dealers/purchases', icon: HandCoins },
        ],
    },
    { name: 'Labels', href: '/employee/labels', icon: Barcode },
    { name: 'Schedule', href: '/employee/schedule', icon: CalendarDays },
    { name: 'Messages', href: '/employee/messages', icon: MessageSquare },
    { name: 'Profile', href: '/employee/profile', icon: UserCircle, placement: 'footer' },
];

export const vendorNavigation: PortalNavItem[] = [
    { name: 'Overview', href: '/vendor', icon: LayoutDashboard },
    { name: 'My inventory', href: '/vendor/inventory', icon: Package },
    { name: 'Import CSV', href: '/vendor/import', icon: FileSpreadsheet },
    { name: 'Print labels', href: '/vendor/labels', icon: Tags },
    { name: 'My sales', href: '/vendor/sales', icon: ReceiptText },
    { name: 'My payouts', href: '/vendor/payouts', icon: Banknote },
    { name: 'Storefront', href: '/vendor/storefront', icon: Store },
    { name: 'Messages', href: '/vendor/messages', icon: MessageSquare },
    { name: 'Profile', href: '/vendor/profile', icon: UserCircle, placement: 'footer' },
];

export function pathIsActive(pathname: string, href: string): boolean {
    if (href === '/admin' || href === '/vendor') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveHref(pathname: string, entries: PortalNavEntry[]): string | null {
    const hrefs = entries.flatMap((entry) => isNavGroup(entry) ? entry.children.map((item) => item.href) : [entry.href]);
    const matches = hrefs.filter((href) => pathIsActive(pathname, href));
    return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function getBreadcrumb(pathname: string, entries: PortalNavEntry[]): string[] {
    const activeHref = getActiveHref(pathname, entries);
    for (const entry of entries) {
        if (!isNavGroup(entry)) {
            if (entry.href === activeHref) return [entry.name];
            continue;
        }
        const child = entry.children.find((item) => item.href === activeHref);
        if (child) return [entry.name, child.name];
    }
    return [];
}

export function getAdminMobileSections(entries: PortalNavEntry[]): Array<{ name: string; items: PortalNavItem[] }> {
    const topLevel = entries.filter((entry): entry is PortalNavItem => !isNavGroup(entry));
    return [
        { name: 'Overview', items: topLevel.filter((item) => item.placement !== 'footer') },
        ...entries.filter(isNavGroup).map((group) => ({ name: group.name, items: group.children })),
        { name: 'Settings', items: topLevel.filter((item) => item.placement === 'footer') },
    ];
}

export function shouldCloseFlyoutOnClick(isOpen: boolean, openedByThisPress: boolean): boolean {
    return isOpen && !openedByThisPress;
}

export function isRegisterRoute(pathname: string): boolean {
    return pathIsActive(pathname, '/admin/pos') || pathIsActive(pathname, '/employee/pos');
}

export function resolveSidebarState(savedCollapsed: boolean, pathname: string): { isCollapsed: boolean; canToggle: boolean } {
    const onRegister = isRegisterRoute(pathname);
    return { isCollapsed: savedCollapsed || onRegister, canToggle: !onRegister };
}
