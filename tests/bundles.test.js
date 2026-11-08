'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bundles = require('../data/bundles.js');
const { buildTrustedOrder, findDiscount } = require('../lib/order-pricing');

assert.ok(bundles.BUNDLES.length === 3, 'three bundles');
assert.strictEqual(bundles.bySlug('kultur-steps').kind, 'combo');
assert.strictEqual(bundles.bySlug('holiday-exclusive').kind, 'builder');
assert.strictEqual(bundles.bySlug('bundle-moyen').published, false);
assert.ok(bundles.isBrowsable(bundles.bySlug('kultur-steps')));
assert.ok(bundles.isReady(bundles.bySlug('kultur-steps')), 'kultur must be sellable at 34.99');
assert.strictEqual(bundles.bySlug('kultur-steps').price, 34.99);
assert.ok(bundles.isReady(bundles.bySlug('holiday-exclusive')), 'holiday must be sellable at 329.99');
assert.strictEqual(bundles.bySlug('holiday-exclusive').price, 329.99);
assert.strictEqual(bundles.bySlug('holiday-exclusive').featured, true);
assert.ok(bundles.sorted()[0].slug === 'holiday-exclusive', 'holiday pack leads the grid');
assert.ok(!bundles.isReady(bundles.bySlug('bundle-moyen')));
assert.ok(bundles.visibleOnGrid(bundles.bySlug('bundle-moyen')), 'unpublished still occupies the grid');

const holiday = bundles.bySlug('holiday-exclusive');
assert.ok(bundles.validateLine(holiday, { pairs: ['noir'] }).error);
assert.ok(!bundles.validateLine(holiday, { pairs: ['noir', 'jaune', 'rose'] }).error);
assert.ok(bundles.validateLine(holiday, { pairs: ['noir', 'nope', 'rose'] }).error);

const store = {
  products: [{ id: 'hat', name: 'Hat', price: 89, active: true, stock: 3 }],
  discounts: [],
  site: {},
};
const customer = { name: 'A', email: 'a@b.com', phone: '5141112222', address: '1 rue' };

const kultur = buildTrustedOrder(store, {
  customer,
  items: [{ id: 'bundle-kultur-steps', qty: 1, price: 1, variant: { combo: 'noir-jaune' } }],
});
assert.ok(!kultur.error, kultur.error);
assert.strictEqual(kultur.order.items[0].price, 34.99, 'server ignores client kultur price');

const ok = buildTrustedOrder(store, {
  customer,
  items: [{
    id: 'bundle-holiday-exclusive',
    qty: 1,
    price: 1,
    variant: { pairs: ['noir', 'jaune', 'rose'] },
  }],
});
assert.ok(!ok.error, ok.error);
assert.strictEqual(ok.order.items[0].price, 329.99, 'server ignores client holiday price');
assert.match(ok.order.items[0].size, /Noir/);

assert.ok(buildTrustedOrder(store, {
  customer,
  items: [{ id: 'bundle-moyen', qty: 1 }],
}).error, 'unpublished middle bundle must not sell');

assert.strictEqual(findDiscount(store, 'MENESFAM'), null, 'empty percent must not invent a discount');
bundles.CLIENT_DISCOUNT.percent = 10;
const disc = findDiscount(store, 'menesfam');
assert.ok(disc);
assert.strictEqual(disc.type, 'percent');
assert.strictEqual(disc.value, 10);
bundles.CLIENT_DISCOUNT.percent = null;

const cfg = fs.readFileSync(path.join(__dirname, '../data/bundles.js'), 'utf8');
assert.ok(!cfg.includes('TODO'), 'no TODO in bundle config');

console.log('ok: bundles');
