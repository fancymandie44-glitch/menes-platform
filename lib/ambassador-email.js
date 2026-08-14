/**
 * Ambassador-facing transactional emails (Resend via shared notify helper).
 */

const { resendConfigured, sendResend, emailConfigured, emailStatusPublic } = require('./notify');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function appUrl(settings) {
  return String(settings?.ambassadorAppUrl || 'https://menesambassador.netlify.app').replace(/\/$/, '');
}

function shopUrl(settings) {
  return String(settings?.shopBaseUrl || 'https://boutiquemenes.netlify.app').replace(/\/$/, '');
}

function shell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;color:#f4f2ee">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="letter-spacing:0.32em;font-size:11px;color:#c9a84c;text-align:center;margin-bottom:22px">MENES AMBASSADOR</div>
    <div style="background:#111;border:1px solid #2a2a2a;padding:28px 24px">
      <h1 style="margin:0 0 14px;font-size:22px;font-weight:600">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#6b665e;font-size:11px;margin-top:18px;line-height:1.5">
      MENES Ambassador · Tu peux gérer tes préférences email dans l'app.<br>
      Conformément à la Loi canadienne anti-pourriel (LCAP).
    </p>
  </div></body></html>`;
}

async function sendEmail({ to, subject, html }) {
  if (!emailConfigured()) {
    console.error('ambassador-email: email_not_configured');
    return { ok: false, error: 'email_not_configured' };
  }
  const email = String(to || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, error: 'invalid_email' };
  try {
    const result = await sendResend({ to: email, subject, html });
    if (!result.ok) console.error('ambassador-email send failed', email, result.error);
    else console.log('ambassador-email sent', email, result.provider, result.id);
    return result;
  } catch (e) {
    console.error('ambassador-email exception', e.message);
    return { ok: false, error: e.message };
  }
}

/** Sent when an ambassador account is approved / activated */
async function sendAmbassadorWelcome(ambassador, settings) {
  const app = appUrl(settings);
  const shop = shopUrl(settings);
  const link = `${shop}/${ambassador.slug || ''}`;
  const html = shell('Tu es approuvé — la plateforme est live', `
    <p style="color:#9a958c;line-height:1.65;margin:0 0 14px">
      Salut ${esc(ambassador.displayName || '')}, ton compte <strong style="color:#f4f2ee">MENES Ambassador</strong> est approuvé.
    </p>
    <p style="color:#9a958c;line-height:1.65;margin:0 0 14px">
      La plateforme Ambassador est maintenant <strong style="color:#c9a84c">fonctionnelle</strong> :
      lien perso, code promo, ventes, commissions et équipe — tout est prêt.
    </p>
    <p style="margin:0 0 6px;color:#f4f2ee"><strong>Ton lien</strong></p>
    <p style="margin:0 0 14px;color:#c9a84c;word-break:break-all">${esc(link)}</p>
    <p style="margin:0 0 6px;color:#f4f2ee"><strong>Ton code</strong></p>
    <p style="margin:0 0 20px;letter-spacing:0.12em;color:#c9a84c;font-size:20px">${esc(ambassador.promoCode || '')}</p>
    <a href="${esc(app)}" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:14px 20px;font-size:13px;letter-spacing:0.06em;font-weight:700">OUVRIR L'APP AMBASSADOR</a>
    <p style="color:#6b665e;font-size:13px;line-height:1.55;margin:18px 0 0">
      Connecte-toi avec l'email de ton compte. Si tu ne trouves pas ce message, regarde aussi Spam / Promotions.
    </p>
  `);
  return sendEmail({
    to: ambassador.email,
    subject: 'MENES Ambassador — Approuvé · la plateforme est live',
    html,
  });
}

/** One-shot blast: platform is ready for all active ambassadors */
async function sendPlatformReady(ambassador, settings) {
  const app = appUrl(settings);
  const shop = shopUrl(settings);
  const link = `${shop}/${ambassador.slug || ''}`;
  const html = shell('La plateforme Ambassador est maintenant fonctionnelle', `
    <p style="color:#9a958c;line-height:1.65;margin:0 0 14px">
      Salut ${esc(ambassador.displayName || '')},
    </p>
    <p style="color:#9a958c;line-height:1.65;margin:0 0 14px">
      C’est officiel : la plateforme <strong style="color:#f4f2ee">MENES Ambassador</strong> est
      <strong style="color:#c9a84c">opérationnelle dès maintenant</strong>.
    </p>
    <p style="color:#9a958c;line-height:1.65;margin:0 0 14px">
      Tu peux partager ton lien, utiliser ton code promo (−10%), suivre tes ventes et tes commissions dans l’app.
    </p>
    <p style="margin:0 0 6px;color:#f4f2ee"><strong>Ton lien</strong></p>
    <p style="margin:0 0 14px;color:#c9a84c;word-break:break-all">${esc(link)}</p>
    <p style="margin:0 0 6px;color:#f4f2ee"><strong>Ton code</strong></p>
    <p style="margin:0 0 20px;letter-spacing:0.12em;color:#c9a84c;font-size:20px">${esc(ambassador.promoCode || '')}</p>
    <a href="${esc(app)}" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:14px 20px;font-size:13px;letter-spacing:0.06em;font-weight:700">OUVRIR L'APP</a>
  `);
  return sendEmail({
    to: ambassador.email,
    subject: 'MENES Ambassador — La plateforme est maintenant fonctionnelle',
    html,
  });
}

async function sendAmbassadorInvite({ email, inviteUrl, inviterName }) {
  const html = shell('Invitation MENES Ambassador', `
    <p style="color:#9a958c;line-height:1.65;margin:0 0 16px">
      ${esc(inviterName || 'MENES')} t'invite à rejoindre le programme Ambassador.
    </p>
    <a href="${esc(inviteUrl)}" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:12px 18px;font-size:13px;letter-spacing:0.06em">CRÉER MON COMPTE</a>
  `);
  return sendEmail({ to: email, subject: 'Invitation — MENES Ambassador', html });
}

async function sendSaleEmail(ambassador, order, amount) {
  if (ambassador.notificationPrefs?.email === false || ambassador.notificationPrefs?.sales === false) {
    return { ok: false, skipped: true };
  }
  const html = shell('Nouvelle vente', `
    <p style="color:#9a958c;line-height:1.65">Commande <strong>#${esc(order.id)}</strong></p>
    <p style="font-size:28px;margin:12px 0;color:#c9a84c">${Number(amount).toFixed(2)}$ <span style="font-size:14px;color:#9a958c">commission</span></p>
    <p style="color:#6b665e;font-size:13px">Statut: en attente (période de validation)</p>
  `);
  return sendEmail({ to: ambassador.email, subject: `MENES — Vente #${order.id}`, html });
}

async function sendCommissionAvailable(ambassador, commission) {
  if (ambassador.notificationPrefs?.email === false || ambassador.notificationPrefs?.commission === false) {
    return { ok: false, skipped: true };
  }
  const html = shell('Commission disponible', `
    <p style="font-size:28px;margin:0 0 12px;color:#c9a84c">${Number(commission.amount).toFixed(2)}$</p>
    <p style="color:#9a958c">Ta commission est maintenant disponible au retrait.</p>
  `);
  return sendEmail({ to: ambassador.email, subject: 'MENES — Commission disponible', html });
}

module.exports = {
  sendEmail,
  sendAmbassadorWelcome,
  sendPlatformReady,
  sendAmbassadorInvite,
  sendSaleEmail,
  sendCommissionAvailable,
  shell,
  resendConfigured,
  emailConfigured,
  emailStatusPublic,
};
