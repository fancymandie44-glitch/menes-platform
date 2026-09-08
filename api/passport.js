'use strict';

const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const {
  cleanEmail,
  isEmail,
  findPassport,
  upsertPassportFromPaidOrders,
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
    let passport = findPassport(store, email);
    let created = false;
    if (!passport) {
      const result = upsertPassportFromPaidOrders(store, email);
      if (result?.passport) {
        passport = result.passport;
        created = Boolean(result.created);
        await writeSiteStore(siteId, store);
      }
    }
    if (!passport) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, exists: false }) };
    }

    const full = tokenMatches(passport, token);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        exists: true,
        created,
        full,
        passport: clientView(passport, { full }),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur passeport' }) };
  }
};
