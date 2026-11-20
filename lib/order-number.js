'use strict';

/** Last order sold by hand. The next online order is 1203. */
const LAST_MANUAL_ORDER = 1202;

function maxExistingNumber(store) {
  return (store?.orders || []).reduce((max, o) => {
    const n = Number(o && o.number);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
}

function nextOrderNumber(store) {
  const target = store && typeof store === 'object' ? store : {};
  const fromSeq = Number(target.orderSeq);
  const last = Math.max(
    LAST_MANUAL_ORDER,
    Number.isFinite(fromSeq) ? fromSeq : 0,
    maxExistingNumber(target)
  );
  const next = last + 1;
  target.orderSeq = next;
  return next;
}

function assignOrderNumber(store, order) {
  if (!order || typeof order !== 'object') return order;
  const n = nextOrderNumber(store);
  order.number = n;
  order.id = `M${n}`;
  return order;
}

function displayOrderNumber(order) {
  const n = Number(order?.number);
  if (Number.isInteger(n) && n > 0) return String(n);
  const id = String(order?.id || '');
  const m = /^M(\d{4,})$/.exec(id);
  if (m) return m[1];
  return id || '—';
}

module.exports = {
  LAST_MANUAL_ORDER,
  nextOrderNumber,
  assignOrderNumber,
  displayOrderNumber,
};
