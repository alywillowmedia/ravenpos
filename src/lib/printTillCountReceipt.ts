import { formatCurrency } from './utils';

export interface TillBreakdownLine {
    label: string;
    quantity: number;
    amount: number;
}

export interface TillCountReport {
    countedAt: string;
    businessDate?: string;
    expectedFromSales: number;
    checkCount: number;
    checkTotal: number;
    openingFloat: number;
    manualAdjustment?: number;
    expectedDrawerTotal: number;
    countedTotal: number;
    variance: number;
    denominationBreakdown: TillBreakdownLine[];
    accountability?: {
        grossProductSales: number;
        discounts: number;
        returns: number;
        allowances: number;
        netSales: number;
        salesTax: number;
        creditCardFeesCharged: number;
        giftCertificatesSold: number;
        totalCollected: number;
        cashInDrawer: number;
        checksInHand: number;
        creditCardsBatchTotal: number;
        storeCreditRedeemed: number;
        totalReceived: number;
        difference: number;
        dealerCashPurchases: number;
    };
}

export interface TillCountReceiptMeta {
    submittedBy: string;
    recipientName?: string;
    timezone?: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDateTime(value: string, timezone?: string): string {
    const date = new Date(value);
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    return date.toLocaleString([], {
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: tz,
    });
}

function formatBusinessDate(value?: string): string {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;

    return new Date(year, month - 1, day).toLocaleDateString([], {
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

function buildReceiptHtml(meta: TillCountReceiptMeta, report: TillCountReport): string {
    const varianceColor =
        report.variance > 0.009
            ? '#166534'
            : report.variance < -0.009
                ? '#991b1b'
                : '#111827';

    const denomRows = report.denominationBreakdown
        .filter((line) => line.quantity > 0)
        .map((line) => `
            <tr>
                <td>${escapeHtml(line.label)}</td>
                <td style="text-align:center;">${line.quantity}</td>
                <td style="text-align:right;">${formatCurrency(line.amount)}</td>
            </tr>
        `)
        .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Till Count Receipt</title>
  <style>
    body { font-family: 'Courier New', Courier, monospace; color: #111827; margin: 16px; }
    .receipt { max-width: 360px; margin: 0 auto; border: 1px dashed #9ca3af; padding: 16px; }
    .center { text-align: center; }
    .muted { color: #6b7280; font-size: 12px; }
    .section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #d1d5db; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 4px 0; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div style="font-size:12px; letter-spacing: 1px;">RAVENPOS</div>
      <div style="font-size:20px; font-weight:700;">TILL COUNT</div>
      <div class="muted">${formatDateTime(report.countedAt, meta.timezone)}</div>
    </div>

      <div class="section">
        <div><span class="muted">Submitted By:</span> ${escapeHtml(meta.submittedBy || 'Employee')}</div>
        ${meta.recipientName ? `<div><span class="muted">For:</span> ${escapeHtml(meta.recipientName)}</div>` : ''}
        ${report.businessDate ? `<div><span class="muted">Sales Date:</span> ${escapeHtml(formatBusinessDate(report.businessDate))}</div>` : ''}
      </div>

    <div class="section">
      <table>
        <tr><td>Expected From Sales</td><td class="right">${formatCurrency(report.expectedFromSales)}</td></tr>
        <tr><td>Check Qty</td><td class="right">${report.checkCount}</td></tr>
        <tr><td>Check Amt</td><td class="right">${formatCurrency(report.checkTotal)}</td></tr>
        <tr><td>Opening Float</td><td class="right">${formatCurrency(report.openingFloat)}</td></tr>
        <tr><td class="bold">Expected Drawer</td><td class="right bold">${formatCurrency(report.expectedDrawerTotal)}</td></tr>
        <tr><td class="bold">Counted Total</td><td class="right bold">${formatCurrency(report.countedTotal)}</td></tr>
        <tr><td class="bold">Variance</td><td class="right bold" style="color:${varianceColor};">${report.variance >= 0 ? '+' : ''}${formatCurrency(report.variance)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="muted">Denomination Breakdown</div>
      <table>
        <tr><th style="text-align:left;">Denom</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Amt</th></tr>
        ${denomRows || '<tr><td colspan="3" class="muted">No denominations entered.</td></tr>'}
      </table>
    </div>
  </div>
</body>
</html>`;
}

export async function printTillCountReceipt(
    meta: TillCountReceiptMeta,
    report: TillCountReport
): Promise<{ success: boolean; error?: string }> {
    try {
        const printWindow = window.open('', '_blank', 'width=420,height=760');
        if (!printWindow) {
            return { success: false, error: 'Unable to open print window.' };
        }

        printWindow.document.write(buildReceiptHtml(meta, report));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unable to print till receipt',
        };
    }
}
