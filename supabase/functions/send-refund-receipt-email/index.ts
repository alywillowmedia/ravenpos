// Supabase Edge Function: send-refund-receipt-email
// Sends refund receipt emails via Resend API

import { corsHeaders } from '../_shared/cors.ts'

interface RefundReceiptItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    restocked: boolean;
}

interface RefundReceiptData {
    refundId: string;
    originalTransactionId: string;
    date: string; // ISO string when sent over JSON
    items: RefundReceiptItem[];
    refundAmount: number;
    paymentMethod: 'cash' | 'card';
    stripeRefundId?: string;
}

interface RequestBody {
    refund: RefundReceiptData;
    customerEmail: string;
    customerName?: string;
    timezone?: string;
}

function generateRefundEmailHTML(refund: RefundReceiptData, timezone?: string): string {
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const tz = timezone || 'America/New_York';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: tz,
        }) + ' ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: tz,
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

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        if (!resendApiKey) {
            console.error('RESEND_API_KEY not configured')
            return new Response(
                JSON.stringify({ error: 'Email service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body: RequestBody = await req.json()
        const { refund, customerEmail, customerName, timezone } = body

        if (!refund || !customerEmail) {
            return new Response(
                JSON.stringify({ error: 'Missing refund or customerEmail' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(customerEmail)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Generate email HTML
        const html = generateRefundEmailHTML(refund, timezone)
        const refundId = refund.refundId.slice(0, 8).toUpperCase()

        // Send via Resend API
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Ravenlia <email@ravenlia.com>',
                to: [customerEmail],
                subject: `Refund Receipt #${refundId} - Ravenlia`,
                html: html,
            }),
        })

        if (!resendResponse.ok) {
            const errorData = await resendResponse.json()
            console.error('Resend API error:', errorData)
            return new Response(
                JSON.stringify({ error: errorData.message || 'Failed to send email' }),
                { status: resendResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const result = await resendResponse.json()
        console.log('Refund email sent successfully:', result.id)

        return new Response(
            JSON.stringify({ success: true, emailId: result.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Unhandled error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
