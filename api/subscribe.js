const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const body = JSON.parse(event.body || '{}');
    const email = cleanEmail(body.email);
    if (!isEmail(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email invalide' }) };
    }

    const store = await readSiteStore(siteId);
    if (!Array.isArray(store.subscribers)) store.subscribers = [];

    const existing = store.subscribers.find((s) => s.email === email);
    if (existing) {
      existing.active = true;
      existing.source = existing.source || body.source || 'vip';
      existing.updatedAt = new Date().toISOString();
      if (body.locale) existing.locale = body.locale === 'en' ? 'en' : 'fr';
    } else {
      store.subscribers.unshift({
        id: uid('sub'),
        email,
        source: String(body.source || 'vip').slice(0, 40),
        locale: body.locale === 'en' ? 'en' : 'fr',
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 8) : ['vip'],
        active: true,
        consent: true,
        createdAt: new Date().toISOString(),
      });
    }
    await writeSiteStore(siteId, store);

    try {
      const { notifySimple, brandShell, escHtml, resendConfigured } = require('../lib/notify');
      if (resendConfigured()) {
        await notifySimple({
          store,
          subject: `Inscription VIP MENES · ${email}`,
          html: brandShell({
            title: 'Nouvelle inscription VIP',
            bodyHtml: `<p style="color:#9a958c">${escHtml(email)} · source ${escHtml(body.source || 'vip')} · ${store.subscribers.filter((s) => s.active !== false).length} abonnés</p>`,
          }),
        });
      }
    } catch {}

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, already: !!existing }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur inscription' }) };
  }
};
