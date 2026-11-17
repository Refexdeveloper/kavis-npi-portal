/** Kavis Pharma branded HTML email templates for NPI portal notifications. */

const BRAND = {
  name: 'Kavis Pharma',
  product: 'NPI Portal',
  primary: '#0D77B2',
  primaryDark: '#0f5299',
  accent: '#e85a4f',
  muted: '#5b6b7c',
  border: '#d7e3ef',
  bg: '#f4f8fb',
  website: 'https://kavispharma.com/',
  support: 'support@kavispharma.com',
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type MailDetail = { label: string; value: string }

export function wrapMailHtml(opts: {
  title: string
  preheader?: string
  intro: string
  details?: MailDetail[]
  ctaLabel?: string
  ctaUrl?: string
  note?: string
}): string {
  const rows = (opts.details || [])
    .map(
      (d) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:13px;width:38%;vertical-align:top;">${esc(d.label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:#123;font-size:14px;font-weight:600;vertical-align:top;">${esc(d.value)}</td>
      </tr>`,
    )
    .join('')

  const cta = opts.ctaUrl
    ? `<p style="margin:28px 0 8px;">
        <a href="${esc(opts.ctaUrl)}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px;">
          ${esc(opts.ctaLabel || 'Open in NPI Portal')}
        </a>
      </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#123;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader || opts.intro)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td style="background:linear-gradient(90deg,${BRAND.primary},${BRAND.primaryDark});padding:22px 28px;">
              <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.04em;">${BRAND.name.toUpperCase()}</div>
              <div style="color:#d7ecf8;font-size:13px;margin-top:4px;">${BRAND.product} · CDMO New Product Introduction</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#0b2c44;">${esc(opts.title)}</h1>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#234;">${esc(opts.intro)}</p>
              ${rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">${rows}</table>` : ''}
              ${cta}
              ${opts.note ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${esc(opts.note)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fbfe;padding:16px 28px;border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.muted};line-height:1.55;">
              This message was sent by ${BRAND.name} ${BRAND.product}. Do not reply to automated mail unless your SMTP From address is monitored.<br/>
              Web: <a href="${BRAND.website}" style="color:${BRAND.primary};">${BRAND.website}</a>
              · Support: <a href="mailto:${BRAND.support}" style="color:${BRAND.primary};">${BRAND.support}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function plainTextFromDetails(intro: string, details: MailDetail[] = [], ctaUrl?: string) {
  const lines = [intro, '', ...details.map((d) => `${d.label}: ${d.value}`)]
  if (ctaUrl) lines.push('', `Open: ${ctaUrl}`)
  lines.push('', `${BRAND.name} · ${BRAND.website}`)
  return lines.join('\n')
}
