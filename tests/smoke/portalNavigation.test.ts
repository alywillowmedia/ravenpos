import { describe, expect, it } from 'vitest';
import {
    adminNavigation,
    employeeNavigation,
    isNavGroup,
    pathIsActive,
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
        const relationships = employeeNavigation.find((entry) => entry.name === 'Relationships');
        expect(relationships && isNavGroup(relationships) ? relationships.children.map((item) => item.href) : []).toEqual([
            '/employee/consignors',
            '/employee/customers',
            '/employee/dealers',
        ]);
    });

    it('does not mark sibling sections active', () => {
        expect(pathIsActive('/admin/inventory/123', '/admin/inventory')).toBe(true);
        expect(pathIsActive('/admin/inventory', '/admin')).toBe(false);
        expect(pathIsActive('/vendor/sales', '/vendor')).toBe(false);
        expect(pathIsActive('/employee/sales', '/employee/pos')).toBe(false);
    });
});
