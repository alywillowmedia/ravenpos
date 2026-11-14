import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveSidebarState } from '../../src/components/layout/portalNavigation';

// Vitest runs in node with no DOM, so these read the component sources. The
// register route forces the sidebar into its collapsed rail, so anything the
// rail drops is unreachable from the page staff spend the day on.
const sidebar = readFileSync('src/components/layout/PortalSidebar.tsx', 'utf8');
const layout = readFileSync('src/components/layout/EmployeeLayout.tsx', 'utf8');
const widget = readFileSync('src/components/employee/ClockStatusWidget.tsx', 'utf8');

describe('clock in/out on the register', () => {
    it('the register still collapses the sidebar', () => {
        expect(resolveSidebarState(false, '/employee/pos').isCollapsed).toBe(true);
    });

    it('the collapsed sidebar keeps its footer slot', () => {
        expect(sidebar).not.toMatch(/!isCollapsed && footerSlot/);
        expect(sidebar).toMatch(/footerSlot\?\.\(isCollapsed\)/);
    });

    it('the employee portal hands the rail a compact clock widget', () => {
        expect(layout).toMatch(/footerSlot=\{\(isCollapsed\) => <ClockStatusWidget compact=\{isCollapsed\} \/>\}/);
    });

    it('the compact widget still offers both actions', () => {
        const compact = widget.slice(widget.indexOf('if (compact)'), widget.indexOf('// Full widget'));
        expect(compact).toMatch(/handleClockIn/);
        expect(compact).toMatch(/setShowConfirm\(true\)/);
        expect(compact).toMatch(/aria-label/);
    });
});
