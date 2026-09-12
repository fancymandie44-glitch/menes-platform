/**
 * Recovery jobs that actually make money: unpaid checkout reminders
 * and post-shipping review asks. Marks are stored on the order so
 * we never spam.
 */
'use strict';

const UNPAID_AFTER_MS = 2 * 60 * 60 * 1000;
const REVIEW_AFTER_MS = 5 * 24 * 60 * 60 * 1000;

function parseTime(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
}

function shopOrigin(store) {
  const fromSite = String(store?.site?.url || store?.site?.domain || '').trim();
  if (/^https?:\/\//i.test(fromSite)) return fromSite.replace(/\/$/, '');
  return 'https://www.mymenes.com';
}

function unpaidOrders(store, now = Date.now()) {
  return (store.orders || []).filter((o) => {
    if (!o || o.reminderSentAt) return false;
    if (o.status !== 'awaiting_payment' && o.status !== 'pending') return false;
    if (!String(o.customer?.email || '').trim()) return false;
    const created = parseTime(o.date || o.createdAt);
    return created && (now - created) >= UNPAID_AFTER_MS;
  });
}

function reviewOrders(store, now = Date.now()) {
  return (store.orders || []).filter((o) => {
    if (!o || o.reviewAskSentAt) return false;
    if (o.status !== 'shipped' && o.status !== 'delivered') return false;
    if (!String(o.customer?.email || '').trim()) return false;
    const shipped = parseTime(o.shippedAt || o.deliveredAt);
    return shipped && (now - shipped) >= REVIEW_AFTER_MS;
  });
}

function firstProductId(order) {
  const item = (order.items || [])[0];
  return item?.id || item?.productId || '';
}

function markSent(order, field) {
  order[field] = new Date().toISOString();
  if (!Array.isArray(order.events)) order.events = [];
  order.events.unshift({
    id: `evt_${Date.now().toString(36)}`,
    type: field === 'reminderSentAt' ? 'reminder' : 'review_ask',
    note: field === 'reminderSentAt' ? 'Relance paiement envoyée' : 'Demande d’avis envoyée',
    at: order[field],
  });
}

module.exports = {
  UNPAID_AFTER_MS,
  REVIEW_AFTER_MS,
  shopOrigin,
  unpaidOrders,
  reviewOrders,
  firstProductId,
  markSent,
};
