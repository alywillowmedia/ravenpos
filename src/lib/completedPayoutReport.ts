import type { CompletedPayoutDetails } from './consignorReports';
import { getConsignorDisplayName, getConsignorPayToName } from './consignors';
import type { Consignor, Payout } from '../types';

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function money(value: number | null | undefined): string {
    return Number(value || 0).toFixed(2);
}

export function printCompletedPayoutReport(
    payout: Payout,
    details: CompletedPayoutDetails,
    consignor: Consignor | null | undefined = payout.consignor
): boolean {
    const consignorName = consignor ? getConsignorDisplayName(consignor) : 'Unknown Vendor';
    const payToName = consignor ? getConsignorPayToName(consignor) : consignorName;
    const deductionRows = details.deductions.map((deduction) => `
        <tr>
            <td>${escapeHtml(deduction.label)}</td>
            <td>${escapeHtml(deduction.description || '')}</td>
            <td class="right">-$${money(deduction.amount)}</td>
        </tr>
    `).join('');
    const saleRows = details.saleLines.map((line) => {
        const effectiveQuantity = Math.max(0, Number(line.quantity || 0) - Number(line.refundedQuantity || 0));
        return `
            <tr>
                <td>${escapeHtml(new Date(line.saleDate).toLocaleDateString())}</td>
                <td>${escapeHtml(line.sku)}</td>
                <td>${escapeHtml(line.itemName)}</td>
                <td class="center">${effectiveQuantity}</td>
                <td class="right">$${money(line.unitPrice)}</td>
                <td class="right">$${money(line.lineTotal)}</td>
                <td class="center">${money(line.commissionSplit * 100)}%</td>
                <td class="right">$${money(line.consignorShare)}</td>
            </tr>
        `;
    }).join('');
    const originalDue = payout.original_amount_due === null || payout.original_amount_due === undefined
        ? null
        : Number(payout.original_amount_due);

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payout Report - ${escapeHtml(consignorName)}</title>
            <style>
                * { box-sizing: border-box; }
                body { color: #111; font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 24px; }
                h1 { font-size: 20px; margin: 0 0 4px; }
                h2 { border-bottom: 1px solid #bbb; font-size: 13px; margin: 22px 0 8px; padding-bottom: 5px; }
                p { margin: 3px 0; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border-bottom: 1px solid #ddd; padding: 5px; text-align: left; vertical-align: top; }
                th { background: #f4f4f4; font-size: 10px; text-transform: uppercase; }
                .meta { display: grid; gap: 8px 20px; grid-template-columns: repeat(3, 1fr); margin-top: 16px; }
                .meta div { border: 1px solid #ddd; padding: 8px; }
                .label { color: #666; display: block; font-size: 9px; text-transform: uppercase; }
                .summary { margin-left: auto; margin-top: 16px; max-width: 360px; }
                .summary-row { display: flex; justify-content: space-between; padding: 3px 0; }
                .summary-row.total { border-top: 2px solid #111; font-size: 13px; font-weight: bold; margin-top: 4px; padding-top: 7px; }
                .right { text-align: right; }
                .center { text-align: center; }
                .note { background: #f7f7f7; border: 1px solid #ddd; margin-top: 14px; padding: 8px; }
                .footer { color: #666; font-size: 9px; margin-top: 24px; }
                @media print {
                    body { padding: 0; }
                    @page { margin: 0.5in; }
                }
            </style>
        </head>
        <body>
            <h1>Completed Vendor Payout Report</h1>
            <p><strong>${escapeHtml(consignorName)}</strong> (${escapeHtml(consignor?.consignor_number || '')})</p>
            <p>Pay To: ${escapeHtml(payToName)}</p>
            <div class="meta">
                <div><span class="label">Paid At</span>${escapeHtml(new Date(payout.paid_at).toLocaleString())}</div>
                <div><span class="label">Payout Period</span>${escapeHtml(new Date(payout.period_start).toLocaleDateString())} - ${escapeHtml(new Date(payout.period_end).toLocaleDateString())}</div>
                <div><span class="label">Payout ID</span>${escapeHtml(payout.id)}</div>
                <div><span class="label">Transactions</span>${payout.sales_count}</div>
                <div><span class="label">Items Sold</span>${payout.items_sold}</div>
                <div><span class="label">Status</span>${payout.is_partial ? 'Partial Payout' : 'Paid'}</div>
            </div>

            <h2>Sales Included</h2>
            ${details.saleLines.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>SKU</th>
                            <th>Item</th>
                            <th class="center">Qty</th>
                            <th class="right">Unit Price</th>
                            <th class="right">Net Total</th>
                            <th class="center">Vendor %</th>
                            <th class="right">Vendor Earnings</th>
                        </tr>
                    </thead>
                    <tbody>${saleRows}</tbody>
                </table>
            ` : '<p>No sale line items were found for this payout period.</p>'}

            ${details.deductions.length > 0 ? `
                <h2>Deduction Details</h2>
                <table>
                    <thead><tr><th>Deduction</th><th>Details</th><th class="right">Amount</th></tr></thead>
                    <tbody>${deductionRows}</tbody>
                </table>
            ` : ''}

            <div class="summary">
                <div class="summary-row"><span>Gross Sales</span><span>$${money(payout.gross_sales)}</span></div>
                <div class="summary-row"><span>Tax Collected</span><span>$${money(payout.tax_collected)}</span></div>
                <div class="summary-row"><span>Store Share</span><span>-$${money(payout.store_share)}</span></div>
                ${Number(payout.credit_card_fees || 0) > 0 ? `<div class="summary-row"><span>Card Fees</span><span>-$${money(payout.credit_card_fees)}</span></div>` : ''}
                ${Number(payout.booth_rent_deduction || 0) > 0 ? `<div class="summary-row"><span>Booth Rent</span><span>-$${money(payout.booth_rent_deduction)}</span></div>` : ''}
                ${Number(payout.marketing_fee_deduction || 0) > 0 ? `<div class="summary-row"><span>Marketing Fees</span><span>-$${money(payout.marketing_fee_deduction)}</span></div>` : ''}
                ${Number(payout.ledger_deduction || 0) > 0 ? `<div class="summary-row"><span>Ledger Deductions</span><span>-$${money(payout.ledger_deduction)}</span></div>` : ''}
                ${Number(payout.invoice_deduction || 0) > 0 ? `<div class="summary-row"><span>Invoice Deductions</span><span>-$${money(payout.invoice_deduction)}</span></div>` : ''}
                ${originalDue !== null ? `<div class="summary-row"><span>Original Amount Due</span><span>$${money(originalDue)}</span></div>` : ''}
                <div class="summary-row total"><span>Recorded Payout</span><span>$${money(payout.amount)}</span></div>
            </div>

            ${payout.partial_reason ? `<div class="note"><strong>Partial payout reason:</strong> ${escapeHtml(payout.partial_reason)}</div>` : ''}
            ${payout.notes ? `<div class="note"><strong>Notes:</strong> ${escapeHtml(payout.notes)}</div>` : ''}
            <p class="footer">Saved payout totals and sale lines come from the immutable payout allocation and adjustment snapshots. Generated ${escapeHtml(new Date().toLocaleString())}.</p>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
    return true;
}
