'use strict';

const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { setLambdaEvent, resolveSiteId, readSiteStore } = require('../lib/platform');
const { computeIntel } = require('../lib/commerce-intel');
const { summarizeLog } = require('../lib/tracking-core');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  const auth = checkAdminAuth(event);
  if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
  const siteId = await resolveSiteId(host, params.site || headerSiteId);
  const store = await readSiteStore(siteId);
  const intel = computeIntel(store);
  intel.tracking = summarizeLog(store.trackingLog);
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, intel }) };
};
