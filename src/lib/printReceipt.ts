import type { ReceiptData, ReceiptItem, RefundReceiptData } from '../types/receipt';
import type { CartItem, Sale } from '../types';

/**
 * DEV_MODE toggle:
 * - true: Opens receipt as HTML in new window with print dialog (for testing)
 * - false: Sends to localhost:3000/print bridge server (for actual thermal printing)
 */
const DEV_MODE = true;

/**
 * Convert cart items and sale data to receipt format
 */
export function createReceiptData(
    sale: Sale,
    cartItems: CartItem[]
): ReceiptData {
    const items: ReceiptItem[] = cartItems.map((cartItem) => ({
        name: cartItem.item.name + (cartItem.item.variant ? ` - ${cartItem.item.variant}` : ''),
        quantity: cartItem.quantity,
        price: Number(cartItem.item.price),
        lineTotal: cartItem.lineTotal,
        consignorName: (cartItem.item.consignor?.name) ?? 'Unknown Vendor',
        consignorId: cartItem.item.consignor_id,
        imageUrl: cartItem.item.image_url,
    }));

    return {
        transactionId: sale.id,
        date: new Date(sale.completed_at),
        items,
        subtotal: Number(sale.subtotal),
        tax: Number(sale.tax_amount),
        total: Number(sale.total),
        paymentMethod: sale.payment_method,
        cashTendered: sale.cash_tendered ? Number(sale.cash_tendered) : undefined,
        changeGiven: sale.change_given ? Number(sale.change_given) : undefined,
    };
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

    const itemsHTML = receipt.items.map(item => `
        <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between;">
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">
                    ${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name}
                </span>
                <span style="white-space: nowrap;">${formatCurrency(item.lineTotal)}</span>
            </div>
            <div style="font-size: 10px; color: #666; padding-left: 8px;">
                ${item.quantity > 1 ? `<div>@ ${formatCurrency(item.price)} each</div>` : ''}
                <div>Vendor: ${item.consignorName}</div>
            </div>
        </div>
    `).join('');

    const paymentHTML = receipt.paymentMethod === 'cash' && receipt.cashTendered !== undefined
        ? `
            <div style="display: flex; justify-content: space-between;">
                <span>Cash</span>
                <span>${formatCurrency(receipt.cashTendered)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>Change</span>
                <span>${formatCurrency(receipt.changeGiven ?? 0)}</span>
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
                Transaction: #${receipt.transactionId.slice(0, 8).toUpperCase()}
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
            ${receipt.tax > 0 ? `
                <div style="display: flex; justify-content: space-between;">
                    <span>Tax</span>
                    <span>${formatCurrency(receipt.tax)}</span>
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
            <div style="display: flex; justify-content: space-between;">
                <span>Payment</span>
                <span>${receipt.paymentMethod.toUpperCase()}</span>
            </div>
            ${paymentHTML}
        </div>

        <div class="separator" style="margin: 12px 0 8px 0;"></div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 11px;">
            <div style="margin-bottom: 4px;">
                Thank you for shopping at Ravenlia!
            </div>
            <div style="font-size: 10px; color: #666;">
                Keep receipt for returns
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Print a receipt
 * - DEV_MODE: Opens HTML preview in new window
 * - Production: Sends to localhost bridge server
 */
export async function printReceipt(receipt: ReceiptData): Promise<{ success: boolean; error?: string }> {
    try {
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
            <div style="display: flex; justify-content: space-between;">
                <span>Refund Method</span>
                <span>${receipt.paymentMethod.toUpperCase()}</span>
            </div>
            ${receipt.stripeRefundId ? `
            <div style="font-size: 10px; color: #666; margin-top: 4px;">
                Stripe ID: ${receipt.stripeRefundId}
            </div>
            ` : ''}
        </div>

        <div class="separator" style="margin: 12px 0 8px 0;"></div>

        <!-- Footer -->
        <div style="text-align: center; font-size: 11px;">
            ${receipt.paymentMethod === 'card' ? `
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
 */
export async function printRefundReceipt(receipt: RefundReceiptData): Promise<{ success: boolean; error?: string }> {
    try {
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

