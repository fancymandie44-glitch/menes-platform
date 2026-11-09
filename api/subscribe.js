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
      tags: Array.isArray(body.tags) ? body.tags : ['vip', 'passport', 'nouveautes'],
    });
    const { deliverNewPassportEmails } = require('../lib/passport-email');
    await deliverNewPassportEmails(store, result, body.locale);
    await writeSiteStore(siteId, store);

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
