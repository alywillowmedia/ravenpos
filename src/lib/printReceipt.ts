import type { ReceiptData, ReceiptItem, RefundReceiptData } from '../types/receipt';
import type { CartItem, PaymentBreakdownEntry, Sale } from '../types';
import '../types/electron.d.ts';
import { calculateCartDiscountBreakdown } from './saleDiscounts';
import { describeTender, formatTenderLabel, getSaleTenders, isTenderMethod, sortTenders } from './tenders';

/**
 * Detect if running inside Electron desktop app
 */
const isElectron = (): boolean => {
    return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
};

/**
 * DEV_MODE toggle (only used when NOT in Electron):
 * - true: Opens receipt as HTML in new window with print dialog (for testing)
 * - false: Sends to localhost:3000/print bridge server (for actual thermal printing)
 */
const DEV_MODE = true;

const CODE39_PATTERNS: Record<string, string> = {
    '0': 'nnnwwnwnn',
    '1': 'wnnwnnnnw',
    '2': 'nnwwnnnnw',
    '3': 'wnwwnnnnn',
    '4': 'nnnwwnnnw',
    '5': 'wnnwwnnnn',
    '6': 'nnwwwnnnn',
    '7': 'nnnwnnwnw',
    '8': 'wnnwnnwnn',
    '9': 'nnwwnnwnn',
    A: 'wnnnnwnnw',
    B: 'nnwnnwnnw',
    C: 'wnwnnwnnn',
    D: 'nnnnwwnnw',
    E: 'wnnnwwnnn',
    F: 'nnwnwwnnn',
    G: 'nnnnnwwnw',
    H: 'wnnnnwwnn',
    I: 'nnwnnwwnn',
    J: 'nnnnwwwnn',
    K: 'wnnnnnnww',
    L: 'nnwnnnnww',
    M: 'wnwnnnnwn',
    N: 'nnnnwnnww',
    O: 'wnnnwnnwn',
    P: 'nnwnwnnwn',
    Q: 'nnnnnnwww',
    R: 'wnnnnnwwn',
    S: 'nnwnnnwwn',
    T: 'nnnnwnwwn',
    U: 'wwnnnnnnw',
    V: 'nwwnnnnnw',
    W: 'wwwnnnnnn',
    X: 'nwnnwnnnw',
    Y: 'wwnnwnnnn',
    Z: 'nwwnwnnnn',
    '-': 'nwnnnnwnw',
    '.': 'wwnnnnwnn',
    ' ': 'nwwnnnwnn',
    '$': 'nwnwnwnnn',
    '/': 'nwnwnnnwn',
    '+': 'nwnnnwnwn',
    '%': 'nnnwnwnwn',
    '*': 'nwnnwnwnn',
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generateCode39BarcodeHTML(value: string): string {
    const encodedValue = value.trim().toUpperCase();
    if (!encodedValue) return '';

    for (const char of encodedValue) {
        if (!CODE39_PATTERNS[char]) return '';
    }

    const fullValue = `*${encodedValue}*`;
    const narrow = 2;
    const wide = 5;
    const quiet = narrow * 10;
    const height = 56;

    let cells = `<td style="width:${quiet}px;height:${height}px;background:#fff;font-size:0;line-height:0;"></td>`;

    for (let i = 0; i < fullValue.length; i++) {
        const pattern = CODE39_PATTERNS[fullValue[i]];
        for (let j = 0; j < pattern.length; j++) {
            const isBar = j % 2 === 0;
            const width = pattern[j] === 'w' ? wide : narrow;
            cells += `<td style="width:${width}px;height:${height}px;background:${isBar ? '#000' : '#fff'};font-size:0;line-height:0;"></td>`;
        }

        if (i < fullValue.length - 1) {
            cells += `<td style="width:${narrow}px;height:${height}px;background:#fff;font-size:0;line-height:0;"></td>`;
        }
    }

    cells += `<td style="width:${quiet}px;height:${height}px;background:#fff;font-size:0;line-height:0;"></td>`;

    return `
        <div style="margin-top: 10px; text-align: center;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 auto; background: #fff;">
                <tr>${cells}</tr>
            </table>
            <div style="margin-top: 4px; font-size: 10px; letter-spacing: 1px;">
                ${escapeHtml(encodedValue)}
            </div>
        </div>
    `;
}

/**
 * Convert cart items and sale data to receipt format
 */
export function createReceiptData(
    sale: Sale,
    cartItems: CartItem[]
): ReceiptData {
    const discountBreakdown = calculateCartDiscountBreakdown(
        cartItems,
        Number(sale.discount_total || 0)
    );
    const items: ReceiptItem[] = cartItems.map((cartItem, index) => {
        const breakdown = discountBreakdown.items[index];
        return {
            name: cartItem.item.name + (cartItem.item.variant_summary ? ` - ${cartItem.item.variant_summary}` : ''),
            quantity: cartItem.quantity,
            price: Number(cartItem.item.price),
            lineTotal: breakdown?.netLineTotal ?? cartItem.lineTotal,
            originalLineTotal: breakdown?.originalLineTotal ?? cartItem.lineTotal,
            lineDiscountAmount: breakdown?.lineDiscountAmount ?? 0,
            orderDiscountAmount: breakdown?.orderDiscountAmount ?? 0,
            totalDiscountAmount: breakdown?.totalDiscountAmount ?? 0,
            discountedUnitPrice: breakdown?.discountedUnitPrice ?? Number(cartItem.item.price),
            consignorName: (cartItem.item.consignor?.name) ?? 'Unknown Vendor',
            consignorId: cartItem.item.consignor_id,
            imageUrl: cartItem.item.image_url,
        };
    });

    const receipt: ReceiptData = {
        transactionId: sale.id,
        date: new Date(sale.completed_at),
        items,
        subtotal: Number(sale.subtotal),
        discountTotal: discountBreakdown.discountTotal,
        netSubtotal: discountBreakdown.netSubtotal,
        tax: Number(sale.tax_amount),
        storeCreditUsed: sale.store_credit_used ? Number(sale.store_credit_used) : 0,
        giftCardUsed: sale.gift_card_used ? Number(sale.gift_card_used) : 0,
        total: Number(sale.total),
        cardFeeAmount: sale.card_fee_amount ? Number(sale.card_fee_amount) : 0,
        cardLast4: sale.card_last4 || undefined,
        paymentMethod: sale.payment_method,
        paymentBreakdown: sale.payment_breakdown ?? null,
        checkNumber: sale.check_number || undefined,
        cashTendered: sale.cash_tendered ? Number(sale.cash_tendered) : undefined,
        changeGiven: sale.change_given ? Number(sale.change_given) : undefined,
    };

    // Send every tender to the printer/email, including older sales without a breakdown.
    return { ...receipt, paymentBreakdown: getReceiptTenders(receipt) };
}

/**
 * Tender lines for a receipt (store credit, gift card, cash, check, card), in
 * display order. Receipts from sales saved before payment_breakdown covered
 * every tender fall back to the single payment method for the whole total.
 */
export function getReceiptTenders(receipt: ReceiptData): PaymentBreakdownEntry[] {
    const tenders = sortTenders(getSaleTenders({
        payment_method: receipt.paymentMethod,
        payment_breakdown: receipt.paymentBreakdown,
        total: receipt.total,
        store_credit_used: receipt.storeCreditUsed,
        gift_card_used: receipt.giftCardUsed,
        cash_tendered: receipt.cashTendered,
        change_given: receipt.changeGiven,
        check_number: receipt.checkNumber,
        card_last4: receipt.cardLast4,
    })).map((entry) => ({
        ...entry,
        tendered: entry.tendered == null ? null : Number(entry.tendered),
        change: entry.change == null ? null : Number(entry.change),
    }));

    // The Terminal card's last 4 can live only on the sale row.
    const cardEntries = tenders.filter((entry) => entry.method === 'card');
    if (cardEntries.length === 1 && !cardEntries[0].card_last4 && receipt.cardLast4) {
        cardEntries[0].card_last4 = receipt.cardLast4;
    }

    return tenders;
}

/**
 * Where a refund went, per tender (store credit, gift card, cash, check, card).
 * Refunds recorded before per-tender refunds fall back to the single method.
 */
export function getRefundTenders(receipt: RefundReceiptData): PaymentBreakdownEntry[] {
    const entries = (receipt.paymentBreakdown || [])
        .filter((entry) => isTenderMethod(entry?.method) && Number(entry.amount || 0) > 0)
        .map((entry) => ({ ...entry, amount: Number(entry.amount) }));
    if (entries.length > 0) return sortTenders(entries);
    if (isTenderMethod(receipt.paymentMethod) && receipt.refundAmount > 0) {
        return [{ method: receipt.paymentMethod, amount: receipt.refundAmount }];
    }
    return [];
}

/**
 * Generate receipt HTML for printing
 */
function generateReceiptHTML(receipt: ReceiptData): string {
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }) + ' ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatCurrency = (amount: number) => '$' + amount.toFixed(2);
    const receiptNumber = receipt.transactionId.slice(0, 8).toUpperCase();
    const barcodeHTML = generateCode39BarcodeHTML(receiptNumber);

    const itemsHTML = receipt.items.map((item, index) => {
        const detailLines: string[] = [];
        if (item.quantity > 1) {
            detailLines.push(`<div>@ ${formatCurrency(item.price)} each</div>`);
        }
        if ((item.totalDiscountAmount || 0) > 0) {
            detailLines.push(`<div>Discount: -${formatCurrency(item.totalDiscountAmount || 0)}</div>`);
            if ((item.originalLineTotal || 0) > item.lineTotal) {
                detailLines.push(`<div>Original: ${formatCurrency(item.originalLineTotal || 0)}</div>`);
            }
            if (item.quantity > 1 && item.discountedUnitPrice !== undefined) {
                detailLines.push(`<div>Net @ ${formatCurrency(item.discountedUnitPrice)} each</div>`);
            }
        }
        detailLines.push(`<div>Vendor: ${item.consignorName}</div>`);

        return `
        <div style="margin-bottom: 8px; ${index > 0 ? 'border-top: 1px dotted #999; padding-top: 6px;' : ''}">
            <div style="display: flex; justify-content: space-between;">
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">
                    &bull; ${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name}
                </span>
                <span style="white-space: nowrap;">${formatCurrency(item.lineTotal)}</span>
            </div>
            <div style="font-size: 10px; color: #666; padding-left: 8px;">
                ${detailLines.join('')}
            </div>
        </div>
    `;
    }).join('');

    const tenders = getReceiptTenders(receipt);
    const paymentHTML = tenders.length > 0
        ? tenders.map((entry) => `
            <div style="display: flex; justify-content: space-between;">
                <span>${escapeHtml(describeTender(entry))}</span>
                <span>${formatCurrency(entry.amount)}</span>
            </div>
            ${entry.method === 'cash' && entry.tendered != null && entry.tendered > entry.amount ? `
                <div style="display: flex; justify-content: space-between; padding-left: 8px;">
                    <span>Tendered</span>
                    <span>${formatCurrency(entry.tendered)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-left: 8px; font-weight: bold;">
                    <span>Change</span>
                    <span>${formatCurrency(entry.change || 0)}</span>
                </div>
            ` : ''}
        `).join('')
        : receipt.total > 0
            ? `
            <div style="display: flex; justify-content: space-between;">
                <span>${formatTenderLabel(receipt.paymentMethod)}</span>
                <span>${formatCurrency(receipt.total)}</span>
            </div>
        `
            : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt - ${receipt.transactionId.slice(0, 8).toUpperCase()}</title>
    <style>
        @page {
            size: 80mm auto;
            margin: 0;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
        }
        body {
            font-family: "Courier New", Courier, monospace;
            font-size: 12px;
            line-height: 1.4;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            padding: 20px;
        }
        .receipt {
            width: 302px;
            background: #fff;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .separator {
            border-bottom: 1px dashed #000;
            margin: 8px 0;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 12px;">
            <div style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">
                RAVENLIA
            </div>
            <div class="separator"></div>
            <div style="font-size: 11px;">
                ${formatDate(receipt.date)}
            </div>
            <div style="font-size: 10px; margin-top: 4px;">
                Transaction: #${receiptNumber}
            </div>
        </div>

        <div class="separator"></div>

        <!-- Items -->
        <div style="margin-bottom: 12px;">
            ${itemsHTML}
        </div>

        <div class="separator"></div>

        <!-- Totals -->
        <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between;">
                <span>Subtotal</span>
                <span>${formatCurrency(receipt.subtotal)}</span>
            </div>
            ${receipt.discountTotal && receipt.discountTotal > 0 ? `
                <div style="display: flex; justify-content: space-between;">
                    <span>Discounts</span>
                    <span>-${formatCurrency(receipt.discountTotal)}</span>
                </div>
            ` : ''}
            ${receipt.tax > 0 ? `
                <div style="display: flex; justify-content: space-between;">
                    <span>Tax</span>
                    <span>${formatCurrency(receipt.tax)}</span>
                </div>
            ` : ''}
            ${receipt.cardFeeAmount && receipt.cardFeeAmount > 0 ? `
                <div style="display: flex; justify-content: space-between;">
                    <span>Card Fee</span>
                    <span>${formatCurrency(receipt.cardFeeAmount)}</span>
                </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 4px; padding-top: 4px; border-top: 1px solid #000;">
                <span>TOTAL</span>
                <span>${formatCurrency(receipt.total)}</span>
            </div>
        </div>

        <div class="separator"></div>

        <!-- Payment -->
        <div>
            <div style="font-weight: bold;">Payment</div>
            ${paymentHTML}
        </div>

        <div class="separator" style="margin: 12px 0 8px 0;"></div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 11px;">
            <div style="margin-bottom: 4px;">
                Thank you for shopping at Ravenlia!
            </div>
            <div style="font-size: 10px; color: #666;">
                Ravenlia — from the hands of artisans to the heart of community.
            </div>
            <div style="font-size: 10px; color: #666;">
                <i>Thanks for keeping it alive!</i>
            </div>
            <div style="margin: 6px 0; font-size: 10px; color: #666;">
                -----
            </div>
            <div style="font-size: 10px; color: #666;">
                Ravenlia.com
            </div>
            <div style="margin-top: 6px; font-size: 10px; color: #666;">
                All sales final. No returns.
            </div>
            ${barcodeHTML}
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Print a receipt
 * - Electron: Uses native ESC/POS thermal printing
 * - DEV_MODE: Opens HTML preview in new window
 * - Production: Sends to localhost bridge server
 */
export async function printReceipt(receipt: ReceiptData): Promise<{ success: boolean; error?: string }> {
    try {
        // Electron desktop app: use native printing
        if (isElectron() && window.electronAPI) {
            const result = await window.electronAPI.printReceipt(receipt);
            if (result.warning) {
                console.warn('Receipt printing warning:', result.warning, {
                    mode: result.mode,
                    driver: result.driver,
                });
            }
            return result;
        }

        if (DEV_MODE) {
            // Open receipt in new window for preview/print
            const html = generateReceiptHTML(receipt);
            const printWindow = window.open('', '_blank', 'width=400,height=600');

            if (!printWindow) {
                return {
                    success: false,
                    error: 'Could not open print window. Please allow popups.'
                };
            }

            printWindow.document.write(html);
            printWindow.document.close();

            // Wait for content to load, then trigger print dialog
            printWindow.onload = () => {
                printWindow.print();
            };

            return { success: true };
        } else {
            // Production mode: send to bridge server
            const response = await fetch('http://localhost:3000/print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(receipt),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `Print server error: ${errorText}`
                };
            }

            return { success: true };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown print error';
        console.error('Print receipt error:', error);
        return { success: false, error: message };
    }
}

/**
 * Generate refund receipt HTML for printing
 */
function generateRefundReceiptHTML(receipt: RefundReceiptData): string {
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }) + ' ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatCurrency = (amount: number) => '$' + amount.toFixed(2);

    const refundTenders = getRefundTenders(receipt);
    const refundMethodHTML = refundTenders.length > 0
        ? refundTenders.map((entry) => `
            <div style="display: flex; justify-content: space-between;">
                <span>Refunded to ${escapeHtml(describeTender(entry))}</span>
                <span>${formatCurrency(entry.amount)}</span>
            </div>
        `).join('')
        : `
            <div style="display: flex; justify-content: space-between;">
                <span>Refund Method</span>
                <span>${formatTenderLabel(receipt.paymentMethod)}</span>
            </div>
        `;
    const hasCardRefund = refundTenders.some((entry) => entry.method === 'card');

    const itemsHTML = receipt.items.map(item => `
        <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between;">
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">
                    ${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name}
                </span>
                <span style="white-space: nowrap;">-${formatCurrency(item.lineTotal)}</span>
            </div>
            <div style="font-size: 10px; color: #666; padding-left: 8px;">
                ${item.quantity > 1 ? `<div>@ ${formatCurrency(item.price)} each</div>` : ''}
                <div>${item.restocked ? '↻ Restocked' : 'Not restocked'}</div>
            </div>
        </div>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Refund Receipt - ${receipt.refundId.slice(0, 8).toUpperCase()}</title>
    <style>
        @page {
            size: 80mm auto;
            margin: 0;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
        }
        body {
            font-family: "Courier New", Courier, monospace;
            font-size: 12px;
            line-height: 1.4;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            padding: 20px;
        }
        .receipt {
            width: 302px;
            background: #fff;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .separator {
            border-bottom: 1px dashed #000;
            margin: 8px 0;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 12px;">
            <div style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">
                RAVENLIA
            </div>
            <div style="font-size: 14px; font-weight: bold; color: #c00; margin-top: 4px;">
                *** REFUND ***
            </div>
            <div class="separator"></div>
            <div style="font-size: 11px;">
                ${formatDate(receipt.date)}
            </div>
            <div style="font-size: 10px; margin-top: 4px;">
                Refund ID: #${receipt.refundId.slice(0, 8).toUpperCase()}
            </div>
            <div style="font-size: 10px; color: #666;">
                (Original: #${receipt.originalTransactionId.slice(0, 8).toUpperCase()})
            </div>
        </div>

        <div class="separator"></div>

        <!-- Items -->
        <div style="margin-bottom: 12px;">
            <div style="font-size: 10px; font-weight: bold; margin-bottom: 8px;">REFUNDED ITEMS:</div>
            ${itemsHTML}
        </div>

        <div class="separator"></div>

        <!-- Total -->
        <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; padding-top: 4px;">
                <span>REFUND TOTAL</span>
                <span style="color: #c00;">-${formatCurrency(receipt.refundAmount)}</span>
            </div>
        </div>

        <div class="separator"></div>

        <!-- Payment -->
        <div>
            ${refundMethodHTML}
            ${receipt.stripeRefundId ? `
            <div style="font-size: 10px; color: #666; margin-top: 4px;">
                Stripe ID: ${receipt.stripeRefundId}
            </div>
            ` : ''}
        </div>

        <div class="separator" style="margin: 12px 0 8px 0;"></div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 11px;">
            ${hasCardRefund ? `
            <div style="margin-bottom: 8px;">
                Card refunds may take 5-10 business days<br/>to appear on your statement.
            </div>
            ` : ''}
            <div>
                Thank you for shopping at Ravenlia!
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Print a refund receipt
 * - Electron: Uses native ESC/POS thermal printing
 * - DEV_MODE: Opens HTML preview in new window
 * - Production: Sends to localhost bridge server
 */
export async function printRefundReceipt(receipt: RefundReceiptData): Promise<{ success: boolean; error?: string }> {
    try {
        // Electron desktop app: use native printing
        if (isElectron() && window.electronAPI) {
            const result = await window.electronAPI.printRefundReceipt(receipt);
            if (result.warning) {
                console.warn('Refund printing warning:', result.warning, {
                    mode: result.mode,
                    driver: result.driver,
                });
            }
            return result;
        }

        if (DEV_MODE) {
            // Open receipt in new window for preview/print
            const html = generateRefundReceiptHTML(receipt);
            const printWindow = window.open('', '_blank', 'width=400,height=600');

            if (!printWindow) {
                return {
                    success: false,
                    error: 'Could not open print window. Please allow popups.'
                };
            }

            printWindow.document.write(html);
            printWindow.document.close();

            // Wait for content to load, then trigger print dialog
            printWindow.onload = () => {
                printWindow.print();
            };

            return { success: true };
        } else {
            // Production mode: send to bridge server
            const response = await fetch('http://localhost:3000/print-refund', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(receipt),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `Print server error: ${errorText}`
                };
            }

            return { success: true };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown print error';
        console.error('Print refund receipt error:', error);
        return { success: false, error: message };
    }
}
