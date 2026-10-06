const { corsHeaders } = require('../lib/cors');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const { setLambdaEvent, readSiteStore } = require('../lib/platform');
const {
  merchantInbox,
  emailConfigured,
  sendEmail,
  brandShell,
  escHtml,
} = require('../lib/notify');
const {
  requestAdminReset,
  completeAdminReset,
} = require('../lib/admin-auth');
const { normalizeEmail, isEmail, passwordStrongEnough } = require('../lib/password-reset');

function originOf(event) {
  const h = event.headers || {};
  const origin = String(h.origin || h.Origin || '').replace(/\/$/, '');
  if (origin === 'https://menesadmin.netlify.app' || origin === 'https://www.mymenes.com' || origin === 'https://mymenes.com') {
    return origin;
  }
  const host = String(h['x-forwarded-host'] || h.host || '').split(':')[0].toLowerCase();
  if (host.includes('menesadmin')) return 'https://menesadmin.netlify.app';
  return 'https://www.mymenes.com';
}

function adminResetUrl(event, token) {
  const origin = originOf(event);
  const path = origin.includes('menesadmin') ? '/' : '/console';
  return `${origin}${path}?reset=${encodeURIComponent(token)}`;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ip = clientIp(event);
  if (!allowRequest(`auth:${ip}`, { limit: 12, windowMs: 60 * 60 * 1000 })) {
    return tooManyRequests(headers);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || event.queryStringParameters?.action || '').trim();

    if (action === 'forgot-admin') {
      const email = normalizeEmail(body.email);
      const generic = { ok: true, message: 'Si cet email est le compte admin, tu vas recevoir un lien (regarde aussi Spam).' };
      if (!isEmail(email)) {
        return { statusCode: 200, headers, body: JSON.stringify(generic) };
      }
      if (!emailConfigured()) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({ error: 'Email non configuré sur Netlify (BREVO_API_KEY + EMAIL_FROM). Impossible d’envoyer le lien.' }),
        };
      }
      const store = await readSiteStore('menes');
      const allowed = new Set(
        [merchantInbox(store), store?.site?.email, process.env.ADMIN_RECOVERY_EMAIL, process.env.MERCHANT_EMAIL]
          .map(normalizeEmail)
          .filter(Boolean)
      );
      if (!allowed.has(email)) {
        return { statusCode: 200, headers, body: JSON.stringify(generic) };
      }
      const { token } = await requestAdminReset();
      const link = adminResetUrl(event, token);
      const sent = await sendEmail({
        to: email,
        subject: 'MENES · Réinitialiser le mot de passe admin',
        html: brandShell({
          title: 'Mot de passe oublié',
          bodyHtml: `<p style="color:#9a958c;line-height:1.65">Clique le bouton pour choisir un nouveau mot de passe admin. Le lien expire dans 30 minutes.</p>
            <p style="margin:22px 0"><a href="${escHtml(link)}" style="display:inline-block;background:#c9a84c;color:#050505;text-decoration:none;padding:12px 18px;font-weight:700">Choisir un nouveau mot de passe</a></p>
            <p style="color:#6b665e;font-size:12px;word-break:break-all">${escHtml(link)}</p>`,
          footerNote: 'Si tu n’as pas demandé ça, ignore ce message.',
        }),
      });
      if (!sent.ok) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: sent.error || 'Envoi email impossible' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(generic) };
    }

    if (action === 'reset-admin') {
      const token = String(body.token || '').trim();
      const password = String(body.password || '');
      if (!token || !passwordStrongEnough(password)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Lien invalide ou mot de passe trop court (8+).' }) };
      }
      const result = await completeAdminReset(token, password);
      if (!result.ok) {
        return { statusCode: result.status || 400, headers, body: JSON.stringify({ error: result.error }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Mot de passe admin mis à jour. Connecte-toi.' }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action invalide' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
