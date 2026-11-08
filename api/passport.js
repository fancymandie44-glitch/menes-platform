'use strict';

const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const {
  cleanEmail,
  isEmail,
  findPassport,
  ensurePassportFromEmail,
  clientView,
  tokenMatches,
} = require('../lib/passport');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (!allowRequest(`passport:${clientIp(event)}`, { limit: 20, windowMs: 60_000 })) {
      return tooManyRequests(headers);
    }
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const email = cleanEmail(body.email || params.email);
    const token = String(body.token || params.token || '');
    if (!isEmail(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email invalide' }) };
    }

    const store = await readSiteStore(siteId);
    const result = ensurePassportFromEmail(store, email, {
      source: body.source || params.source || 'passport',
      locale: body.locale || params.locale,
      name: body.name,
    });
    if (!result?.passport) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email invalide' }) };
    }
    await writeSiteStore(siteId, store);
    if (result.subscriberCreated) {
      try {
        const { notifySimple, brandShell, escHtml, resendConfigured } = require('../lib/notify');
        if (resendConfigured()) {
          await notifySimple({
            store,
            subject: `Passeport MENES · ${email}`,
            html: brandShell({
              title: 'Nouveau passeport',
              bodyHtml: `<p style="color:#9a958c">${escHtml(email)} · source ${escHtml(result.passport.source || 'passport')} · ${(store.subscribers || []).filter((s) => s.active !== false).length} abonnés</p>`,
            }),
          });
        }
      } catch {}
    }
    const passport = findPassport(store, email) || result.passport;
    const full = Boolean(result.created) || tokenMatches(passport, token);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        exists: true,
        created: Boolean(result.created),
        full,
        passport: clientView(passport, { full }),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur passeport' }) };
  }
};
