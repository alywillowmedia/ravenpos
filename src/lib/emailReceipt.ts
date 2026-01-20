import { supabase } from './supabase';
import type { ReceiptData, RefundReceiptData } from '../types/receipt';

/**
 * Generate email-safe HTML for receipt
 * Uses inline styles and table layout for email client compatibility
 */
export function generateEmailHTML(receipt: ReceiptData): string {
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

    const itemsHTML = receipt.items.map(item => {
        const imageCell = item.imageUrl ? `
            <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; vertical-align: top; width: 50px;">
                <img src="${item.imageUrl}" alt="${item.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 4px; display: block;" />
            </td>
        ` : '';

        return `
        <tr>
            ${imageCell}
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: 'Courier New', Courier, monospace; font-size: 14px; vertical-align: top;">
                <div style="font-weight: 500;">
                    ${item.quantity > 1 ? `${item.quantity}× ` : ''}${item.name}
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 2px;">
                    ${item.quantity > 1 ? `@ ${formatCurrency(item.price)} each · ` : ''}Vendor: ${item.consignorName}
                </div>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px; white-space: nowrap; vertical-align: top;">
                ${formatCurrency(item.lineTotal)}
            </td>
        </tr>
    `;
    }).join('');

    const paymentHTML = receipt.paymentMethod === 'cash' && receipt.cashTendered !== undefined
        ? `
            <tr>
                <td style="padding: 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 14px;">Cash Tendered</td>
                <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px;">${formatCurrency(receipt.cashTendered)}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: bold;">Change</td>
                <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: bold;">${formatCurrency(receipt.changeGiven ?? 0)}</td>
            </tr>
        `
        : `
            <tr>
                <td style="padding: 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 14px;">Paid by</td>
                <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px;">Card</td>
            </tr>
        `;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt #${receipt.transactionId.slice(0, 8).toUpperCase()} - Ravenlia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 16px 32px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #1a1a1a; font-family: 'Courier New', Courier, monospace;">
                                RAVENLIA
                            </h1>
                            <div style="border-bottom: 2px dashed #ddd; margin: 16px 0;"></div>
                            <p style="margin: 0; font-size: 13px; color: #666;">
                                ${formatDate(receipt.date)}
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #999; font-family: 'Courier New', Courier, monospace;">
                                Transaction #${receipt.transactionId.slice(0, 8).toUpperCase()}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Items -->
                    <tr>
                        <td style="padding: 0 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                                ${itemsHTML}
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Totals -->
                    <tr>
                        <td style="padding: 16px 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                                <tr>
                                    <td style="padding: 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 14px;">Subtotal</td>
                                    <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px;">${formatCurrency(receipt.subtotal)}</td>
                                </tr>
                                ${receipt.tax > 0 ? `
                                <tr>
                                    <td style="padding: 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #666;">Tax</td>
                                    <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #666;">${formatCurrency(receipt.tax)}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td style="padding: 12px 0 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a;">TOTAL</td>
                                    <td style="padding: 12px 0 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a;">${formatCurrency(receipt.total)}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Payment -->
                    <tr>
                        <td style="padding: 0 32px 16px 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                                ${paymentHTML}
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px 32px 32px; text-align: center; background-color: #fafafa; border-radius: 0 0 12px 12px;">
                            <p style="margin: 0; font-size: 14px; color: #333;">
                                Thank you for shopping at Ravenlia!
                            </p>
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">
                                Keep this email as your receipt for returns
                            </p>
                        </td>
                    </tr>
                </table>
                
                <!-- Footer note -->
                <p style="text-align: center; font-size: 11px; color: #999; margin-top: 24px;">
                    This is an automated receipt from Ravenlia. Please do not reply to this email.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Result of sending email receipt
 */
export interface SendEmailResult {
    success: boolean;
    error?: string;
}

/**
 * Send receipt via email using Supabase Edge Function
 */
export async function sendReceiptEmail(
    receipt: ReceiptData,
    customerEmail: string,
    customerName?: string
): Promise<SendEmailResult> {
    try {
        // Call the Edge Function without auth (JWT verification is disabled)
        const response = await supabase.functions.invoke('send-receipt-email', {
            body: {
                receipt,
                customerEmail,
                customerName,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
        });

        if (response.error) {
            console.error('Email send error:', response.error);
            return {
                success: false,
                error: response.error.message || 'Failed to send email'
            };
        }

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown email error';
        console.error('Send receipt email error:', error);
        return { success: false, error: message };
    }
}

/**
 * Generate email-safe HTML for refund receipt
 */
export function generateRefundEmailHTML(refund: RefundReceiptData): string {
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

    const itemsHTML = refund.items.map(item => `
        <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: 'Courier New', Courier, monospace; font-size: 14px; vertical-align: top;">
                <div style="font-weight: 500;">
                    ${item.quantity > 1 ? `${item.quantity}× ` : ''}${item.name}
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 2px;">
                    ${item.quantity > 1 ? `@ ${formatCurrency(item.price)} each` : ''}
                    ${item.restocked ? '<span style="color: #22c55e;">• Restocked</span>' : ''}
                </div>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px; white-space: nowrap; vertical-align: top; color: #dc2626;">
                -${formatCurrency(item.lineTotal)}
            </td>
        </tr>
    `).join('');

    const paymentHTML = refund.paymentMethod === 'cash'
        ? `<p style="margin: 0; font-size: 14px; color: #666;">Cash refund provided at register</p>`
        : `<p style="margin: 0; font-size: 14px; color: #666;">Refund will appear on your card within 5-10 business days</p>`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Refund Receipt #${refund.refundId.slice(0, 8).toUpperCase()} - Ravenlia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 16px 32px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #1a1a1a; font-family: 'Courier New', Courier, monospace;">
                                RAVENLIA
                            </h1>
                            <div style="display: inline-block; margin-top: 12px; padding: 6px 16px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 20px;">
                                <span style="color: #dc2626; font-weight: 600; font-size: 14px;">REFUND RECEIPT</span>
                            </div>
                            <div style="border-bottom: 2px dashed #ddd; margin: 16px 0;"></div>
                            <p style="margin: 0; font-size: 13px; color: #666;">
                                ${formatDate(refund.date)}
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #999; font-family: 'Courier New', Courier, monospace;">
                                Refund #${refund.refundId.slice(0, 8).toUpperCase()}
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">
                                Original: #${refund.originalTransactionId.slice(0, 8).toUpperCase()}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Items -->
                    <tr>
                        <td style="padding: 0 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                                ${itemsHTML}
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Total -->
                    <tr>
                        <td style="padding: 16px 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                                <tr>
                                    <td style="padding: 12px 0 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; border-top: 2px solid #dc2626;">REFUND TOTAL</td>
                                    <td style="padding: 12px 0 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; color: #dc2626; border-top: 2px solid #dc2626;">-${formatCurrency(refund.refundAmount)}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Payment Info -->
                    <tr>
                        <td style="padding: 0 32px 16px 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <div style="padding: 12px; background-color: #fef2f2; border-radius: 8px;">
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #999; text-transform: uppercase;">Refund Method: ${refund.paymentMethod === 'card' ? 'Card' : 'Cash'}</p>
                                ${paymentHTML}
                                ${refund.stripeRefundId ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #999; font-family: 'Courier New', Courier, monospace;">Ref: ${refund.stripeRefundId}</p>` : ''}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px 32px 32px; text-align: center; background-color: #fafafa; border-radius: 0 0 12px 12px;">
                            <p style="margin: 0; font-size: 14px; color: #333;">
                                Your refund has been processed.
                            </p>
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">
                                Keep this email for your records
                            </p>
                        </td>
                    </tr>
                </table>
                
                <!-- Footer note -->
                <p style="text-align: center; font-size: 11px; color: #999; margin-top: 24px;">
                    This is an automated refund receipt from Ravenlia. Please do not reply to this email.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Send refund receipt via email using Supabase Edge Function
 */
export async function sendRefundReceiptEmail(
    refund: RefundReceiptData,
    customerEmail: string,
    customerName?: string
): Promise<SendEmailResult> {
    try {
        const response = await supabase.functions.invoke('send-refund-receipt-email', {
            body: {
                refund,
                customerEmail,
                customerName,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
        });

        if (response.error) {
            console.error('Refund email send error:', response.error);
            return {
                success: false,
                error: response.error.message || 'Failed to send refund email'
            };
        }

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown email error';
        console.error('Send refund receipt email error:', error);
        return { success: false, error: message };
    }
}
