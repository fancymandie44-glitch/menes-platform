'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { computeIntel, paidOrders } = require('../lib/commerce-intel');
const { sanitizeEvent, hasPurchaseDedupe, publicTracking } = require('../lib/tracking-core');
const { upsertCustomerFromOrder, applyVipTag } = require('../lib/customers');
const { runPaidAutomations } = require('../lib/automations');
const { buildReport } = require('../lib/diagnostics');
const { publicStore } = require('../lib/public-catalog');

const now = Date.parse('2026-11-13T16:00:00Z');
const store = {
  products: [
    { id: 'hat', name: 'Hat', price: 80, active: true, stock: 2, category: 'hats', cost: 20 },
    { id: 'socks', name: 'Socks', price: 25, active: true, stock: 0, category: 'socks' },
  ],
  orders: [
    {
      id: 'A1', status: 'paid', total: 80, subtotal: 80, discount: 0,
      paidAt: '2026-11-13T12:00:00Z', customer: { email: 'vip@x.com', name: 'Vip' },
      items: [{ id: 'hat', name: 'Hat', price: 80, qty: 1 }],
    },
    {
      id: 'A2', status: 'paid', total: 80, subtotal: 80, discount: 0,
      paidAt: '2026-10-01T12:00:00Z', customer: { email: 'vip@x.com', name: 'Vip' },
      items: [{ id: 'hat', name: 'Hat', price: 80, qty: 1 }],
    },
    {
      id: 'P1', status: 'pending', total: 50, date: '2026-11-13T10:00:00Z',
      customer: { email: 'lost@x.com' }, items: [{ id: 'socks', name: 'Socks', price: 25, qty: 2 }],
    },
  ],
};

const intel = computeIntel(store, now);
assert.strictEqual(intel.all.orders, 2);
assert.strictEqual(intel.all.net, 160);
assert.strictEqual(intel.all.aov, 80);
assert.ok(intel.conversion > 0);
assert.strictEqual(intel.customers.returningCount, 1);
assert.ok(intel.bestSellers[0].id === 'hat');
assert.ok(intel.inventory.some((a) => a.id === 'socks' && a.level === 'out'));
assert.ok(intel.abandoned.some((a) => a.id === 'P1'));
assert.ok(intel.profit.available);
assert.strictEqual(intel.profit.cogs, 40);
assert.strictEqual(intel.ads.connected, false);
assert.ok(intel.definitions.net.includes('payées'));

const bad = sanitizeEvent({ event: 'Purchase' });
assert.strictEqual(bad.error, 'event_id_requis');
const ok = sanitizeEvent({ event: 'Purchase', eventId: 'e1', transactionId: 'A1', value: 80, items: [{ id: 'hat', name: 'Hat', price: 80, qty: 1 }], consent: true });
assert.strictEqual(ok.event, 'Purchase');
assert.strictEqual(hasPurchaseDedupe([{ event: 'Purchase', transactionId: 'A1', ok: true }], ok), true);
assert.strictEqual(hasPurchaseDedupe([], ok), false);

const pub = publicTracking({ tracking: { metaPixelId: '123', capiToken: 'SECRET' } });
assert.strictEqual(pub.metaPixelId, '123');
assert.ok(!Object.values(pub).some((v) => String(v).includes('SECRET')));

const catalog = publicStore({
  site: { tracking: { metaPixelId: '1', capiToken: 'nope' } },
  products: store.products,
  orders: store.orders,
  trackingLog: [{ token: 'leak' }],
});
assert.ok(!catalog.orders);
assert.ok(!catalog.trackingLog);
assert.ok(!JSON.stringify(catalog).includes('leak'));
assert.ok(!JSON.stringify(catalog).includes('capiToken'));

const crmStore = { customers: [] };
upsertCustomerFromOrder(crmStore, store.orders[0]);
upsertCustomerFromOrder(crmStore, store.orders[1]);
assert.strictEqual(crmStore.customers.length, 1);
assert.strictEqual(crmStore.customers[0].orders, 2);
assert.strictEqual(crmStore.customers[0].ltv, 160);
applyVipTag(crmStore.customers[0], 200);
assert.ok(!crmStore.customers[0].tags.includes('vip'));
crmStore.customers[0].ltv = 200;
runPaidAutomations(crmStore, store.orders[0]);
assert.ok(crmStore.customers[0].tags.includes('vip'));

const report = buildReport({ healthOk: true, blobsOk: true, storeOrders: 3, pingMs: 40 });
assert.strictEqual(report.shopify.connected, false);
assert.ok(report.score <= 100);
assert.ok(Array.isArray(report.checks));

const trackSrc = fs.readFileSync(path.join(__dirname, '../api/track.js'), 'utf8');
assert.ok(!trackSrc.includes('META_CAPI_TOKEN') || trackSrc.includes('process.env.META_CAPI_TOKEN'));
assert.ok(!fs.readFileSync(path.join(__dirname, '../shop-track.js'), 'utf8').includes('META_CAPI_TOKEN'));
assert.ok(fs.readFileSync(path.join(__dirname, '../console.html'), 'utf8').includes('tab-tracking'));
assert.ok(fs.readFileSync(path.join(__dirname, '../console.html'), 'utf8').includes('RUN FULL SYSTEM CHECK'));
assert.strictEqual(paidOrders(store.orders).length, 2);

console.log('ok: control center intel, tracking dedupe, CRM, diagnostics');
