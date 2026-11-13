'use strict';

const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { setLambdaEvent, resolveSiteId, readSiteStore, getBlobStore } = require('../lib/platform');
const { buildReport } = require('../lib/diagnostics');
const { summarizeLog } = require('../lib/tracking-core');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const auth = checkAdminAuth(event);
  if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const t0 = Date.now();
  let healthOk = false;
  try {
    const origin = `https://${event.headers['x-forwarded-host'] || event.headers.host || 'www.mymenes.com'}`;
    const res = await fetch(`${origin}/api/health`);
    healthOk = res.ok;
  } catch {
    healthOk = false;
  }

  let blobsOk = false;
  try {
    const blobs = await getBlobStore();
    await blobs.get('platform', { type: 'json' });
    blobsOk = true;
  } catch {
    blobsOk = false;
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
  const siteId = await resolveSiteId(host, params.site || headerSiteId);
  let store = { orders: [], trackingLog: [] };
  try { store = await readSiteStore(siteId) || store; } catch { blobsOk = false; }

  const report = buildReport({
    healthOk,
    blobsOk,
    storeOrders: (store.orders || []).length,
    trackingSummary: summarizeLog(store.trackingLog),
    pingMs: Date.now() - t0,
  });
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report }) };
};
