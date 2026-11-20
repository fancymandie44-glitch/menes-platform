'use strict';

const assert = require('assert');
const { passwordsMatch } = require('../lib/admin-auth');
const { publicStore } = require('../lib/public-catalog');
const { buildTrustedOrder, decrementStockForOrder } = require('../lib/order-pricing');
const { allowRequest } = require('../lib/rate-limit');
const { tokenMatches } = require('../lib/passport');
const fs = require('fs');
const path = require('path');

assert.strictEqual(passwordsMatch('secret', 'secret'), true);
assert.strictEqual(passwordsMatch('secret', 'other'), false);
assert.strictEqual(passwordsMatch('', 'secret'), false);

const store = {
  site: { name: 'MENES', language: 'fr' },
  products: [{ id: 'hat', name: 'Hat', price: 10, active: true, stock: 9 }],
  orders: [{ id: 'secret-order', customer: { email: 'a@b.com' }, total: 10 }],
  discounts: [{ code: 'VIP10', active: true, type: 'percent', value: 10 }],
  reviews: [{ id: '1', status: 'pending', authorEmail: 'x@y.com', body: 'nope' }],
};
const pub = publicStore(store);
assert.ok(!pub.orders, 'public catalog must not include orders');
assert.strictEqual(pub.discounts.length, 0, 'VIP10 must stay private');
assert.strictEqual(pub.reviews.length, 0, 'pending reviews must stay private');

const checkoutJs = fs.readFileSync(path.join(__dirname, '../api/create-checkout.js'), 'utf8');
assert.ok(checkoutJs.includes('buildTrustedOrder'), 'create-checkout must not trust client prices');
assert.ok(!/item\.price \* 100/.test(checkoutJs), 'create-checkout must not use client line prices');

const reviewsJs = fs.readFileSync(path.join(__dirname, '../api/reviews.js'), 'utf8');
assert.ok(reviewsJs.includes("status = 'approved'"), 'public reviews must force approved status');

const platformJs = fs.readFileSync(path.join(__dirname, '../api/../lib/platform.js'), 'utf8');
assert.ok(platformJs.includes('knownSiteIds'), 'site ids must be allowlisted');

const priced = buildTrustedOrder({
  products: [{ id: 'hat', name: 'Hat', price: 89, active: true, stock: 3 }],
  discounts: [],
  site: {},
}, {
  customer: { name: 'A', email: 'a@b.com', phone: '5141112222', address: '1 rue' },
  items: [{ id: 'hat', qty: 1, price: 1 }],
});
assert.ok(!priced.error, priced.error);
assert.strictEqual(priced.order.items[0].price, 89, 'server must ignore client price');

const oversell = buildTrustedOrder({
  products: [{ id: 'hat', name: 'Hat', price: 89, active: true, stock: 2 }],
  discounts: [],
  site: {},
}, {
  customer: { name: 'A', email: 'a@b.com', phone: '5141112222', address: '1 rue' },
  items: [{ id: 'hat', qty: 9 }],
});
assert.ok(oversell.error, 'must reject qty above stock');

const live = {
  products: [{ id: 'hat', name: 'Hat', price: 89, active: true, stock: 9 }],
};
const order = {
  items: [{ id: 'hat', qty: 2 }],
};
assert.strictEqual(decrementStockForOrder(live, order), true);
assert.strictEqual(live.products[0].stock, 7);
assert.strictEqual(decrementStockForOrder(live, order), false, 'stock decrement is idempotent');
assert.strictEqual(live.products[0].stock, 7);

assert.strictEqual(tokenMatches({ token: 'abc' }, 'abc'), true);
assert.strictEqual(tokenMatches({ token: 'abc' }, 'ab'), false);

const k = `t-${Date.now()}`;
for (let i = 0; i < 3; i++) assert.strictEqual(allowRequest(k, { limit: 3, windowMs: 10_000 }), true);
assert.strictEqual(allowRequest(k, { limit: 3, windowMs: 10_000 }), false);

console.log('ok: security checks');
