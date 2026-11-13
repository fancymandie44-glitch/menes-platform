'use strict';

const PAID = new Set(['paid', 'processing', 'shipped', 'delivered', 'completed', 'fulfilled']);
const OPEN_CHECKOUT = new Set(['pending', 'awaiting_payment']);
const REFUND = new Set(['refunded', 'cancelled', 'canceled']);

function paidOrders(orders) {
  return (orders || []).filter((o) => PAID.has(String(o.status || '').toLowerCase()));
}

function orderMs(o) {
  const t = Date.parse(o?.paidAt || o?.date || o?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

function inRange(o, start, end) {
  const t = orderMs(o);
  return t >= start && t < end;
}

function periodBounds(now, key) {
  const d = new Date(now);
  const startToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (key === 'today') return { start: startToday, end: startToday + day, prevStart: startToday - day, prevEnd: startToday };
  if (key === 'week') return { start: startToday - 6 * day, end: startToday + day, prevStart: startToday - 13 * day, prevEnd: startToday - 6 * day };
  if (key === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    return { start, end, prevStart, prevEnd: start };
  }
  if (key === 'year') {
    const start = new Date(d.getFullYear(), 0, 1).getTime();
    const end = new Date(d.getFullYear() + 1, 0, 1).getTime();
    const prevStart = new Date(d.getFullYear() - 1, 0, 1).getTime();
    return { start, end, prevStart, prevEnd: start };
  }
  return { start: 0, end: now + 1, prevStart: 0, prevEnd: 0 };
}

function moneySum(list, field) {
  return Math.round(list.reduce((s, o) => s + (Number(o[field]) || 0), 0) * 100) / 100;
}

function snapshot(list) {
  const gross = moneySum(list, 'subtotal');
  const discounts = moneySum(list, 'discount');
  const net = moneySum(list, 'total');
  const aov = list.length ? Math.round((net / list.length) * 100) / 100 : 0;
  return { orders: list.length, gross, discounts, net, aov };
}

function deltaPct(cur, prev) {
  if (!(prev > 0)) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function productUnits(product) {
  const vars = Array.isArray(product?.variants) ? product.variants : [];
  if (vars.length) {
    return vars.reduce((s, v) => {
      const n = Number(v.stock);
      return s + (Number.isFinite(n) ? Math.max(0, n) : 0);
    }, 0);
  }
  const n = Number(product?.stock);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function bestSellers(orders, limit = 8) {
  const map = new Map();
  paidOrders(orders).forEach((o) => {
    (o.items || []).forEach((line) => {
      const id = String(line.id || line.productId || '');
      if (!id) return;
      const prev = map.get(id) || { id, name: line.name || id, qty: 0, revenue: 0, bundle: !!line.bundle };
      const q = Math.max(1, parseInt(line.qty, 10) || 1);
      prev.qty += q;
      prev.revenue += (Number(line.price) || 0) * q;
      map.set(id, prev);
    });
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, limit);
}

function collectionPerf(orders, products) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const map = new Map();
  paidOrders(orders).forEach((o) => {
    (o.items || []).forEach((line) => {
      const p = byId.get(line.id || line.productId);
      const col = p?.collection || p?.category || (line.bundle ? 'bundles' : 'other');
      const prev = map.get(col) || { id: col, qty: 0, revenue: 0 };
      const q = Math.max(1, parseInt(line.qty, 10) || 1);
      prev.qty += q;
      prev.revenue += (Number(line.price) || 0) * q;
      map.set(col, prev);
    });
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function inventoryAlerts(products, threshold = 5) {
  const out = [];
  (products || []).filter((p) => p && p.active !== false).forEach((p) => {
    const vars = Array.isArray(p.variants) ? p.variants : [];
    if (vars.length) {
      vars.forEach((v) => {
        const n = Number(v.stock);
        if (!Number.isFinite(n)) return;
        if (n <= 0) out.push({ id: p.id, name: p.name, variant: v.label || v.key || '', stock: 0, level: 'out' });
        else if (n <= threshold) out.push({ id: p.id, name: p.name, variant: v.label || v.key || '', stock: n, level: 'low' });
      });
      return;
    }
    const n = productUnits(p);
    if (n == null) return;
    if (n <= 0) out.push({ id: p.id, name: p.name, variant: '', stock: 0, level: 'out' });
    else if (n <= threshold) out.push({ id: p.id, name: p.name, variant: '', stock: n, level: 'low' });
  });
  return out.sort((a, b) => a.stock - b.stock);
}

function abandonedCheckouts(orders, now, minAgeMs = 60 * 60 * 1000) {
  return (orders || []).filter((o) => {
    if (!OPEN_CHECKOUT.has(String(o.status || '').toLowerCase())) return false;
    const t = orderMs(o) || Date.parse(o.date || '') || 0;
    return t && (now - t) >= minAgeMs;
  }).map((o) => ({
    id: o.id,
    email: o.customer?.email || '',
    name: o.customer?.name || '',
    total: Number(o.total) || 0,
    date: o.date || o.createdAt || '',
    items: (o.items || []).map((i) => i.name).filter(Boolean),
  }));
}

function customerIntel(orders, now) {
  const map = new Map();
  const day = 24 * 60 * 60 * 1000;
  paidOrders(orders).forEach((o) => {
    const email = String(o.customer?.email || '').trim().toLowerCase();
    if (!email) return;
    const prev = map.get(email) || {
      email, name: o.customer?.name || '', phone: o.customer?.phone || '',
      orders: 0, ltv: 0, lastMs: 0, firstMs: Infinity, tags: [],
    };
    prev.orders += 1;
    prev.ltv += Number(o.total) || 0;
    const t = orderMs(o);
    if (t > prev.lastMs) prev.lastMs = t;
    if (t && t < prev.firstMs) prev.firstMs = t;
    map.set(email, prev);
  });
  const list = [...map.values()].map((c) => {
    let segment = 'returning';
    if (c.orders === 1) segment = 'new';
    if (c.ltv >= 200 || c.orders >= 3) segment = 'vip';
    if (c.lastMs && (now - c.lastMs) > 60 * day) segment = 'inactive';
    return {
      ...c,
      ltv: Math.round(c.ltv * 100) / 100,
      aov: c.orders ? Math.round((c.ltv / c.orders) * 100) / 100 : 0,
      lastPurchase: c.lastMs ? new Date(c.lastMs).toISOString() : '',
      segment,
    };
  });
  const returning = list.filter((c) => c.orders >= 2).length;
  return {
    customers: list.sort((a, b) => b.ltv - a.ltv),
    newCount: list.filter((c) => c.segment === 'new').length,
    returningCount: returning,
    returningRate: list.length ? Math.round((returning / list.length) * 1000) / 10 : 0,
    vipCount: list.filter((c) => c.segment === 'vip').length,
  };
}

function dailySeries(orders, days, now) {
  const startToday = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const paid = paidOrders(orders);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const start = startToday - i * day;
    const slice = paid.filter((o) => inRange(o, start, start + day));
    out.push({
      date: new Date(start).toISOString().slice(0, 10),
      net: moneySum(slice, 'total'),
      orders: slice.length,
    });
  }
  return out;
}

function computeIntel(store, now = Date.now()) {
  const orders = store?.orders || [];
  const products = store?.products || [];
  const paid = paidOrders(orders);
  const refunded = (orders || []).filter((o) => REFUND.has(String(o.status || '').toLowerCase()));
  const all = snapshot(paid);
  const periods = {};
  ['today', 'week', 'month', 'year'].forEach((key) => {
    const b = periodBounds(now, key);
    const cur = snapshot(paid.filter((o) => inRange(o, b.start, b.end)));
    const prev = snapshot(paid.filter((o) => inRange(o, b.prevStart, b.prevEnd)));
    periods[key] = { ...cur, vsPrevPct: deltaPct(cur.net, prev.net) };
  });
  const crm = customerIntel(orders, now);
  const checkoutsStarted = (orders || []).filter((o) => OPEN_CHECKOUT.has(String(o.status || '').toLowerCase()) || PAID.has(String(o.status || '').toLowerCase())).length;
  const conversion = checkoutsStarted ? Math.round((paid.length / checkoutsStarted) * 1000) / 10 : 0;
  return {
    definitions: {
      net: 'Somme des totaux des commandes payées (paid/processing/shipped/delivered).',
      aov: 'Net payé ÷ nombre de commandes payées.',
      conversion: 'Commandes payées ÷ (pending + awaiting_payment + payées). Ce n’est pas un taux de sessions boutique.',
      returning: 'Clients avec au moins 2 commandes payées.',
      abandoned: 'Checkouts pending/awaiting_payment depuis plus d’une heure. Pas les paniers localStorage.',
    },
    all,
    periods,
    refunds: { orders: refunded.length, total: moneySum(refunded, 'total') },
    conversion,
    customers: crm,
    bestSellers: bestSellers(orders),
    collections: collectionPerf(orders, products),
    inventory: inventoryAlerts(products),
    abandoned: abandonedCheckouts(orders, now),
    series30: dailySeries(orders, 30, now),
    series7: dailySeries(orders, 7, now),
    profit: estimatedProfit(paid, products),
    ads: {
      connected: false,
      reason: 'Aucun compte Meta/TikTok Ads n’est branché. Les pixels mesurent les conversions boutique; les dépenses pub restent dans Ads Manager jusqu’à une API Ads (non demandée ici sans credentials).',
    },
  };
}

function estimatedProfit(paid, products) {
  const costById = new Map((products || []).map((p) => [p.id, Number(p.cost)]));
  let cogs = 0;
  let priced = 0;
  let missing = 0;
  paid.forEach((o) => {
    (o.items || []).forEach((line) => {
      const id = line.id || line.productId;
      const q = Math.max(1, parseInt(line.qty, 10) || 1);
      const cost = costById.get(id);
      if (Number.isFinite(cost) && cost > 0) {
        cogs += cost * q;
        priced += 1;
      } else missing += 1;
    });
  });
  const net = moneySum(paid, 'total');
  if (!priced) return { available: false, reason: 'Ajoute un coût (cost) sur chaque produit pour estimer la marge.' };
  return {
    available: true,
    cogs: Math.round(cogs * 100) / 100,
    net,
    estimate: Math.round((net - cogs) * 100) / 100,
    linesWithCost: priced,
    linesMissingCost: missing,
  };
}

module.exports = {
  PAID,
  paidOrders,
  computeIntel,
  bestSellers,
  inventoryAlerts,
  abandonedCheckouts,
  customerIntel,
};
