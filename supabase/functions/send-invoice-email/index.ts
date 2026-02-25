// Supabase Edge Function: send-invoice-email
// Sends invoice emails via Resend API

import { corsHeaders } from '../_shared/cors.ts'

interface InvoiceItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    consignorName?: string;
}

interface InvoiceData {
    invoiceId: string;
    date: string; // ISO string
    items: InvoiceItem[];
    subtotal: number;
    tax: number;
    total: number;
    recipientName: string;
    recipientType: 'customer' | 'vendor';
    note?: string;
}

interface RequestBody {
    invoice: InvoiceData;
    recipientEmail: string;
    recipientName?: string;
    timezone?: string;
}

function generateInvoiceEmailHTML(invoice: InvoiceData, timezone?: string): string {
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

    const itemsHTML = invoice.items.map(item => `
        <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: 'Courier New', Courier, monospace; font-size: 14px; vertical-align: top;">
                <div style="font-weight: 500;">
                    ${item.quantity > 1 ? `${item.quantity}× ` : ''}${item.name}
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 2px;">
                    ${item.quantity > 1 ? `@ ${formatCurrency(item.price)} each` : ''}
                    ${item.consignorName ? ` · Vendor: ${item.consignorName}` : ''}
                </div>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px; white-space: nowrap; vertical-align: top;">
                ${formatCurrency(item.lineTotal)}
            </td>
        </tr>
    `).join('');

    const noteHTML = invoice.note ? `
        <tr>
            <td style="padding: 8px 0; font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #666;">
                Note: ${invoice.note}
            </td>
        </tr>
    ` : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice #${invoice.invoiceId.slice(0, 8).toUpperCase()} - Ravenlia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 420px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 16px 32px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #1a1a1a; font-family: 'Courier New', Courier, monospace;">
                                RAVENLIA
                            </h1>
                            <div style="display: inline-block; margin-top: 12px; padding: 6px 16px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 20px;">
                                <span style="color: #1d4ed8; font-weight: 600; font-size: 14px;">INVOICE</span>
                            </div>
                            <div style="border-bottom: 2px dashed #ddd; margin: 16px 0;"></div>
                            <p style="margin: 0; font-size: 13px; color: #666;">${formatDate(invoice.date)}</p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #999; font-family: 'Courier New', Courier, monospace;">
                                Invoice #${invoice.invoiceId.slice(0, 8).toUpperCase()}
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">To: ${invoice.recipientName}</p>
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
                                    <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px;">${formatCurrency(invoice.subtotal)}</td>
                                </tr>
                                ${invoice.tax > 0 ? `
                                <tr>
                                    <td style="padding: 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #666;">Tax</td>
                                    <td style="padding: 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #666;">${formatCurrency(invoice.tax)}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td style="padding: 12px 0 4px 0; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a;">TOTAL</td>
                                    <td style="padding: 12px 0 4px 0; text-align: right; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a;">${formatCurrency(invoice.total)}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Note -->
                    ${noteHTML ? `<tr><td style="padding: 0 32px 16px 32px;">${noteHTML}</td></tr>` : ''}

                    <!-- Payment Instructions -->
                    <tr>
                        <td style="padding: 0 32px 24px 32px;">
                            <div style="border-bottom: 2px dashed #ddd; margin-bottom: 16px;"></div>
                            <p style="margin: 0; font-size: 13px; color: #555; text-align: center;">
                                Please call us to pay with a card, or stop by in person to pay in person.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px 32px 32px; text-align: center; background-color: #fafafa; border-radius: 0 0 12px 12px;">
                            <p style="margin: 0; font-size: 14px; color: #333;">Thanks for supporting Ravenlia!</p>
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">Ravenlia — from the hands of artisans to the heart of community.</p>
                        </td>
                    </tr>
                </table>

                <p style="text-align: center; font-size: 11px; color: #999; margin-top: 24px;">
                    This is an automated invoice from Ravenlia. Please do not reply to this email.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

Deno.serve(async (req) => {
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
        const { invoice, recipientEmail, timezone } = body

        if (!invoice || !recipientEmail) {
            return new Response(
                JSON.stringify({ error: 'Missing invoice or recipientEmail' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(recipientEmail)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const html = generateInvoiceEmailHTML(invoice, timezone)
        const invoiceId = invoice.invoiceId.slice(0, 8).toUpperCase()

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Ravenlia <email@ravenlia.com>',
                to: [recipientEmail],
                subject: `Invoice #${invoiceId} - Ravenlia`,
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
        console.log('Invoice email sent successfully:', result.id)

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
