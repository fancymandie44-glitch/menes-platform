/**
 * MENES transactional email — multi-provider:
 * 1) Resend (RESEND_API_KEY + RESEND_FROM)
 * 2) Brevo / Sendinblue (BREVO_API_KEY + EMAIL_FROM) — free, no custom domain required
 * 3) Gmail / SMTP (SMTP_USER + SMTP_PASS + EMAIL_FROM)
 */

function fromAddress() {
  return String(
    process.env.EMAIL_FROM
    || process.env.RESEND_FROM
    || process.env.BREVO_FROM
    || process.env.SMTP_FROM
    || process.env.MERCHANT_EMAIL
    || ''
  ).trim();
}

function resendConfigured() {
  const key = Boolean(process.env.RESEND_API_KEY);
  const from = String(process.env.RESEND_FROM || process.env.EMAIL_FROM || '').trim();
  const fromOk = from && !/onboarding@resend\.dev/i.test(from);
  return key && fromOk;
}

function brevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY) && Boolean(fromAddress());
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && fromAddress());
}

function emailConfigured() {
  return resendConfigured() || brevoConfigured() || smtpConfigured();
}

/** @deprecated alias — use emailConfigured */
function emailReady() {
  return emailConfigured();
}

function merchantInbox(store) {
  const email = (
    process.env.MERCHANT_EMAIL
    || store?.site?.email
    || process.env.NOTIFY_EMAIL
    || ''
  ).trim().toLowerCase();
  return email;
}

function orderLines(order) {
  return (order.items || []).map((i) => `${i.name}${i.size ? ` (${i.size})` : ''} ×${i.qty}`).join(', ');
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function brandShell({ title, bodyHtml, footerNote }) {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#050505;font-family:Helvetica,Arial,sans-serif;color:#f4f2ee">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="letter-spacing:0.28em;font-size:12px;color:#c9a84c;text-align:center;margin-bottom:20px">MENES</div>
    <div style="background:#0f0f0f;border:1px solid #2a2a2a;padding:24px">
      <h1 style="margin:0 0 14px;font-size:22px;font-weight:600;color:#f4f2ee">${escHtml(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#6b665e;font-size:11px;margin-top:18px;line-height:1.5">${footerNote || 'MENES · Paiement sécurisé'}</p>
  </div></body></html>`;
}

function buildOrderTable(order, method, status) {
  const total = Number(order.total || 0).toFixed(2);
  const tax = order.tax?.amount
    ? `${Number(order.tax.amount).toFixed(2)}$ (${order.tax.label || ''})`
    : '—';
  const rows = [
    ['Commande', `#${order.id}`],
    ['Statut', status],
    ['Paiement', method],
    ['Client', order.customer?.name || '—'],
    ['Email', order.customer?.email || '—'],
    ['Téléphone', order.customer?.phone || '—'],
    ['Adresse', [order.customer?.address, order.customer?.city, order.customer?.province, order.customer?.postal, order.customer?.country].filter(Boolean).join(', ') || '—'],
    ['Articles', orderLines(order) || '—'],
    ['Sous-total', `${Number(order.subtotal ?? order.total ?? 0).toFixed(2)}$ CAD`],
    ['Taxes', tax],
    ['Total', `${total}$ CAD`],
  ];
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#9a958c;width:130px">${escHtml(k)}</td><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#f4f2ee">${escHtml(v)}</td></tr>`
  ).join('')}</table>`;
}

function buildHtml(order, method, status) {
  const paid = /pay/i.test(status);
  return brandShell({
    title: paid ? 'Commande payée' : 'Commande reçue',
    bodyHtml: buildOrderTable(order, method, status),
    footerNote: 'Console : https://menesadmin.netlify.app → Commandes',
  });
}

function buildCustomerReceiptHtml(order, method) {
  return brandShell({
    title: 'Confirmation de commande',
    bodyHtml: `<p style="color:#9a958c;font-size:15px;line-height:1.6;margin:0 0 16px">Merci pour votre confiance. Voici le récapitulatif de votre commande MENES.</p>${buildOrderTable(order, method, 'Confirmée')}`,
    footerNote: 'Une question ? Répondez à cet email ou contactez-nous via la boutique.',
  });
}

function parseFrom(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '') || 'MENES', email: m[2].trim() };
  return { name: 'MENES', email: s };
}

async function sendViaResend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = String(process.env.RESEND_FROM || process.env.EMAIL_FROM).trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || data.error || `Resend ${res.status}` };
  return { ok: true, id: data.id, provider: 'resend', to };
}

async function sendViaBrevo({ to, subject, html }) {
  const from = parseFrom(fromAddress());
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.message || data.error || `Brevo ${res.status}` };
  }
  return { ok: true, id: data.messageId || data.id, provider: 'brevo', to };
}

async function sendViaSmtp({ to, subject, html }) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    return { ok: false, error: 'nodemailer manquant — npm install nodemailer' };
  }
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = fromAddress();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
  return { ok: true, id: info.messageId, provider: 'smtp', to };
}

/**
 * Unified send — tries Resend → Brevo → SMTP
 */
async function sendEmail({ to, subject, html }) {
  const dest = String(to || '').trim().toLowerCase();
  if (!dest || !dest.includes('@')) return { ok: false, error: 'Destinataire invalide' };
  if (!emailConfigured()) {
    return {
      ok: false,
      error: 'Email non configuré. Options Netlify : BREVO_API_KEY + EMAIL_FROM (recommandé, gratuit) · ou SMTP_USER/SMTP_PASS (Gmail) · ou RESEND_API_KEY.',
    };
  }
  try {
    if (resendConfigured()) {
      const r = await sendViaResend({ to: dest, subject, html });
      if (r.ok) return r;
      console.error('resend failed', r.error);
      // fall through to other providers if available
    }
    if (brevoConfigured()) {
      const r = await sendViaBrevo({ to: dest, subject, html });
      if (r.ok) return r;
      console.error('brevo failed', r.error);
      if (!smtpConfigured()) return r;
    }
    if (smtpConfigured()) {
      return await sendViaSmtp({ to: dest, subject, html });
    }
    return { ok: false, error: 'Tous les providers email ont échoué' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** @deprecated use sendEmail — kept for callers */
async function sendResend(opts) {
  return sendEmail(opts);
}

async function notifyMerchant(order, method, status, store) {
  const to = merchantInbox(store);
  if (!to) {
    return { ok: false, error: 'MERCHANT_EMAIL manquant (ou site.email dans la console).' };
  }
  const subject = `MENES ${status} · #${order.id} · ${Number(order.total || 0).toFixed(2)}$ · ${method}`;
  const html = buildHtml(order, method, status);
  try {
    const result = await sendEmail({ to, subject, html });
    return { ...result, to };
  } catch (e) {
    return { ok: false, to, error: e.message };
  }
}

async function notifyCustomer(order, method) {
  const to = String(order.customer?.email || '').trim().toLowerCase();
  if (!to) return { ok: false, error: 'Email client manquant' };
  const subject = `MENES · Confirmation #${order.id}`;
  const html = buildCustomerReceiptHtml(order, method);
  try {
    return await sendEmail({ to, subject, html });
  } catch (e) {
    return { ok: false, to, error: e.message };
  }
}

async function notifySimple({ to, subject, html, store }) {
  const dest = (to || merchantInbox(store) || '').trim().toLowerCase();
  if (!dest) return { ok: false, error: 'Destinataire manquant' };
  return sendEmail({ to: dest, subject, html });
}

function emailStatusPublic() {
  return {
    configured: emailConfigured(),
    providers: {
      resend: resendConfigured(),
      brevo: brevoConfigured(),
      smtp: smtpConfigured(),
    },
    from: fromAddress() ? fromAddress().replace(/.(?=.{6}@)/g, '•') : null,
  };
}

module.exports = {
  notifyMerchant,
  notifyCustomer,
  notifySimple,
  merchantInbox,
  buildHtml,
  buildCustomerReceiptHtml,
  resendConfigured,
  emailConfigured,
  emailReady,
  sendResend,
  sendEmail,
  brandShell,
  escHtml,
  emailStatusPublic,
  brevoConfigured,
  smtpConfigured,
};
