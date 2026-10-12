'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ingestEvent,
  emptyState,
  upsertAd,
  deleteAd,
  summarize,
  trackedUrl,
  sanitizePixels,
  purchaseEventFromOrder,
} = require('../lib/analytics');
const { publicStore } = require('../lib/public-catalog');
const { buildTrustedOrder } = require('../lib/order-pricing');

let state = emptyState();
const view = ingestEvent(state, { type: 'page_view', path: '/', sessionId: 's1', sessionStart: true });
assert.ok(view.ok);
state = view.state;
assert.strictEqual(state.totals.page_view, 1);
assert.strictEqual(state.totals.sessions, 1);

const ad = upsertAd(state, {
  name: 'Drop IG',
  platform: 'meta',
  headline: 'MENES',
  primaryText: 'Street luxe.',
  destination: '/#products',
  slug: 'drop-ig',
});
assert.ok(ad.ok, ad.error);
state = ad.state;
const url = trackedUrl(ad.ad, 'https://www.mymenes.com');
assert.ok(url.includes('ad=drop-ig'));
assert.ok(url.includes('utm_source=meta'));

state = ingestEvent(state, { type: 'ad_click', ad: 'drop-ig', path: '/' }).state;
state = ingestEvent(state, { type: 'product_view', productId: 'hoodie', productName: 'Hoodie' }).state;
state = ingestEvent(state, { type: 'add_to_cart', productId: 'hoodie', productName: 'Hoodie', ad: 'drop-ig' }).state;
state = ingestEvent(state, { type: 'begin_checkout', ad: 'drop-ig' }).state;
const buy = ingestEvent(state, { type: 'purchase', orderId: 'M1', revenue: 120, productId: 'hoodie', productName: 'Hoodie', ad: 'drop-ig', qty: 1 });
state = buy.state;
const dup = ingestEvent(state, { type: 'purchase', orderId: 'M1', revenue: 120, ad: 'drop-ig' });
assert.ok(dup.duplicate);
assert.strictEqual(state.totals.purchase, 1);
assert.strictEqual(state.totals.revenue, 120);

const summary = summarize(state, { days: 30, shopBase: 'https://www.mymenes.com' });
assert.ok(summary.funnel.purchase >= 1);
assert.ok(summary.ads[0].clicks >= 1);
assert.ok(summary.ads[0].purchases >= 1);
assert.ok(summary.products[0].product_view >= 1);

state = deleteAd(state, ad.ad.id).state;
assert.strictEqual(state.ads.length, 0);

assert.strictEqual(sanitizePixels({ ga4: 'G-ABC123XYZ', meta: '123456789012', tiktok: 'C0DE99' }).ga4, 'G-ABC123XYZ');
assert.strictEqual(sanitizePixels({ ga4: 'javascript:alert(1)' }).ga4, '');

const priced = buildTrustedOrder({
  products: [{ id: 'hoodie', name: 'Hoodie', price: 89, active: true, stock: 5 }],
  discounts: [],
  site: {},
}, {
  customer: { name: 'A', email: 'a@b.com', phone: '5141112222', address: '1 rue', country: 'CA', province: 'QC' },
  items: [{ id: 'hoodie', qty: 1 }],
  marketing: { ad: 'drop-ig', utmSource: 'meta', sessionId: 's1' },
});
assert.ok(!priced.error, priced.error);
assert.strictEqual(priced.order.marketing.ad, 'drop-ig');
const pe = purchaseEventFromOrder(priced.order);
assert.strictEqual(pe.type, 'purchase');
assert.strictEqual(pe.ad, 'drop-ig');

const pub = publicStore({
  site: { name: 'MENES', pixels: { ga4: 'G-TESTID1', meta: '999' } },
  products: [],
  orders: [{ id: 'secret' }],
});
assert.ok(!pub.orders);
assert.strictEqual(pub.site.pixels.ga4, 'G-TESTID1');

const apiJs = fs.readFileSync(path.join(__dirname, '../api/analytics.js'), 'utf8');
assert.ok(apiJs.includes('await checkAdminAuth'), 'analytics admin routes must await auth');
assert.ok(apiJs.includes("action === 'save-ad'"));
const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes("trackShopEvent('page_view'"));
assert.ok(shopJs.includes("trackShopEvent('add_to_cart'"));
const consoleHtml = fs.readFileSync(path.join(__dirname, '../console.html'), 'utf8');
assert.ok(consoleHtml.includes('Studio ads'));
assert.ok(consoleHtml.includes('analyticsFunnel'));
const adminHtml = fs.readFileSync(path.join(__dirname, '../admin-site/index.html'), 'utf8');
assert.ok(adminHtml.includes('Studio ads'));
const build = fs.readFileSync(path.join(__dirname, '../scripts/build-boutique.js'), 'utf8');
assert.ok(build.includes('api/analytics.js'));

console.log('ok: analytics + ads studio');
