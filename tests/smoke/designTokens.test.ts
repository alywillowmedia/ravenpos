import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { themeColorFor } from '../../src/lib/theme';

const css = readFileSync('src/index.css', 'utf8');

function block(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`Missing CSS block: ${selector}`);
    return match[1];
}

function token(source: string, name: string): string {
    const match = source.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`Missing token: ${name}`);
    return match[1].trim();
}

const light = block('@theme');
const dark = block(":root[data-theme='dark']");

const TOKENS: Array<[name: string, lightValue: string, darkValue: string]> = [
    ['--color-canvas', '#edf0ed', '#0f1211'],
    ['--color-background', '#ffffff', '#181c1a'],
    ['--color-card', '#ffffff', '#181c1a'],
    ['--color-surface-elevated', '#ffffff', '#181c1a'],
    ['--color-surface', '#f3f5f3', '#1f2421'],
    ['--color-surface-hover', '#eef1ef', '#232926'],
    ['--color-track', '#e4e9e5', '#272e2a'],
    ['--color-border', '#e3e8e4', '#29302c'],
    ['--color-border-strong', '#d2d9d4', '#363e39'],
    ['--color-input', '#d2d9d4', '#363e39'],
    ['--color-foreground', '#17201b', '#edf1ee'],
    ['--color-muted', '#566159', '#a9b3ad'],
    ['--color-muted-foreground', '#616c65', '#909b94'],
    ['--color-primary', '#2c6a59', '#82c8ae'],
    ['--color-ring', '#2c6a59', '#82c8ae'],
    ['--color-primary-foreground', '#ffffff', '#0c1914'],
    ['--color-primary-soft', '#e0ede7', 'rgb(130 200 174 / 13%)'],
    ['--color-success', '#276b44', '#80c99c'],
    ['--color-success-bg', '#e2f0e7', 'rgb(128 201 156 / 13%)'],
    ['--color-warning', '#8a5a0a', '#e2b55c'],
    ['--color-warning-bg', '#f6edd9', 'rgb(226 181 92 / 13%)'],
    ['--color-danger', '#b03a2e', '#ef8b80'],
    ['--color-danger-bg', '#f8e7e4', 'rgb(239 139 128 / 13%)'],
    ['--color-info', '#2f5f8f', '#8bb5df'],
    ['--color-info-bg', '#e6eef7', 'rgb(139 181 223 / 13%)'],
    ['--color-success-foreground', '#ffffff', '#181c1a'],
    ['--color-danger-foreground', '#ffffff', '#181c1a'],
    ['--color-chart-1', '#00836a', '#2aa381'],
    ['--color-chart-2', '#c5801f', '#bf8526'],
    ['--color-chart-3', '#3f73c8', '#5f8fe6'],
];

type Rgb = [number, number, number];

function parseColor(value: string, backdrop: Rgb): Rgb {
    if (value.startsWith('#')) {
        return [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16)) as Rgb;
    }
    const match = value.match(/rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/);
    if (!match) throw new Error(`Unsupported color: ${value}`);
    const alpha = Number(match[4]) / 100;
    return [1, 2, 3].map((index) => Number(match[index]) * alpha + backdrop[index - 1] * (1 - alpha)) as Rgb;
}

function luminance(color: Rgb): number {
    const [red, green, blue] = color.map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: Rgb, background: Rgb): number {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens', () => {
    it('defines the light palette', () => {
        for (const [name, lightValue] of TOKENS) {
            expect(token(light, name), name).toBe(lightValue);
        }
    });

    it('defines the dark palette', () => {
        for (const [name, , darkValue] of TOKENS) {
            expect(token(dark, name), name).toBe(darkValue);
        }
    });

    it('keeps text at 4.5:1 in both themes', () => {
        const textPairs = [
            ...['foreground', 'muted', 'muted-foreground'].flatMap((text) => (
                ['card', 'surface', 'canvas'].map((surface) => [text, surface])
            )),
            ['primary-foreground', 'primary'],
            ['primary', 'primary-soft'],
            ['success', 'success-bg'],
            ['warning', 'warning-bg'],
            ['danger', 'danger-bg'],
            ['info', 'info-bg'],
        ];

        for (const theme of [light, dark]) {
            const card = parseColor(token(theme, '--color-card'), [0, 0, 0]);
            for (const [text, surface] of textPairs) {
                const ratio = contrast(
                    parseColor(token(theme, `--color-${text}`), card),
                    parseColor(token(theme, `--color-${surface}`), card)
                );
                expect(ratio, `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('pins the storefront in both themes', () => {
        const storefront = block('.ravenlia-storefront');
        expect(token(storefront, '--color-background')).toBe('var(--dw-bg)');
        expect(token(storefront, '--color-primary')).toBe('var(--dw-ink)');
        expect(token(storefront, '--radius-lg')).toBe('var(--dw-radius)');
        expect(token(storefront, '--color-success')).toBe('#4a6b3a');
        expect(token(storefront, '--font-mono')).toBe("'SF Mono', 'Fira Code', ui-monospace, monospace");

        const storefrontDark = block(":root[data-theme='dark'] .ravenlia-storefront");
        expect(token(storefrontDark, '--color-success')).toBe('#82a86a');
    });

    it('maps the theme to the canvas color', () => {
        expect(themeColorFor('light')).toBe('#edf0ed');
        expect(themeColorFor('dark')).toBe('#0f1211');
    });
});
