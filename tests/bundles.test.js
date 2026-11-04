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
assert.ok(bundles.isBrowsable(bundles.bySlug('kultur-steps')), 'kultur is browsable without price');
assert.ok(!bundles.isReady(bundles.bySlug('kultur-steps')), 'price placeholder keeps pack unsellable');
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

const missingPrice = buildTrustedOrder(store, {
  customer,
  items: [{ id: 'bundle-kultur-steps', qty: 1, variant: { combo: 'noir-jaune' } }],
});
assert.ok(missingPrice.error, 'unpriced bundle must fail checkout');

const orig = holiday.price;
holiday.price = 199;
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
assert.strictEqual(ok.order.items[0].price, 199, 'server ignores client bundle price');
assert.match(ok.order.items[0].size, /Noir/);
holiday.price = orig;

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
