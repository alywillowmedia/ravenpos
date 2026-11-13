import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { LATEST_RELEASE, RELEASES, hasUnseenWhatsNew, markWhatsNewSeen } from '../../src/lib/whatsNew';

function memoryStore() {
    const data = new Map<string, string>();
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
    };
}

describe("what's new", () => {
    it('describes the version being shipped', () => {
        expect(LATEST_RELEASE.version).toBe(pkg.version);
    });

    it('has notes for every account type in every release', () => {
        for (const release of RELEASES) {
            for (const role of ['admin', 'employee', 'vendor'] as const) {
                expect(release.notes[role].length).toBeGreaterThan(0);
            }
        }
    });

    it('shows the dot until that account type opens the panel', () => {
        const store = memoryStore();
        expect(hasUnseenWhatsNew('vendor', store)).toBe(true);
        markWhatsNewSeen('vendor', store);
        expect(hasUnseenWhatsNew('vendor', store)).toBe(false);
        expect(hasUnseenWhatsNew('admin', store)).toBe(true);
    });

    it('shows the dot again after a newer release', () => {
        const store = memoryStore();
        store.setItem('whats-new-seen-admin', '3.11.0');
        expect(hasUnseenWhatsNew('admin', store)).toBe(true);
    });

    it('stays quiet when storage is unavailable', () => {
        const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
        expect(hasUnseenWhatsNew('employee', broken)).toBe(false);
        expect(() => markWhatsNewSeen('employee', broken)).not.toThrow();
    });
});
