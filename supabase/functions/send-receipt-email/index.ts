// Supabase Edge Function: send-receipt-email
// Sends receipt emails via Resend API

import { corsHeaders } from '../_shared/cors.ts'

interface ReceiptItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    consignorName: string;
    consignorId: string;
    imageUrl?: string | null;
}

interface ReceiptData {
    transactionId: string;
    date: string; // ISO string when sent over JSON
    items: ReceiptItem[];
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod: 'cash' | 'card';
    cashTendered?: number;
    changeGiven?: number;
}

interface RequestBody {
    receipt: ReceiptData;
    customerEmail: string;
    customerName?: string;
    timezone?: string;
}

function generateEmailHTML(receipt: ReceiptData, timezone?: string): string {
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const tz = timezone || 'America/New_York'; // Default to EST if not provided
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
        const { receipt, customerEmail, customerName, timezone } = body

        if (!receipt || !customerEmail) {
            return new Response(
                JSON.stringify({ error: 'Missing receipt or customerEmail' }),
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
        const html = generateEmailHTML(receipt, timezone)
        const transactionId = receipt.transactionId.slice(0, 8).toUpperCase()

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
                subject: `Receipt #${transactionId} - Ravenlia`,
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
        console.log('Email sent successfully:', result.id)

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
