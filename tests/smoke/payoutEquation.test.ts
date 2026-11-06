import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PayoutEquation, ReadinessBadge } from '../../src/components/payouts/PayoutLedgerUI';
import { LegacyNote } from '../../src/components/payouts/LegacyNote';

const lines = [
    { label: 'Carried in', amount: 10 },
    { label: 'Earned', amount: 400, sign: '+' as const },
    { label: 'Deductions', amount: 43, sign: '−' as const },
    { label: 'Payable', amount: 367, sign: '=' as const, strong: true },
];

describe('PayoutEquation', () => {
    it('renders labels, signs and money in order', () => {
        const html = renderToStaticMarkup(createElement(PayoutEquation, { lines }));
        const positions = ['Carried in', 'Earned', 'Deductions', '−', 'Payable', '$367'].map((text) => html.indexOf(text));
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect([...positions.slice(0, 3)]).toEqual([...positions.slice(0, 3)].sort((a, b) => a - b));
        expect(html.indexOf('$400')).toBeGreaterThan(html.indexOf('Earned'));
        expect(html.indexOf('$43')).toBeGreaterThan(html.indexOf('Deductions'));
    });

    it('puts the sign before the label', () => {
        const html = renderToStaticMarkup(createElement(PayoutEquation, { lines }));
        expect(html.indexOf('−')).toBeLessThan(html.indexOf('Deductions'));
    });

    it('draws a divider above the first strong line only', () => {
        const html = renderToStaticMarkup(createElement(PayoutEquation, { lines }));
        expect(html.match(/border-t/g)).toHaveLength(1);
        expect(html.indexOf('border-t')).toBeLessThan(html.indexOf('Payable'));
        expect(html.indexOf('border-t')).toBeGreaterThan(html.indexOf('Deductions'));
    });
});

describe('ReadinessBadge', () => {
    it('labels each status', () => {
        expect(renderToStaticMarkup(createElement(ReadinessBadge, { status: 'ready' }))).toContain('Ready to pay');
        expect(renderToStaticMarkup(createElement(ReadinessBadge, { status: 'paid_up' }))).toContain('Paid up');
    });
});

describe('ReadinessBadge vendor wording', () => {
    const label = (status: 'draft' | 'accruing' | 'ready' | 'paid_up', audience?: 'admin' | 'vendor') =>
        renderToStaticMarkup(createElement(ReadinessBadge, { status, audience }));

    it('uses plain words for vendors', () => {
        expect(label('draft', 'vendor')).toContain('Being prepared');
        expect(label('accruing', 'vendor')).toContain('Building up');
        expect(label('ready', 'vendor')).toContain('>Ready<');
        expect(label('paid_up', 'vendor')).toContain('Paid up');
    });

    it('keeps staff wording by default', () => {
        expect(label('draft')).toContain('Draft');
        expect(label('accruing')).toContain('Accruing');
        expect(label('ready', 'admin')).toContain('Ready to pay');
    });
});

describe('LegacyNote', () => {
    const noop = () => {};
    it('renders nothing at zero items', () => {
        expect(renderToStaticMarkup(createElement(LegacyNote, { items: 0, payouts: 3, onDownload: noop }))).toBe('');
    });

    it('states the counts when there are items', () => {
        const html = renderToStaticMarkup(createElement(LegacyNote, { items: 12, payouts: 3, onDownload: noop }));
        expect(html).toContain('12 sold items sit under 3 older payouts');
    });
});
