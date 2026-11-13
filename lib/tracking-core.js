'use strict';

const META_EVENTS = ['PageView', 'ViewContent', 'Search', 'AddToCart', 'RemoveFromCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead'];
const TIKTOK_MAP = {
  PageView: 'ViewContent',
  ViewContent: 'ViewContent',
  Search: 'Search',
  AddToCart: 'AddToCart',
  InitiateCheckout: 'InitiateCheckout',
  AddPaymentInfo: 'AddPaymentInfo',
  Purchase: 'CompletePayment',
  Lead: 'SubmitForm',
};
const GA4_MAP = {
  PageView: 'page_view',
  ViewContent: 'view_item',
  Search: 'search',
  AddToCart: 'add_to_cart',
  RemoveFromCart: 'remove_from_cart',
  InitiateCheckout: 'begin_checkout',
  AddPaymentInfo: 'add_payment_info',
  Purchase: 'purchase',
  Lead: 'generate_lead',
};

function publicTracking(site = {}) {
  const t = site.tracking || {};
  return {
    metaPixelId: String(t.metaPixelId || '').replace(/\D/g, '').slice(0, 20),
    tiktokPixelId: String(t.tiktokPixelId || '').replace(/[^A-Z0-9]/gi, '').slice(0, 40),
    ga4MeasurementId: String(t.ga4MeasurementId || '').replace(/[^A-Z0-9-]/gi, '').slice(0, 20),
    testMode: t.testMode === true,
  };
}

function sanitizeEvent(raw) {
  const name = String(raw?.event || raw?.name || '').trim();
  if (!META_EVENTS.includes(name)) return { error: 'event_inconnu' };
  const eventId = String(raw.eventId || raw.event_id || '').slice(0, 80);
  if (!eventId) return { error: 'event_id_requis' };
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 30).map((it) => ({
    id: String(it.id || '').slice(0, 80),
    name: String(it.name || '').slice(0, 120),
    price: Number(it.price) || 0,
    qty: Math.max(1, parseInt(it.qty, 10) || 1),
  })) : [];
  const value = Number(raw.value);
  return {
    event: name,
    eventId,
    value: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
    currency: String(raw.currency || 'CAD').slice(0, 8),
    contents: items,
    contentIds: items.map((i) => i.id).filter(Boolean),
    transactionId: String(raw.transactionId || raw.orderId || '').slice(0, 80),
    search: String(raw.search || '').slice(0, 80),
    eventSourceUrl: String(raw.url || '').slice(0, 300),
    consent: raw.consent === true || raw.consent === 'granted',
  };
}

function hasPurchaseDedupe(log, event) {
  if (event.event !== 'Purchase' || !event.transactionId) return false;
  return (log || []).some((row) => row.event === 'Purchase' && row.transactionId === event.transactionId && row.ok);
}

function appendLog(store, entry) {
  if (!store.trackingLog) store.trackingLog = [];
  store.trackingLog.unshift(entry);
  store.trackingLog = store.trackingLog.slice(0, 250);
}

function summarizeLog(log) {
  const rows = log || [];
  const byEvent = {};
  META_EVENTS.forEach((e) => { byEvent[e] = { ok: 0, fail: 0, last: null }; });
  rows.forEach((r) => {
    const slot = byEvent[r.event] || (byEvent[r.event] = { ok: 0, fail: 0, last: null });
    if (r.ok) slot.ok += 1;
    else slot.fail += 1;
    if (!slot.last) slot.last = r.at;
  });
  return { byEvent, total: rows.length, lastError: rows.find((r) => !r.ok) || null };
}

function secretFlags() {
  return {
    metaCapi: Boolean(String(process.env.META_CAPI_TOKEN || '').trim()),
    tiktokEvents: Boolean(String(process.env.TIKTOK_EVENTS_TOKEN || '').trim()),
    ga4Mp: Boolean(String(process.env.GA4_API_SECRET || '').trim()),
  };
}

module.exports = {
  META_EVENTS,
  TIKTOK_MAP,
  GA4_MAP,
  publicTracking,
  sanitizeEvent,
  hasPurchaseDedupe,
  appendLog,
  summarizeLog,
  secretFlags,
};
