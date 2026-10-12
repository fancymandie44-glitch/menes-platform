'use strict';

const { getBlobStore } = require('./platform');

const EVENT_TYPES = new Set([
  'page_view',
  'product_view',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'ad_click',
]);

const PLATFORMS = ['meta', 'instagram', 'tiktok', 'google', 'other'];

function analyticsKey(siteId) {
  return `analytics:${siteId || 'menes'}`;
}

function emptyCounters() {
  return {
    page_view: 0,
    product_view: 0,
    add_to_cart: 0,
    begin_checkout: 0,
    purchase: 0,
    ad_click: 0,
    sessions: 0,
    revenue: 0,
  };
}

function emptyState() {
  return {
    version: 1,
    totals: emptyCounters(),
    days: {},
    products: {},
    sources: {},
    ads: [],
    recent: [],
    seenOrders: [],
    seenSessions: [],
  };
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function slugify(str, fallback = '') {
  const s = String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return s || fallback;
}

function dayKey(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function clipList(list, max) {
  if (!Array.isArray(list)) return [];
  if (list.length <= max) return list;
  return list.slice(0, max);
}

function bump(obj, key, by = 1) {
  obj[key] = (Number(obj[key]) || 0) + by;
}

function sourceKey(event) {
  const ad = slugify(event.ad);
  if (ad) return `ad:${ad}`;
  const src = slugify(event.utmSource);
  if (src) return `utm:${src}`;
  return 'direct';
}

function sanitizeEvent(raw) {
  const type = String(raw?.type || '').trim();
  if (!EVENT_TYPES.has(type)) return null;
  const revenue = Number(raw.revenue);
  const qty = Number(raw.qty);
  return {
    type,
    path: String(raw.path || '/').slice(0, 200),
    productId: String(raw.productId || '').slice(0, 80),
    productName: String(raw.productName || '').slice(0, 120),
    ad: slugify(raw.ad),
    utmSource: slugify(raw.utmSource || raw.utm_source),
    utmMedium: slugify(raw.utmMedium || raw.utm_medium),
    utmCampaign: slugify(raw.utmCampaign || raw.utm_campaign),
    sessionId: String(raw.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
    sessionStart: raw.sessionStart === true,
    revenue: Number.isFinite(revenue) && revenue > 0 ? Math.round(revenue * 100) / 100 : 0,
    qty: Number.isFinite(qty) && qty > 0 ? Math.min(99, Math.round(qty)) : 1,
    orderId: String(raw.orderId || '').slice(0, 40),
    at: new Date().toISOString(),
  };
}

function ensureDay(state, day) {
  if (!state.days[day]) state.days[day] = emptyCounters();
  return state.days[day];
}

function pruneDays(state, keep = 90) {
  const keys = Object.keys(state.days || {}).sort();
  if (keys.length <= keep) return;
  for (const key of keys.slice(0, keys.length - keep)) delete state.days[key];
}

function ingestEvent(state, raw) {
  const event = sanitizeEvent(raw);
  if (!event) return { ok: false, error: 'type invalide' };

  if (!state || typeof state !== 'object') state = emptyState();
  if (!state.totals) state.totals = emptyCounters();
  if (!state.days) state.days = {};
  if (!state.products) state.products = {};
  if (!state.sources) state.sources = {};
  if (!Array.isArray(state.ads)) state.ads = [];
  if (!Array.isArray(state.recent)) state.recent = [];
  if (!Array.isArray(state.seenOrders)) state.seenOrders = [];
  if (!Array.isArray(state.seenSessions)) state.seenSessions = [];

  if (event.type === 'purchase' && event.orderId) {
    if (state.seenOrders.includes(event.orderId)) {
      return { ok: true, duplicate: true, state };
    }
    state.seenOrders.unshift(event.orderId);
    state.seenOrders = clipList(state.seenOrders, 400);
  }

  const day = ensureDay(state, dayKey(event.at));
  bump(state.totals, event.type, 1);
  bump(day, event.type, 1);

  if (event.sessionStart && event.sessionId && !state.seenSessions.includes(event.sessionId)) {
    state.seenSessions.unshift(event.sessionId);
    state.seenSessions = clipList(state.seenSessions, 4000);
    bump(state.totals, 'sessions', 1);
    bump(day, 'sessions', 1);
  }

  if (event.type === 'purchase' && event.revenue) {
    bump(state.totals, 'revenue', event.revenue);
    bump(day, 'revenue', event.revenue);
  }

  if (event.productId && (event.type === 'product_view' || event.type === 'add_to_cart' || event.type === 'purchase')) {
    if (!state.products[event.productId]) {
      state.products[event.productId] = {
        id: event.productId,
        name: event.productName || event.productId,
        product_view: 0,
        add_to_cart: 0,
        purchase: 0,
        revenue: 0,
      };
    }
    const prod = state.products[event.productId];
    if (event.productName) prod.name = event.productName;
    bump(prod, event.type, event.type === 'purchase' ? (event.qty || 1) : 1);
    if (event.type === 'purchase') bump(prod, 'revenue', event.revenue);
  }

  const src = sourceKey(event);
  if (!state.sources[src]) {
    state.sources[src] = { key: src, ...emptyCounters() };
  }
  bump(state.sources[src], event.type, 1);
  if (event.type === 'purchase') bump(state.sources[src], 'revenue', event.revenue);

  if (event.ad) {
    const ad = state.ads.find((a) => a.slug === event.ad);
    if (ad) {
      if (event.type === 'ad_click') bump(ad, 'clicks', 1);
      if (event.type === 'add_to_cart') bump(ad, 'add_to_cart', 1);
      if (event.type === 'begin_checkout') bump(ad, 'begin_checkout', 1);
      if (event.type === 'purchase') {
        bump(ad, 'purchases', 1);
        bump(ad, 'revenue', event.revenue);
      }
    }
  }

  state.recent.unshift({
    type: event.type,
    path: event.path,
    productId: event.productId || undefined,
    ad: event.ad || undefined,
    source: src,
    revenue: event.revenue || undefined,
    at: event.at,
  });
  state.recent = clipList(state.recent, 80);
  pruneDays(state, 90);

  const productIds = Object.keys(state.products);
  if (productIds.length > 250) {
    const ranked = productIds
      .map((id) => state.products[id])
      .sort((a, b) => (b.product_view + b.purchase * 10) - (a.product_view + a.purchase * 10));
    state.products = Object.fromEntries(ranked.slice(0, 200).map((p) => [p.id, p]));
  }

  return { ok: true, state };
}

function normalizeAd(raw, existing = null) {
  const name = String(raw?.name || existing?.name || '').trim().slice(0, 80);
  if (!name) return { error: 'Nom de pub requis' };
  const platform = PLATFORMS.includes(raw?.platform) ? raw.platform : (existing?.platform || 'meta');
  const headline = String(raw?.headline || existing?.headline || '').trim().slice(0, 120);
  const primaryText = String(raw?.primaryText || existing?.primaryText || '').trim().slice(0, 800);
  const cta = String(raw?.cta || existing?.cta || 'Shop now').trim().slice(0, 40);
  const destination = String(raw?.destination || existing?.destination || '/').trim().slice(0, 200) || '/';
  const promoCode = String(raw?.promoCode || existing?.promoCode || '').trim().toUpperCase().slice(0, 30);
  const spend = Number(raw?.spend);
  const slug = slugify(raw?.slug || existing?.slug || name, uid('ad').slice(3));
  return {
    ad: {
      id: existing?.id || uid('ad'),
      slug,
      name,
      platform,
      headline,
      primaryText,
      cta,
      destination,
      productId: String(raw?.productId || existing?.productId || '').slice(0, 80),
      promoCode,
      spend: Number.isFinite(spend) && spend >= 0 ? Math.round(spend * 100) / 100 : (existing?.spend || 0),
      active: raw?.active === false ? false : true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clicks: existing?.clicks || 0,
      add_to_cart: existing?.add_to_cart || 0,
      begin_checkout: existing?.begin_checkout || 0,
      purchases: existing?.purchases || 0,
      revenue: existing?.revenue || 0,
    },
  };
}

function upsertAd(state, raw) {
  if (!state || typeof state !== 'object') state = emptyState();
  if (!Array.isArray(state.ads)) state.ads = [];
  const existing = state.ads.find((a) => a.id === raw?.id || (raw?.slug && a.slug === slugify(raw.slug)));
  const next = normalizeAd(raw, existing || null);
  if (next.error) return next;
  if (existing) {
    const idx = state.ads.findIndex((a) => a.id === existing.id);
    state.ads[idx] = { ...existing, ...next.ad, id: existing.id, clicks: existing.clicks, purchases: existing.purchases, revenue: existing.revenue, add_to_cart: existing.add_to_cart, begin_checkout: existing.begin_checkout };
    return { ok: true, ad: state.ads[idx], state };
  }
  state.ads.unshift(next.ad);
  state.ads = clipList(state.ads, 80);
  return { ok: true, ad: next.ad, state };
}

function deleteAd(state, id) {
  if (!state || typeof state !== 'object') state = emptyState();
  state.ads = (state.ads || []).filter((a) => a.id !== id && a.slug !== id);
  return { ok: true, state };
}

function shopOrigin(base) {
  return String(base || 'https://www.mymenes.com').replace(/\/$/, '');
}

function trackedUrl(ad, shopBase) {
  const origin = shopOrigin(shopBase);
  let path = String(ad.destination || '/');
  if (!path.startsWith('/')) path = `/${path}`;
  const url = new URL(path, `${origin}/`);
  url.searchParams.set('ad', ad.slug);
  url.searchParams.set('utm_source', ad.platform || 'meta');
  url.searchParams.set('utm_medium', 'paid');
  url.searchParams.set('utm_campaign', ad.slug);
  if (ad.promoCode) url.searchParams.set('promo', ad.promoCode);
  return url.toString();
}

function adCopy(ad, shopBase) {
  const url = trackedUrl(ad, shopBase);
  const headline = ad.headline || ad.name;
  const body = ad.primaryText || headline;
  const cta = ad.cta || 'Shop now';
  return {
    url,
    meta: {
      primaryText: body,
      headline,
      description: cta,
      cta,
      url,
    },
    tiktok: {
      caption: `${body}\n\n${cta} → ${url}`.slice(0, 1500),
      url,
    },
    instagram: {
      caption: `${body}\n\n${cta}\n${url}`.slice(0, 2200),
      url,
    },
  };
}

function rate(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function summarize(state, { days = 30, shopBase } = {}) {
  const src = state && typeof state === 'object' ? state : emptyState();
  const totals = { ...emptyCounters(), ...(src.totals || {}) };
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (Number(days) || 30));
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const range = emptyCounters();
  const series = [];
  for (const [day, counts] of Object.entries(src.days || {}).sort()) {
    if (day < cutoffKey) continue;
    series.push({ day, ...emptyCounters(), ...counts });
    for (const k of Object.keys(range)) bump(range, k, Number(counts[k]) || 0);
  }
  const ads = (src.ads || []).map((ad) => {
    const copy = adCopy(ad, shopBase);
    const spend = Number(ad.spend) || 0;
    return {
      ...ad,
      url: copy.url,
      copy,
      roas: spend > 0 ? Math.round(((Number(ad.revenue) || 0) / spend) * 100) / 100 : null,
    };
  });
  const products = Object.values(src.products || {})
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || (b.product_view || 0) - (a.product_view || 0))
    .slice(0, 12);
  const sources = Object.values(src.sources || {})
    .sort((a, b) => (b.purchase || 0) - (a.purchase || 0) || (b.page_view || 0) - (a.page_view || 0))
    .slice(0, 12);
  const views = range.page_view || totals.page_view || 0;
  return {
    totals,
    range,
    series,
    funnel: {
      page_view: range.page_view || 0,
      product_view: range.product_view || 0,
      add_to_cart: range.add_to_cart || 0,
      begin_checkout: range.begin_checkout || 0,
      purchase: range.purchase || 0,
      viewToCart: rate(range.add_to_cart, range.page_view || range.product_view),
      cartToCheckout: rate(range.begin_checkout, range.add_to_cart),
      checkoutToSale: rate(range.purchase, range.begin_checkout),
      conversion: rate(range.purchase, views),
    },
    products,
    sources,
    ads,
    recent: src.recent || [],
  };
}

function sanitizePixels(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const ga4 = String(src.ga4 || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  const meta = String(src.meta || '').replace(/\D/g, '').slice(0, 20);
  const tiktok = String(src.tiktok || '').replace(/[^A-Z0-9]/gi, '').slice(0, 24);
  return {
    ga4: /^G-[A-Z0-9]{6,14}$/.test(ga4) ? ga4 : '',
    meta: meta.length >= 8 ? meta : '',
    tiktok: tiktok.length >= 6 ? tiktok : '',
  };
}

function marketingFromOrder(order) {
  const m = order?.marketing && typeof order.marketing === 'object' ? order.marketing : {};
  return {
    ad: slugify(m.ad || ''),
    utmSource: slugify(m.utmSource || ''),
    utmMedium: slugify(m.utmMedium || ''),
    utmCampaign: slugify(m.utmCampaign || ''),
    sessionId: String(m.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
  };
}

function purchaseEventFromOrder(order) {
  const m = marketingFromOrder(order);
  const first = (order.items || [])[0] || {};
  return {
    type: 'purchase',
    orderId: order.id,
    revenue: Number(order.total) || 0,
    qty: (order.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0) || 1,
    productId: first.id || first.productId || '',
    productName: first.name || '',
    path: '/checkout',
    ad: m.ad,
    utmSource: m.utmSource,
    utmMedium: m.utmMedium,
    utmCampaign: m.utmCampaign,
    sessionId: m.sessionId,
  };
}

async function readAnalytics(siteId) {
  try {
    const store = await getBlobStore();
    const data = await store.get(analyticsKey(siteId), { type: 'json' });
    if (data && typeof data === 'object') return { ...emptyState(), ...data };
  } catch {}
  return emptyState();
}

async function writeAnalytics(siteId, data) {
  const store = await getBlobStore();
  await store.setJSON(analyticsKey(siteId), data);
}

async function recordEvent(siteId, raw) {
  const state = await readAnalytics(siteId);
  const result = ingestEvent(state, raw);
  if (!result.ok) return result;
  if (!result.duplicate) await writeAnalytics(siteId, result.state);
  return result;
}

module.exports = {
  EVENT_TYPES,
  PLATFORMS,
  analyticsKey,
  emptyState,
  emptyCounters,
  slugify,
  sanitizeEvent,
  ingestEvent,
  upsertAd,
  deleteAd,
  trackedUrl,
  adCopy,
  summarize,
  sanitizePixels,
  marketingFromOrder,
  purchaseEventFromOrder,
  readAnalytics,
  writeAnalytics,
  recordEvent,
};
