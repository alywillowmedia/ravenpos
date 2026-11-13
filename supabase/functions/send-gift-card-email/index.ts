import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface RequestBody {
    code: string
    amount: number
    toName?: string
    toEmail: string
    fromName?: string
    message?: string
    /** Card design; matches src/lib/giftCardThemes.ts. */
    occasion?: string
    brand?: string
    /** Set for a vendor card, which is only good for that vendor's items. */
    vendorName?: string
}

interface Palette { bg: string; ink: string; accent: string; line: string }

// Keep in step with GIFT_CARD_OCCASIONS in src/lib/giftCardThemes.ts.
const OCCASIONS: Record<string, { headline: string; ravenlia: Palette; alywillow: Palette }> = {
    everyday: {
        headline: 'A gift for you',
        ravenlia: { bg: '#F3ECDD', ink: '#2B2420', accent: '#8F5236', line: '#B9A88E' },
        alywillow: { bg: '#ECEBE3', ink: '#29251F', accent: '#566548', line: '#A9AE98' },
    },
    birthday: {
        headline: 'Happy Birthday',
        ravenlia: { bg: '#F7E8D8', ink: '#33241F', accent: '#B4492F', line: '#D9B79B' },
        alywillow: { bg: '#F1EBDD', ink: '#29251F', accent: '#94583B', line: '#C9BBA0' },
    },
    thankyou: {
        headline: 'Thank you',
        ravenlia: { bg: '#EFE6D2', ink: '#2B2420', accent: '#6B5B2E', line: '#BDAE86' },
        alywillow: { bg: '#E7EBE0', ink: '#29251F', accent: '#4E6350', line: '#A3B09C' },
    },
    christmas: {
        headline: 'Merry Christmas',
        ravenlia: { bg: '#1E3A2D', ink: '#F3ECDD', accent: '#D0AC62', line: '#6E8A6F' },
        alywillow: { bg: '#EDEBE1', ink: '#243528', accent: '#8C3B2E', line: '#A9AE98' },
    },
    holidays: {
        headline: 'Happy Holidays',
        ravenlia: { bg: '#1F2A3C', ink: '#F1ECE0', accent: '#C9B88A', line: '#5E6C82' },
        alywillow: { bg: '#E6EAEA', ink: '#25302F', accent: '#4F6B6A', line: '#A5B3B1' },
    },
}

function formatCurrency(amount: number): string {
    return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function generateGiftCardHTML(body: RequestBody): string {
    const recipient = escapeHtml(body.toName?.trim() || 'there')
    const from = escapeHtml(body.fromName?.trim() || 'A friend')
    const note = escapeHtml(body.message?.trim() || '')
    const code = escapeHtml(body.code)
    const vendorName = escapeHtml(body.vendorName?.trim() || '')
    const brand = body.brand === 'alywillow' ? 'alywillow' : 'ravenlia'
    const occasion = OCCASIONS[body.occasion || ''] || OCCASIONS.everyday
    const palette = occasion[brand]
    const brandName = brand === 'alywillow' ? 'Alywillow Organics' : 'Ravenlia Galleria'
    const serif = "Georgia,'Times New Roman',serif"
    const label = `font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${palette.accent};`
    const scope = vendorName
        ? `Good for ${vendorName} items at Ravenlia`
        : 'Good for anything at Ravenlia'
    const howToUse = vendorName
        ? `Show this email or give the code at checkout at Ravenlia. This card pays for ${vendorName} items.`
        : 'Show this email or give the code at checkout at Ravenlia.'

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${brandName} gift card</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f1ea;">
    <tr>
      <td style="padding:28px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
          <tr>
            <td style="padding:0 4px 16px 4px;font-size:15px;color:#3b342d;">
              Hi ${recipient}, ${from} sent you a gift card.
            </td>
          </tr>
          <tr>
            <td style="background:${palette.bg};padding:10px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${palette.line};">
                <tr>
                  <td style="padding:22px 22px 0 22px;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${palette.accent};">
                    ${brandName}
                  </td>
                  <td rowspan="2" style="padding:22px 22px 0 12px;text-align:right;vertical-align:top;font-family:${serif};font-size:44px;line-height:1;color:${palette.ink};white-space:nowrap;">
                    ${formatCurrency(body.amount)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 0 22px;font-family:${serif};font-size:30px;line-height:1.1;color:${palette.ink};">
                    ${occasion.headline}
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:20px 22px 0 22px;font-size:14px;line-height:1.6;color:${palette.ink};">
                    <span style="${label}">To</span>&nbsp; ${recipient}<br>
                    <span style="${label}">From</span>&nbsp; ${from}
                    ${note ? `<div style="margin-top:10px;font-family:${serif};font-style:italic;font-size:15px;">&ldquo;${note}&rdquo;</div>` : ''}
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:20px 22px 22px 22px;">
                    <div style="background:#fffdf8;padding:12px 14px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;letter-spacing:0.08em;color:#1c1917;">
                      ${code}
                    </div>
                    <div style="margin-top:10px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${palette.ink};">
                      ${scope}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 4px 0 4px;font-size:13px;color:#6b6258;">
              ${howToUse} Keep this email for your records.
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

function reply(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

// Only staff may send gift card emails: an admin or employee login, or a
// PIN session at a terminal. Vendors and anonymous callers are refused.
async function refuseUnlessStaff(req: Request): Promise<Response | null> {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return reply({ error: 'Missing authorization header' }, 401)

    const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: { user }, error: authError } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return reply({ error: 'Invalid token' }, 401)

    const { data: userRow, error: userError } = await adminClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
    if (userError) {
        console.error('User lookup error:', userError.code)
        return reply({ error: 'Could not check access' }, 500)
    }
    if (userRow?.role === 'admin' || userRow?.role === 'employee') return null

    const { data: session, error: sessionError } = await adminClient
        .from('employee_sessions')
        .select('employee_id')
        .eq('auth_user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle()
    if (sessionError) {
        console.error('Session lookup error:', sessionError.code)
        return reply({ error: 'Could not check access' }, 500)
    }
    if (session) return null

    return reply({ error: 'Staff access required' }, 403)
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const refusal = await refuseUnlessStaff(req)
        if (refusal) return refusal

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
        const brandLabel = body.brand === 'alywillow' ? 'Alywillow' : 'Ravenlia'
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Ravenlia <email@ravenlia.com>',
                to: body.toEmail,
                subject: `You received a ${formatCurrency(body.amount)} ${brandLabel} gift card`,
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
