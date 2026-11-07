import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest runs in node with no DOM, so these read the component sources for the
// few things that are wording and tokens rather than logic.
const summary = readFileSync('src/components/sales/SalesSummary.tsx', 'utf8');
const strip = readFileSync('src/components/sales/SalesSummaryStrip.tsx', 'utf8');
const chart = readFileSync('src/components/analytics/SalesTrendChart.tsx', 'utf8');

describe('sales summary wording and tokens', () => {
    it('does not prefix the busiest text, which already starts with Busiest', () => {
        expect(summary).not.toMatch(/Busiest:/);
        expect(summary).toMatch(/\{busiest\.text\}/);
    });

    it('draws chart dots with a token fill, not the recharts default white', () => {
        const line = chart.slice(chart.indexOf('<Line'));
        expect(line).toMatch(/dot=\{data\.length <= 2 \? \{[^}]*fill: 'var\(--color-primary\)'/);
        expect(line).toMatch(/activeDot=\{\{[^}]*fill: 'var\(--color-primary\)'/);
    });

    it('both the strip and the summary offer Retry when a load failed', () => {
        for (const source of [summary, strip]) {
            expect(source).toMatch(/Couldn.t load these figures/);
            expect(source).toMatch(/Retry/);
            expect(source).toMatch(/summary\.failed/);
        }
    });
});
