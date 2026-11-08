const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const { cleanEmail, isEmail, ensurePassportFromEmail, clientView } = require('../lib/passport');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (!allowRequest(`subscribe:${clientIp(event)}`, { limit: 8, windowMs: 60_000 })) {
      return tooManyRequests(headers);
    }
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
    const result = ensurePassportFromEmail(store, email, {
      source: body.source || 'vip',
      locale: body.locale,
      tags: Array.isArray(body.tags) ? body.tags : ['vip', 'passport'],
    });
    await writeSiteStore(siteId, store);

    try {
      const { notifySimple, brandShell, escHtml, resendConfigured } = require('../lib/notify');
      if (resendConfigured() && (result.created || result.subscriberCreated)) {
        await notifySimple({
          store,
          subject: `Inscription VIP MENES · ${email}`,
          html: brandShell({
            title: 'Nouvelle inscription VIP',
            bodyHtml: `<p style="color:#9a958c">${escHtml(email)} · source ${escHtml(body.source || 'vip')} · ${(store.subscribers || []).filter((s) => s.active !== false).length} abonnés</p>`,
          }),
        });
      }
    } catch {}

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        already: !result.created && !result.subscriberCreated,
        created: Boolean(result.created),
        passport: clientView(result.passport, { full: Boolean(result.created) }),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur inscription' }) };
  }
};
