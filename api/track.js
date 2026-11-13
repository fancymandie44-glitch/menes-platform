'use strict';

const { corsHeaders } = require('../lib/cors');
const { setLambdaEvent, resolveSiteId, readSiteStore, writeSiteStore } = require('../lib/platform');
const { allowRequest, tooManyRequests, clientIp } = require('../lib/rate-limit');
const {
  sanitizeEvent, hasPurchaseDedupe, appendLog, publicTracking, TIKTOK_MAP, GA4_MAP, secretFlags,
} = require('../lib/tracking-core');

async function postJson(url, body, extraHeaders) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
}

async function sendMeta(event, tracking, ip) {
  const token = String(process.env.META_CAPI_TOKEN || '').trim();
  const pixel = tracking.metaPixelId;
  if (!token || !pixel) return { skipped: true, reason: 'meta_not_configured' };
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`;
  const payload = {
    data: [{
      event_name: event.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      event_source_url: event.eventSourceUrl,
      action_source: 'website',
      user_data: { client_ip_address: ip === 'unknown' ? undefined : ip, client_user_agent: undefined },
      custom_data: {
        currency: event.currency,
        value: event.value,
        content_ids: event.contentIds,
        contents: event.contents.map((c) => ({ id: c.id, quantity: c.qty, item_price: c.price })),
        order_id: event.transactionId || undefined,
      },
    }],
    ...(tracking.testMode ? { test_event_code: String(process.env.META_TEST_EVENT_CODE || 'TEST12345') } : {}),
  };
  return postJson(url, payload);
}

async function sendTikTok(event, tracking) {
  const token = String(process.env.TIKTOK_EVENTS_TOKEN || '').trim();
  if (!token || !tracking.tiktokPixelId) return { skipped: true, reason: 'tiktok_not_configured' };
  return postJson('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    event_source: 'web',
    event_source_id: tracking.tiktokPixelId,
    data: [{
      event: TIKTOK_MAP[event.event] || event.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      properties: {
        currency: event.currency,
        value: event.value,
        content_ids: event.contentIds,
        order_id: event.transactionId || undefined,
      },
    }],
  }, { 'Access-Token': token });
}

async function sendGa4(event, tracking) {
  const secret = String(process.env.GA4_API_SECRET || '').trim();
  if (!secret || !tracking.ga4MeasurementId) return { skipped: true, reason: 'ga4_not_configured' };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(tracking.ga4MeasurementId)}&api_secret=${encodeURIComponent(secret)}`;
  return postJson(url, {
    client_id: event.eventId.slice(0, 36),
    events: [{
      name: GA4_MAP[event.event] || 'page_view',
      params: {
        currency: event.currency,
        value: event.value,
        transaction_id: event.transactionId || undefined,
        items: event.contents.map((c) => ({ item_id: c.id, item_name: c.name, price: c.price, quantity: c.qty })),
      },
    }],
  });
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  const ip = clientIp(event);
  if (!allowRequest(`track:${ip}`, { limit: 40, windowMs: 60_000 })) return tooManyRequests(headers);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) }; }
  const parsed = sanitizeEvent(body);
  if (parsed.error) return { statusCode: 400, headers, body: JSON.stringify({ error: parsed.error }) };
  if (!parsed.consent) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'no_consent' }) };
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const siteId = await resolveSiteId(host, params.site || event.headers['x-site-id'] || event.headers['X-Site-Id']);
  const store = await readSiteStore(siteId);
  const tracking = publicTracking(store.site || {});
  if (hasPurchaseDedupe(store.trackingLog, parsed)) {
    appendLog(store, { at: new Date().toISOString(), event: parsed.event, eventId: parsed.eventId, transactionId: parsed.transactionId, ok: true, deduped: true });
    await writeSiteStore(siteId, store);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, deduped: true }) };
  }

  const flags = secretFlags();
  const results = {};
  try { results.meta = await sendMeta(parsed, tracking, ip); } catch (e) { results.meta = { ok: false, error: e.message }; }
  try { results.tiktok = await sendTikTok(parsed, tracking); } catch (e) { results.tiktok = { ok: false, error: e.message }; }
  try { results.ga4 = await sendGa4(parsed, tracking); } catch (e) { results.ga4 = { ok: false, error: e.message }; }

  const failed = Object.values(results).filter((r) => r && r.ok === false);
  const configured = flags.metaCapi || flags.tiktokEvents || flags.ga4Mp;
  const row = {
    at: new Date().toISOString(),
    event: parsed.event,
    eventId: parsed.eventId,
    transactionId: parsed.transactionId,
    ok: failed.length === 0,
    skipped: configured ? false : 'no_server_tokens',
    results: {
      meta: results.meta?.skipped ? 'skipped' : (results.meta?.ok ? 'ok' : (results.meta?.status || results.meta?.error || 'n/a')),
      tiktok: results.tiktok?.skipped ? 'skipped' : (results.tiktok?.ok ? 'ok' : (results.tiktok?.status || results.tiktok?.error || 'n/a')),
      ga4: results.ga4?.skipped ? 'skipped' : (results.ga4?.ok ? 'ok' : (results.ga4?.status || results.ga4?.error || 'n/a')),
    },
  };
  if (parsed.event !== 'PageView') {
    appendLog(store, row);
    await writeSiteStore(siteId, store);
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: failed.length === 0, results: { meta: results.meta?.skipped || results.meta?.ok, tiktok: results.tiktok?.skipped || results.tiktok?.ok, ga4: results.ga4?.skipped || results.ga4?.ok } }) };
};
