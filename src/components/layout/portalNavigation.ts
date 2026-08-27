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
    Settings2,
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
        name: 'Relationships',
        icon: ContactRound,
        children: [
            { name: 'Consignors', href: '/admin/consignors', icon: Store },
            { name: 'Customers', href: '/admin/customers', icon: Users },
            { name: 'Dealers', href: '/admin/dealers', icon: ContactRound },
            { name: 'Purchase from dealer', href: '/admin/dealers/purchases', icon: HandCoins },
        ],
    },
    {
        name: 'Transactions',
        icon: ReceiptText,
        children: [
            { name: 'Sales', href: '/admin/sales', icon: History },
            { name: 'Payouts', href: '/admin/payouts', icon: Banknote },
            { name: 'Invoices', href: '/admin/finances/invoices', icon: FileText },
        ],
    },
    {
        name: 'Team',
        icon: Users,
        children: [
            { name: 'Timecards', href: '/admin/employees', icon: Users },
            { name: 'Schedule', href: '/admin/employees/schedule', icon: CalendarDays },
            { name: 'Payroll', href: '/admin/employees/payroll', icon: BadgeDollarSign },
            { name: 'Roles', href: '/admin/employees/roles', icon: ShieldCheck },
        ],
    },
    {
        name: 'Reports & finance',
        icon: WalletCards,
        children: [
            { name: 'Till floats', href: '/admin/finances/till-floats', icon: CircleDollarSign },
            { name: 'Tax reports', href: '/admin/finances/tax-reports', icon: FileText },
            { name: 'Categories & tax', href: '/admin/finances/categories', icon: Percent },
            { name: 'Marketing fees', href: '/admin/finances/marketing-fees', icon: Megaphone },
        ],
    },
    {
        name: 'Operations',
        icon: Settings2,
        children: [
            { name: 'Messages', href: '/admin/messages', icon: MessageSquare },
            { name: 'Email campaigns', href: '/admin/email-campaigns', icon: Mail },
            { name: 'Integrations', href: '/admin/integrations', icon: Plug },
            { name: 'Shopify setup', href: '/admin/shopify-setup', icon: Store },
        ],
    },
    { name: 'Profile & settings', href: '/admin/profile', icon: UserCircle },
];

export const employeeNavigation: PortalNavItem[] = [
    { name: 'Point of Sale', href: '/employee/pos', icon: ShoppingCart, emphasis: 'primary' },
    { name: 'Inventory', href: '/employee/inventory', icon: Package },
    { name: 'Add products', href: '/employee/add-items', icon: PlusCircle },
    { name: 'Till count', href: '/employee/till-count', icon: CircleDollarSign },
    { name: 'Sales', href: '/employee/sales', icon: ReceiptText },
    { name: 'Customers', href: '/employee/customers', icon: Users },
    { name: 'Labels', href: '/employee/labels', icon: Barcode },
    { name: 'Schedule', href: '/employee/schedule', icon: CalendarDays },
    { name: 'Messages', href: '/employee/messages', icon: MessageSquare },
    { name: 'Profile', href: '/employee/profile', icon: UserCircle },
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
    { name: 'Profile', href: '/vendor/profile', icon: UserCircle },
];

export function pathIsActive(pathname: string, href: string): boolean {
    if (href === '/admin' || href === '/vendor') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
}
