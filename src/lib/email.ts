import 'server-only'

import { Resend } from 'resend'
import { optionalEnv, requireEnv } from '@/lib/env'
import { formatUsd } from '@/lib/utils'

let cached: Resend | null = null

function getResend(): Resend {
  if (!cached) cached = new Resend(requireEnv('RESEND_API_KEY'))
  return cached
}

export interface DeliveryEmail {
  to: string
  downloadUrl: string
  expiresAt: Date
  hs4: string
  keyword?: string | null
  recordCount: number
  amountCents: number
  packName: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHtml(input: DeliveryEmail): string {
  const expiry = input.expiresAt.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const niche = escapeHtml(
    [input.keyword, `HS ${input.hs4}`].filter(Boolean).join(' · '),
  )

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
      <tr>
        <td style="padding:28px 28px 8px 28px;">
          <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em;">caius<span style="color:#dc2626;">.</span>data</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 0 28px;">
          <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;">Your buyer pack is ready</h1>
          <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#3f3f46;">
            Thanks for your order. Your <strong>${escapeHtml(input.packName)}</strong> pack contains
            <strong>${input.recordCount}</strong> US importer ${input.recordCount === 1 ? 'company' : 'companies'} for
            <strong>${niche}</strong>, ranked by shipment volume.
          </p>
          <p style="margin:0 0 24px 0;">
            <a href="${input.downloadUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;">Download your CSV</a>
          </p>
          <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#71717a;">
            This link works until <strong>${expiry}</strong> (7 days). Save the file somewhere
            safe — reply to this email if you need it re-issued.
          </p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#52525b;">
            <tr><td style="padding:3px 0;">Pack</td><td align="right">${escapeHtml(input.packName)} · ${input.recordCount} records</td></tr>
            <tr><td style="padding:3px 0;">HS code</td><td align="right">${escapeHtml(input.hs4)}</td></tr>
            <tr><td style="padding:3px 0;">Paid</td><td align="right">${formatUsd(input.amountCents)} (one time)</td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 28px 28px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            Caius Data · a Wyoming LLC · No subscription, no auto-renewal.<br />
            You received this because you purchased a buyer pack at caiusdata.com.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderText(input: DeliveryEmail): string {
  const expiry = input.expiresAt.toISOString().slice(0, 10)
  return [
    'Your Caius Data buyer pack is ready.',
    '',
    `Pack: ${input.packName} (${input.recordCount} US importer companies)`,
    `HS code: ${input.hs4}${input.keyword ? ` · ${input.keyword}` : ''}`,
    `Paid: ${formatUsd(input.amountCents)} (one time)`,
    '',
    'Download:',
    input.downloadUrl,
    '',
    `This link expires on ${expiry} (7 days from purchase).`,
    '',
    'Caius Data · a Wyoming LLC · caiusdata.com',
  ].join('\n')
}

export async function sendPackDeliveryEmail(input: DeliveryEmail) {
  const resend = getResend()
  const from = optionalEnv(
    'RESEND_FROM_EMAIL',
    'Caius Data <orders@mail.caiusdata.com>',
  )
  const replyTo = process.env.RESEND_REPLY_TO

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    ...(replyTo ? { replyTo } : {}),
      subject: `Your ${input.recordCount} US buyer records (HS ${input.hs4}) are ready`,
    html: renderHtml(input),
    text: renderText(input),
  })

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`)
  }

  return data
}
