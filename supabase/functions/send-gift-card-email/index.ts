import { corsHeaders } from '../_shared/cors.ts'

interface RequestBody {
    code: string
    amount: number
    toName?: string
    toEmail: string
    fromName?: string
    message?: string
}

function formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`
}

function generateGiftCardHTML(body: RequestBody): string {
    const recipient = body.toName?.trim() || 'there'
    const from = body.fromName?.trim() || 'A friend'
    const note = body.message?.trim()

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Ravenlia Gift Card</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5;">
    <tr>
      <td style="padding:28px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:28px 28px 10px 28px;text-align:center;">
              <h1 style="margin:0;font-size:30px;font-weight:800;letter-spacing:2px;color:#111;">RAVENLIA</h1>
              <p style="margin:10px 0 0 0;font-size:15px;color:#666;">Gift Card Delivery</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 0 28px;">
              <div style="border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;padding:18px;">
                <p style="margin:0 0 8px 0;font-size:16px;color:#111;">Hi ${recipient},</p>
                <p style="margin:0;font-size:14px;color:#444;">${from} sent you a Ravenlia gift card.</p>
                <p style="margin:14px 0 0 0;font-size:30px;line-height:1.1;font-weight:800;color:#111;">${formatCurrency(body.amount)}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 0 28px;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Gift Card Code</p>
              <p style="margin:0;padding:12px 14px;border-radius:10px;border:1px dashed #9ca3af;background:#f9fafb;font-size:22px;font-family:'Courier New',Courier,monospace;font-weight:700;color:#111;text-align:center;">
                ${body.code}
              </p>
            </td>
          </tr>
          ${note ? `
          <tr>
            <td style="padding:16px 28px 0 28px;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Message</p>
              <p style="margin:0;padding:12px 14px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;font-size:14px;color:#374151;">${note}</p>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding:18px 28px 26px 28px;">
              <p style="margin:0;font-size:13px;color:#6b7280;">
                Use this code at RavenPOS checkout. Keep this email for your records.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        if (!resendApiKey) {
            return new Response(
                JSON.stringify({ error: 'Email service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body = await req.json() as RequestBody

        if (!body.code || !body.toEmail || !body.amount || body.amount <= 0) {
            return new Response(
                JSON.stringify({ error: 'Missing required gift card data' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(body.toEmail)) {
            return new Response(
                JSON.stringify({ error: 'Invalid recipient email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const html = generateGiftCardHTML(body)
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Ravenlia <email@ravenlia.com>',
                to: body.toEmail,
                subject: `You received a ${formatCurrency(body.amount)} Ravenlia gift card`,
                html,
            }),
        })

        if (!resendResponse.ok) {
            const errorData = await resendResponse.json()
            return new Response(
                JSON.stringify({ error: errorData.message || 'Failed to send email' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const result = await resendResponse.json()
        return new Response(
            JSON.stringify({ success: true, emailId: result.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown server error'
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
