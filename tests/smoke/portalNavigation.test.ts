import { describe, expect, it } from 'vitest';
import {
    adminNavigation,
    employeeNavigation,
    getActiveHref,
    getBreadcrumb,
    isNavGroup,
    isRegisterRoute,
    pathIsActive,
    resolveSidebarState,
    vendorNavigation,
} from '../../src/components/layout/portalNavigation';

const flattenAdminHrefs = () => adminNavigation.flatMap((entry) => (
    isNavGroup(entry) ? entry.children.map((item) => item.href) : [entry.href]
));

describe('portal navigation registry', () => {
    it('keeps every portal destination unique', () => {
        for (const hrefs of [flattenAdminHrefs(), employeeNavigation.flatMap((entry) => isNavGroup(entry) ? entry.children.map((item) => item.href) : [entry.href]), vendorNavigation.map((item) => item.href)]) {
            expect(new Set(hrefs).size).toBe(hrefs.length);
        }
    });

    it('includes the core operational destinations', () => {
        expect(flattenAdminHrefs()).toEqual(expect.arrayContaining([
            '/admin',
            '/admin/pos',
            '/admin/inventory',
            '/admin/consignors',
            '/admin/sales',
            '/admin/employees',
            '/admin/messages',
            '/admin/profile',
        ]));
        expect(employeeNavigation.flatMap((entry) => isNavGroup(entry) ? entry.children.map((item) => item.href) : [entry.href])).toContain('/employee/till-count');
        expect(vendorNavigation.map((item) => item.href)).toContain('/vendor/storefront');
    });

    it('groups all employee relationships inside the employee portal', () => {
        const people = employeeNavigation.find((entry) => entry.name === 'People');
        expect(people && isNavGroup(people) ? people.children.map((item) => item.href) : []).toEqual([
            '/employee/consignors',
            '/employee/customers',
            '/employee/dealers',
            '/employee/dealers/purchases',
        ]);
    });

    it('keeps every admin destination after the regroup', () => {
        expect(flattenAdminHrefs().sort()).toEqual([
            '/admin',
            '/admin/add-items',
            '/admin/consignors',
            '/admin/customers',
            '/admin/dealers',
            '/admin/dealers/purchases',
            '/admin/email-campaigns',
            '/admin/employees',
            '/admin/employees/payroll',
            '/admin/employees/roles',
            '/admin/employees/schedule',
            '/admin/finances/categories',
            '/admin/finances/invoices',
            '/admin/finances/marketing-fees',
            '/admin/finances/tax-reports',
            '/admin/finances/till-floats',
            '/admin/import',
            '/admin/integrations',
            '/admin/inventory',
            '/admin/labels',
            '/admin/messages',
            '/admin/payouts',
            '/admin/pos',
            '/admin/profile',
            '/admin/sales',
            '/admin/scan',
            '/admin/shopify-setup',
        ]);
    });

    it('uses the new admin grouping', () => {
        expect(adminNavigation.map((entry) => entry.name)).toEqual([
            'Dashboard',
            'Point of Sale',
            'Sales history',
            'Inventory',
            'People',
            'Money',
            'Team',
            'Store',
            'Profile & settings',
        ]);
    });

    it('marks only the deepest matching item active', () => {
        expect(getActiveHref('/admin/employees/payroll/123', adminNavigation)).toBe('/admin/employees/payroll');
        expect(getActiveHref('/admin/dealers/purchases', adminNavigation)).toBe('/admin/dealers/purchases');
        expect(getActiveHref('/admin', adminNavigation)).toBe('/admin');
        expect(getActiveHref('/somewhere', adminNavigation)).toBeNull();
    });

    it('builds breadcrumbs from the nav', () => {
        expect(getBreadcrumb('/admin/employees/payroll/123', adminNavigation)).toEqual(['Money', 'Payroll']);
        expect(getBreadcrumb('/admin/payouts/vendor/abc', adminNavigation)).toEqual(['Money', 'Vendor payouts']);
        expect(getBreadcrumb('/admin', adminNavigation)).toEqual(['Dashboard']);
        expect(getBreadcrumb('/vendor/payouts', vendorNavigation)).toEqual(['My payouts']);
        expect(getBreadcrumb('/somewhere', adminNavigation)).toEqual([]);
    });

    it('forces the rail on the register without touching the saved choice', () => {
        expect(isRegisterRoute('/employee/pos')).toBe(true);
        expect(isRegisterRoute('/admin/sales')).toBe(false);
        expect(resolveSidebarState(false, '/admin/pos')).toEqual({ isCollapsed: true, canToggle: false });
        expect(resolveSidebarState(false, '/admin/sales')).toEqual({ isCollapsed: false, canToggle: true });
        expect(resolveSidebarState(true, '/admin/sales')).toEqual({ isCollapsed: true, canToggle: true });
    });

    it('does not mark sibling sections active', () => {
        expect(pathIsActive('/admin/inventory/123', '/admin/inventory')).toBe(true);
        expect(pathIsActive('/admin/inventory', '/admin')).toBe(false);
        expect(pathIsActive('/vendor/sales', '/vendor')).toBe(false);
        expect(pathIsActive('/employee/sales', '/employee/pos')).toBe(false);
    });
});
