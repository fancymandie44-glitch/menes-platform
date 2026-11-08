'use strict';

const crypto = require('crypto');

const PAID_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(email));
}

function isPaidOrder(order) {
  return Boolean(order) && PAID_STATUSES.has(String(order.status || '').toLowerCase());
}

function publicCode(id) {
  return `MENES-${String(id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function paidOrdersForEmail(store, email) {
  const want = cleanEmail(email);
  return (store?.orders || []).filter((o) => isPaidOrder(o) && cleanEmail(o.customer?.email) === want);
}

function ensurePassportsArray(store) {
  if (!Array.isArray(store.passports)) store.passports = [];
  return store.passports;
}

function collectPieces(store, email) {
  const map = new Map();
  for (const order of paidOrdersForEmail(store, email)) {
    for (const item of order.items || []) {
      const id = String(item.id || item.name || '').trim();
      if (!id) continue;
      const prev = map.get(id) || {
        id,
        name: String(item.name || id),
        image: String(item.image || ''),
        qty: 0,
        bundle: Boolean(item.bundle),
      };
      prev.qty += Math.max(1, Number(item.qty) || 1);
      if (!prev.image && item.image) prev.image = String(item.image);
      if (item.bundle) prev.bundle = true;
      if (item.name) prev.name = String(item.name);
      map.set(id, prev);
    }
  }
  return [...map.values()];
}

function upsertPassportFromOrder(store, order) {
  const email = cleanEmail(order?.customer?.email);
  if (!isEmail(email) || !isPaidOrder(order)) return null;
  const list = ensurePassportsArray(store);
  let passport = list.find((p) => cleanEmail(p.email) === email);
  const created = !passport;
  if (!passport) {
    passport = {
      id: newId(),
      token: newToken(),
      email,
      name: String(order.customer?.name || '').trim(),
      phone: String(order.customer?.phone || '').trim(),
      createdAt: order.paidAt || order.date || new Date().toISOString(),
      orders: [],
      totalSpent: 0,
      orderCount: 0,
      vip: false,
    };
    list.unshift(passport);
  }
  if (order.customer?.name) passport.name = String(order.customer.name).trim();
  if (order.customer?.phone) passport.phone = String(order.customer.phone).trim();
  passport.lastOrderAt = order.paidAt || order.date || new Date().toISOString();
  passport.lastOrderId = order.id;
  if (order.id && !passport.orders.includes(order.id)) passport.orders.push(order.id);

  const paid = paidOrdersForEmail(store, email);
  passport.orderCount = paid.length;
  passport.totalSpent = Math.round(paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0) * 100) / 100;
  passport.vip = passport.orderCount >= 2 || passport.totalSpent >= 150;
  passport.pieces = collectPieces(store, email);
  passport.updatedAt = new Date().toISOString();
  if (!passport.token) passport.token = newToken();
  return { passport, created };
}

function upsertPassportFromPaidOrders(store, email) {
  const paid = paidOrdersForEmail(store, email);
  if (!paid.length) return null;
  let result = null;
  for (const order of paid) result = upsertPassportFromOrder(store, order) || result;
  return result;
}

function ensureSubscriber(store, { email, source, locale, tags } = {}) {
  const clean = cleanEmail(email);
  if (!isEmail(clean)) return null;
  if (!Array.isArray(store.subscribers)) store.subscribers = [];
  const existing = store.subscribers.find((s) => cleanEmail(s.email) === clean);
  if (existing) {
    existing.active = true;
    existing.updatedAt = new Date().toISOString();
    if (source && !existing.source) existing.source = String(source).slice(0, 40);
    if (locale) existing.locale = locale === 'en' ? 'en' : 'fr';
    const extra = Array.isArray(tags) ? tags.map(String) : [];
    existing.tags = [...new Set([...(existing.tags || []), ...extra, 'passport', 'nouveautes'])].slice(0, 8);
    return { subscriber: existing, created: false };
  }
  const subscriber = {
    id: `sub_${newId()}`,
    email: clean,
    source: String(source || 'passport').slice(0, 40),
    locale: locale === 'en' ? 'en' : 'fr',
    tags: [...new Set([...(Array.isArray(tags) ? tags.map(String) : []), 'passport', 'nouveautes'])].slice(0, 8),
    active: true,
    consent: true,
    createdAt: new Date().toISOString(),
  };
  store.subscribers.unshift(subscriber);
  return { subscriber, created: true };
}

function ensurePassportFromEmail(store, email, extras = {}) {
  const clean = cleanEmail(email);
  if (!isEmail(clean)) return null;
  const list = ensurePassportsArray(store);
  let passport = list.find((p) => cleanEmail(p.email) === clean);
  const created = !passport;
  if (!passport) {
    passport = {
      id: newId(),
      token: newToken(),
      email: clean,
      name: String(extras.name || '').trim(),
      phone: String(extras.phone || '').trim(),
      createdAt: new Date().toISOString(),
      orders: [],
      totalSpent: 0,
      orderCount: 0,
      vip: false,
      source: String(extras.source || 'entry').slice(0, 40),
      pieces: [],
    };
    list.unshift(passport);
  }
  const paid = paidOrdersForEmail(store, clean);
  if (paid.length) {
    for (const order of paid) upsertPassportFromOrder(store, order);
    passport = findPassport(store, clean) || passport;
  } else {
    passport.updatedAt = new Date().toISOString();
    if (!passport.token) passport.token = newToken();
    if (!Array.isArray(passport.pieces)) passport.pieces = [];
  }
  const sub = ensureSubscriber(store, {
    email: clean,
    source: extras.source || 'passport',
    locale: extras.locale,
    tags: extras.tags,
  });
  return {
    passport,
    created,
    subscriberCreated: Boolean(sub?.created),
  };
}

function findPassport(store, email) {
  const want = cleanEmail(email);
  if (!want) return null;
  return (store?.passports || []).find((p) => cleanEmail(p.email) === want) || null;
}

function clientView(passport, { full } = {}) {
  if (!passport) return null;
  const view = {
    code: publicCode(passport.id),
    name: passport.name || '',
    email: full ? passport.email : maskEmail(passport.email),
    orderCount: Number(passport.orderCount) || 0,
    vip: Boolean(passport.vip),
    memberSince: passport.createdAt,
    pieces: Array.isArray(passport.pieces)
      ? passport.pieces.map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image || '',
        qty: Number(p.qty) || 1,
        bundle: Boolean(p.bundle),
      }))
      : [],
  };
  if (full) {
    view.id = passport.id;
    view.token = passport.token;
    view.phone = passport.phone || '';
    view.totalSpent = Number(passport.totalSpent) || 0;
    view.lastOrderId = passport.lastOrderId || '';
  }
  return view;
}

function maskEmail(email) {
  const value = cleanEmail(email);
  const at = value.indexOf('@');
  if (at < 1) return value;
  const user = value.slice(0, at);
  const domain = value.slice(at + 1);
  const keep = user.slice(0, Math.min(2, user.length));
  return `${keep}***@${domain}`;
}

function tokenMatches(passport, token) {
  const expected = String(passport?.token || '');
  const provided = String(token || '');
  if (!expected || !provided) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b) && provided === expected;
}

module.exports = {
  cleanEmail,
  isEmail,
  isPaidOrder,
  publicCode,
  collectPieces,
  upsertPassportFromOrder,
  upsertPassportFromPaidOrders,
  ensureSubscriber,
  ensurePassportFromEmail,
  findPassport,
  clientView,
  tokenMatches,
  maskEmail,
};
