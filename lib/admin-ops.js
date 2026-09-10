/**
 * Merchant-ops helpers shared by checkout (server) and tests.
 * Keep console.js in sync for browser-side fulfillment / restock.
 */

function productThumb(product) {
  if (!product) return '';
  if (product.image) return String(product.image);
  const first = Array.isArray(product.images) ? product.images[0] : null;
  if (!first) return '';
  return typeof first === 'string' ? first : String(first.url || '');
}

function productStockTotal(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    return variants.reduce((s, v) => s + Math.max(0, Number(v.stock) || 0), 0);
  }
  const n = Number(product?.stock);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function isLowStock(product, threshold = 5) {
  if (!product || product.active === false) return false;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) {
    return variants.some((v) => {
      const n = Number(v.stock) || 0;
      return n > 0 && n <= threshold;
    }) || productStockTotal(product) <= threshold;
  }
  const n = productStockTotal(product);
  return n > 0 && n <= threshold;
}

function isOutOfStock(product) {
  return productStockTotal(product) <= 0;
}

function computeShipping(store, customer, subtotal) {
  const amount = Number(subtotal) || 0;
  const threshold = Number(store?.site?.freeShippingThreshold);
  if (Number.isFinite(threshold) && threshold > 0 && amount >= threshold) return 0;

  const rates = Array.isArray(store?.site?.shippingRates) ? store.site.shippingRates : [];
  const country = String(customer?.country || 'CA').trim().toUpperCase() || 'CA';
  const eligible = rates.filter((r) => {
    if (!r || r.active === false) return false;
    const min = Number(r.minCart) || 0;
    const maxRaw = r.maxCart;
    const max = maxRaw == null || maxRaw === '' ? Infinity : Number(maxRaw);
    if (amount < min || amount > max) return false;
    const countries = String(r.countries || '').trim();
    if (!countries) return true;
    const list = countries.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    return list.includes('ALL') || list.includes(country);
  });
  if (!eligible.length) return 0;
  eligible.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  return Math.max(0, Number(eligible[0].price) || 0);
}

function upsertCustomerFromOrder(store, order) {
  if (!store || !order?.customer?.email) return null;
  if (!Array.isArray(store.customers)) store.customers = [];
  const email = String(order.customer.email).trim().toLowerCase();
  if (!email) return null;
  const now = new Date().toISOString();
  let row = store.customers.find((c) => String(c.email || '').toLowerCase() === email);
  if (!row) {
    row = {
      id: `cus_${email.replace(/[^a-z0-9]/g, '').slice(0, 20)}`,
      email,
      name: '',
      phone: '',
      notes: '',
      tags: [],
      createdAt: now,
    };
    store.customers.push(row);
  }
  row.name = String(order.customer.name || row.name || '').trim();
  row.phone = String(order.customer.phone || row.phone || '').trim();
  row.city = String(order.customer.city || row.city || '').trim();
  row.province = String(order.customer.province || row.province || '').trim();
  row.country = String(order.customer.country || row.country || '').trim();
  row.lastOrderId = order.id || row.lastOrderId;
  row.lastOrderAt = order.date || now;
  row.updatedAt = now;
  return row;
}

function pushOrderEvent(order, type, note) {
  if (!order) return null;
  if (!Array.isArray(order.events)) order.events = [];
  const event = {
    id: `evt_${Date.now().toString(36)}`,
    type: String(type || 'note').slice(0, 40),
    note: String(note || '').slice(0, 400),
    at: new Date().toISOString(),
  };
  order.events.unshift(event);
  if (order.events.length > 40) order.events.length = 40;
  return event;
}

function applyFulfillment(order, payload = {}) {
  if (!order) return order;
  const trackingNumber = String(payload.trackingNumber || '').trim().slice(0, 80);
  const carrier = String(payload.carrier || '').trim().slice(0, 40);
  const trackingUrl = String(payload.trackingUrl || '').trim().slice(0, 300);
  order.trackingNumber = trackingNumber;
  order.carrier = carrier;
  order.trackingUrl = trackingUrl;
  if (trackingNumber && !order.shippedAt) order.shippedAt = new Date().toISOString();
  if (payload.status) order.status = payload.status;
  if (trackingNumber) {
    pushOrderEvent(order, 'fulfillment', `${carrier || 'Colis'} · ${trackingNumber}`);
  }
  return order;
}

module.exports = {
  productThumb,
  productStockTotal,
  isLowStock,
  isOutOfStock,
  computeShipping,
  upsertCustomerFromOrder,
  pushOrderEvent,
  applyFulfillment,
};
