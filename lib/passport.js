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
  return Boolean(passport?.token) && String(token || '') === String(passport.token);
}

module.exports = {
  cleanEmail,
  isEmail,
  isPaidOrder,
  publicCode,
  upsertPassportFromOrder,
  upsertPassportFromPaidOrders,
  findPassport,
  clientView,
  tokenMatches,
  maskEmail,
};
