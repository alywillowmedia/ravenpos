// Pure helpers for the payout statement email. No Deno or remote imports,
// so Vitest can load this file directly.

export interface StatementEmailInput {
    vendorName: string; amount: number; paidDate: string; method: string; reference: string | null;
    scopeLabel: string; carriedIn: number | null; earned: number | null;
    deductions: Array<{ label: string; amount: number }>; rollsForward: number; statementUrl: string | null;
}

const STORE_TIME_ZONE = 'America/New_York';
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** "$1,234.50" */
export function formatMoney(amount: number): string {
    const cents = Math.round(Math.abs(amount) * 100);
    const dollars = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const rest = String(cents % 100).padStart(2, '0');
    return `${amount < 0 && cents > 0 ? '-' : ''}$${dollars}.${rest}`;
}

function plainDay(date: string): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!match) return null;
    const month = SHORT_MONTHS[Number(match[2]) - 1];
    return month ? `${month} ${Number(match[3])}` : null;
}

/** "Nov 3, 2025" from a plain date, with no timezone shift. Empty when unparseable. */
export function formatPlainDate(date: string | null): string {
    const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
    if (!match) return '';
    const month = SHORT_MONTHS[Number(match[2]) - 1];
    return month ? `${month} ${Number(match[3])}, ${match[1]}` : '';
}

function storeDate(timestamp: string): string | null {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE }).format(parsed);
}

export interface ScopeFields {
    range_mode: string | null;
    source_range_start: string | null;
    source_range_end: string | null;
    cutoff_at: string | null;
}

/** Same wording as statementScopeLabel in src/lib/payoutDraft.ts (pinned by a test). */
export function scopeLabelFor(payout: ScopeFields): string {
    if (payout.range_mode === 'selected_range' && payout.source_range_start && payout.source_range_end) {
        const from = plainDay(payout.source_range_start);
        const to = plainDay(payout.source_range_end);
        if (from && to) return `Sales from ${from} to ${to}`;
    }
    if (payout.range_mode === 'through_date') {
        const end = payout.source_range_end || (payout.cutoff_at ? storeDate(payout.cutoff_at) : null);
        const day = end ? plainDay(end) : null;
        if (day) return `Earnings through ${day}`;
    }
    return 'All outstanding';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The trimmed address when it looks valid (same regex as send-invoice-email), else null. */
export function isUsableEmail(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return EMAIL_REGEX.test(trimmed) ? trimmed : null;
}

/** PORTAL_URL without trailing slashes, or null when unset or blank. */
export function normalizePortalUrl(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim().replace(/\/+$/, '');
    return trimmed || null;
}

/** Original amount due minus the amount paid, floored at zero. */
export function rollsForwardAmount(originalAmountDue: number | null, amount: number): number {
    if (originalAmountDue === null) return 0;
    return Math.max(0, Math.round((originalAmountDue - amount) * 100) / 100);
}

export function buildStatementEmail(input: StatementEmailInput): { subject: string; html: string } {
    const subject = `Your Ravenlia payout statement · ${formatMoney(input.amount)}`;
    const e = escapeHtml;
    const labelStyle = 'padding: 6px 0; font-size: 14px; color: #555;';
    const valueStyle = 'padding: 6px 0; font-size: 14px; color: #1a1a1a; text-align: right;';

    const row = (label: string, value: string, bold = false): string => `
                            <tr>
                                <td style="${labelStyle}${bold ? ' font-weight: 600; color: #1a1a1a;' : ''}">${e(label)}</td>
                                <td style="${valueStyle}${bold ? ' font-weight: 600;' : ''}">${e(value)}</td>
                            </tr>`;

    const equation: string[] = [];
    if (input.carriedIn !== null && input.earned !== null) {
        equation.push(row('Carried in', formatMoney(input.carriedIn)));
        equation.push(row('Earned', formatMoney(input.earned)));
    }
    if (input.deductions.length > 0) {
        const total = input.deductions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0) / 100;
        equation.push(row('Deductions', `-${formatMoney(total)}`));
        for (const deduction of input.deductions) {
            equation.push(row(`  ${deduction.label}`, `-${formatMoney(deduction.amount)}`));
        }
    }
    equation.push(row('Paid', formatMoney(input.amount), true));
    if (input.rollsForward > 0) equation.push(row('Rolls forward', formatMoney(input.rollsForward)));

    const details: string[] = [
        row('Paid on', formatPlainDate(input.paidDate)),
        row('Method', input.method),
    ];
    if (input.reference) details.push(row('Reference', input.reference));
    details.push(row('Covers', input.scopeLabel));

    const link = input.statementUrl
        ? `
                    <tr>
                        <td style="padding: 8px 32px 24px 32px; text-align: center;">
                            <a href="${e(input.statementUrl)}" style="display: inline-block; padding: 12px 18px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">View your statement</a>
                        </td>
                    </tr>`
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payout statement - Ravenlia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px;">
                    <tr>
                        <td style="padding: 32px 32px 8px 32px;">
                            <p style="margin: 0; font-size: 13px; color: #666;">Ravenlia payout statement</p>
                            <h1 style="margin: 8px 0 0 0; font-size: 28px; color: #1a1a1a;">${e(formatMoney(input.amount))}</h1>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">Hello ${e(input.vendorName)}, your payout has been marked paid.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 16px 32px 0 32px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">${details.join('')}
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 32px 16px 32px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-top: 1px solid #eee;">${equation.join('')}
                            </table>
                        </td>
                    </tr>${link}
                    <tr>
                        <td style="padding: 20px 32px 28px 32px; text-align: center; background-color: #fafafa; border-radius: 0 0 12px 12px;">
                            <p style="margin: 0; font-size: 12px; color: #999;">Ravenlia — from the hands of artisans to the heart of community.</p>
                        </td>
                    </tr>
                </table>
                <p style="text-align: center; font-size: 11px; color: #999; margin-top: 24px;">This is an automated message from Ravenlia. Please do not reply to this email.</p>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { subject, html };
}
