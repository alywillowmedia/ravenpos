// Supabase Edge Function: send-till-count-report
// Sends employee till count report emails to admins via Resend API

import { corsHeaders } from '../_shared/cors.ts'

interface TillBreakdownLine {
  label: string
  quantity: number
  amount: number
}

interface TillReport {
  countedAt: string
  businessDate?: string
  expectedFromSales: number
  checkCount?: number
  checkTotal?: number
  manualAdjustment?: number
  openingFloat: number
  expectedDrawerTotal: number
  countedTotal: number
  variance: number
  denominationBreakdown: TillBreakdownLine[]
}

interface RequestBody {
  adminEmail: string
  adminName?: string
  employeeName: string
  report: TillReport
  timezone?: string
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatDate(value: string, timezone?: string): string {
  const date = new Date(value)
  const tz = timezone || 'America/New_York'
  return (
    date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: tz,
    }) +
    ' ' +
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    })
  )
}

function formatBusinessDate(value: string | undefined): string {
  if (!value) return ''
  const parts = value.split('-').map(Number)
  const [year, month, day] = parts
  if (!year || !month || !day) return value

  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function sanitizeName(value: string | undefined): string {
  if (!value) return ''
  return value.trim()
}

function buildEmailHtml(payload: RequestBody): string {
  const { adminName, employeeName, report, timezone } = payload
  const createdAt = formatDate(report.countedAt, timezone)
  const businessDate = formatBusinessDate(report.businessDate)
  const varianceColor = report.variance > 0.009 ? '#16a34a' : report.variance < -0.009 ? '#dc2626' : '#111827'
  const varianceLabel = `${report.variance >= 0 ? '+' : ''}${formatCurrency(report.variance)}`
  const rows = report.denominationBreakdown
    .filter((line) => line.quantity > 0)
    .map(
      (line) => `
        <tr>
          <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;">${line.label}</td>
          <td style="padding:6px 0;text-align:center;font-family:'Courier New',Courier,monospace;font-size:13px;">${line.quantity}</td>
          <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;">${formatCurrency(line.amount)}</td>
        </tr>
      `
    )
    .join('')

  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Till Count Report</title>
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
      <tr>
        <td style="padding:24px 24px 16px 24px;text-align:center;border-bottom:1px dashed #d1d5db;">
          <p style="margin:0;font-size:12px;color:#6b7280;letter-spacing:1px;">RAVENPOS</p>
          <h1 style="margin:6px 0 0 0;font-size:20px;font-family:'Courier New',Courier,monospace;">TILL COUNT RECEIPT</h1>
          <p style="margin:6px 0 0 0;font-size:12px;color:#6b7280;">${createdAt}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-bottom:1px dashed #d1d5db;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#4b5563;">To: ${sanitizeName(adminName) || payload.adminEmail}</p>
          <p style="margin:0;font-size:13px;color:#4b5563;">Submitted By: ${sanitizeName(employeeName) || 'Employee'}</p>
          ${businessDate ? `<p style="margin:4px 0 0 0;font-size:13px;color:#4b5563;">Sales Date: ${businessDate}</p>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-bottom:1px dashed #d1d5db;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;">Expected From Sales</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;">${formatCurrency(report.expectedFromSales)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;">Check Qty</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;">${Number(report.checkCount || 0)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;">Check Amt</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;">${formatCurrency(Number(report.checkTotal || 0))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;">Opening Float</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;">${formatCurrency(report.openingFloat)}</td>
            </tr>
            ${Math.abs(Number(report.manualAdjustment || 0)) > 0.0001 ? `
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;">Manual Adjustment</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;">${formatCurrency(Number(report.manualAdjustment || 0))}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;">Expected Drawer</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;">${formatCurrency(report.expectedDrawerTotal)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;">Counted Total</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;">${formatCurrency(report.countedTotal)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;">Variance</td>
              <td style="padding:6px 0;text-align:right;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:${varianceColor};">${varianceLabel}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;">
          <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Denomination Breakdown</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <th style="padding:4px 0;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Denom</th>
              <th style="padding:4px 0;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">Qty</th>
              <th style="padding:4px 0;text-align:right;font-size:11px;color:#6b7280;font-weight:600;">Amount</th>
            </tr>
            ${rows || '<tr><td colspan="3" style="padding:8px 0;font-size:12px;color:#6b7280;">No denominations entered.</td></tr>'}
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

    const body: RequestBody = await req.json()
    if (!body.adminEmail || !body.employeeName || !body.report) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.adminEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid admin email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const html = buildEmailHtml(body)
    const subjectDate = formatBusinessDate(body.report.businessDate) || formatDate(body.report.countedAt, body.timezone)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RavenPOS <email@ravenlia.com>',
        to: [body.adminEmail],
        subject: `Till Count Report • ${body.employeeName} • ${subjectDate}`,
        html,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      return new Response(
        JSON.stringify({ error: errorData.message || 'Failed to send email' }),
        { status: resendResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await resendResponse.json()
    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
