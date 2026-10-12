'use strict';

const { resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const {
  recordEvent,
  readAnalytics,
  writeAnalytics,
  upsertAd,
  deleteAd,
  summarize,
} = require('../lib/analytics');

function json(headers, status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function shopBaseFromEvent(event) {
  const host = event.headers['x-forwarded-host'] || event.headers.host || 'www.mymenes.com';
  const proto = event.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${String(host).split(',')[0].trim()}`;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);

    if (event.httpMethod === 'GET') {
      const auth = await checkAdminAuth(event);
      if (!auth.ok) return json(headers, auth.status || 401, { error: auth.error || 'Non autorisé' });
      const state = await readAnalytics(siteId);
      const days = Math.min(90, Math.max(7, Number(params.days) || 30));
      return json(headers, 200, {
        ok: true,
        ...summarize(state, { days, shopBase: shopBaseFromEvent(event) }),
      });
    }

    if (event.httpMethod !== 'POST') {
      return json(headers, 405, { error: 'Method not allowed' });
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {
      return json(headers, 400, { error: 'JSON invalide' });
    }

    const action = String(body.action || '').trim();
    if (action) {
      const auth = await checkAdminAuth(event);
      if (!auth.ok) return json(headers, auth.status || 401, { error: auth.error || 'Non autorisé' });
      const state = await readAnalytics(siteId);
      if (action === 'save-ad') {
        const result = upsertAd(state, body.ad || body);
        if (result.error) return json(headers, 400, { error: result.error });
        await writeAnalytics(siteId, result.state);
        const summary = summarize(result.state, { shopBase: shopBaseFromEvent(event) });
        return json(headers, 200, { ok: true, ad: summary.ads.find((a) => a.id === result.ad.id), ads: summary.ads });
      }
      if (action === 'delete-ad') {
        const result = deleteAd(state, body.id || body.slug);
        await writeAnalytics(siteId, result.state);
        return json(headers, 200, { ok: true, ads: summarize(result.state, { shopBase: shopBaseFromEvent(event) }).ads });
      }
      return json(headers, 400, { error: 'Action inconnue' });
    }

    if (!allowRequest(`analytics:${clientIp(event)}`, { limit: 40, windowMs: 60_000 })) {
      return tooManyRequests(headers);
    }

    const result = await recordEvent(siteId, body);
    if (!result.ok) return json(headers, 400, { error: result.error || 'Événement invalide' });
    return json(headers, 200, { ok: true, duplicate: Boolean(result.duplicate) });
  } catch (err) {
    return json(headers, 500, { error: 'Erreur analytics' });
  }
};
