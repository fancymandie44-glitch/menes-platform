'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bundles = require('../data/bundles.js');
const { buildTrustedOrder, findDiscount } = require('../lib/order-pricing');

assert.ok(bundles.BUNDLES.length === 3, 'three bundles');
assert.strictEqual(bundles.bySlug('kultur-steps').kind, 'builder');
assert.strictEqual(bundles.bySlug('kultur-steps').pairCount, 2);
assert.strictEqual(bundles.bySlug('kultur-steps').fixedPairId, 'kultur');
assert.strictEqual(bundles.bySlug('holiday-exclusive').kind, 'builder');
assert.ok(bundles.isReady(bundles.bySlug('essentials')), 'essentials must be sellable at 99.99');
assert.strictEqual(bundles.bySlug('essentials').price, 99.99);
assert.strictEqual(bundles.bySlug('essentials').pairCount, 2);
assert.strictEqual(bundles.bySlug('essentials').boxer, true);
assert.ok(bundles.isBrowsable(bundles.bySlug('kultur-steps')));
assert.ok(bundles.isReady(bundles.bySlug('kultur-steps')), 'kultur must be sellable at 34.99');
assert.strictEqual(bundles.bySlug('kultur-steps').price, 34.99);
assert.ok(bundles.isReady(bundles.bySlug('holiday-exclusive')), 'holiday must be sellable at 329.99');
assert.strictEqual(bundles.bySlug('holiday-exclusive').price, 329.99);
assert.strictEqual(bundles.bySlug('holiday-exclusive').featured, true);
assert.ok(bundles.sorted()[0].slug === 'holiday-exclusive', 'holiday pack leads the grid');
assert.ok(bundles.visibleOnGrid(bundles.bySlug('essentials')));

const unit = bundles.UNIT_PRICES;
assert.strictEqual(unit.pairColor, 13);
assert.strictEqual(unit.pairKultur, 22);
assert.strictEqual(unit.boxer, 19.99);
assert.strictEqual(unit.capKultur, 99.99);
assert.strictEqual(unit.bagKeyz, 300);
const kulturBundle = bundles.bySlug('kultur-steps');
const essentialsBundle = bundles.bySlug('essentials');
const holiday = bundles.bySlug('holiday-exclusive');
assert.strictEqual(kulturBundle.comparePrice, 48);
assert.strictEqual(essentialsBundle.comparePrice, 145.98);
assert.strictEqual(holiday.comparePrice, 438.99);
assert.ok(bundles.savings(kulturBundle).amount === 13.01);
assert.ok(bundles.savings(essentialsBundle).amount === 45.99);
assert.ok(bundles.savings(holiday).amount === 109);
assert.ok(essentialsBundle.description.en.includes('145.98'));
assert.ok(essentialsBundle.description.fr.includes('145,98'));
assert.ok(!essentialsBundle.highlights.en.some((h) => h === '99.99 CAD'));
const pairImages = (holiday.pairOptions || bundles.PAIR_OPTIONS).map((p) => p.image);
assert.ok(pairImages.length === 8, 'eight holiday pair photos');
assert.ok(pairImages.every((src) => src.includes('/images/bundles/pairs/')), 'holiday pairs use pack shots, not combo photos');
assert.ok(pairImages.every((src) => !src.includes('kultur-steps-')), 'holiday pairs must not reuse Kultur Steps combo photos');
assert.ok(bundles.validateLine(holiday, { pairs: ['noir'] }).error);
assert.ok(!bundles.validateLine(holiday, { pairs: ['noir', 'jaune', 'rose'] }).error);
assert.ok(bundles.validateLine(holiday, { pairs: ['noir', 'nope', 'rose'] }).error);

const store = {
  products: [{ id: 'hat', name: 'Hat', price: 89, active: true, stock: 3 }],
  discounts: [],
  site: {},
};
const customer = { name: 'A', email: 'a@b.com', phone: '5141112222', address: '1 rue' };

assert.ok(bundles.validateLine(bundles.bySlug('kultur-steps'), { combo: 'noir-jaune' }).error);
assert.ok(bundles.validateLine(bundles.bySlug('kultur-steps'), { pairs: ['noir'] }).error);
assert.ok(!bundles.validateLine(bundles.bySlug('kultur-steps'), { pairs: ['noir', 'jaune'] }).error);
assert.ok(bundles.validateLine(bundles.bySlug('kultur-steps'), { pairs: ['noir', 'kultur'] }).error);
const kultur = buildTrustedOrder(store, {
  customer,
  items: [{ id: 'bundle-kultur-steps', qty: 1, price: 1, variant: { pairs: ['noir', 'rose'] } }],
});
assert.ok(!kultur.error, kultur.error);
assert.strictEqual(kultur.order.items[0].price, 34.99, 'server ignores client kultur price');
assert.match(kultur.order.items[0].size, /Kultur/i);

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

const essentialsLine = {
  id: 'bundle-essentials',
  qty: 1,
  price: 1,
  variant: { pairs: ['noir', 'jaune'], boxerColor: 'red', boxerSize: 'M' },
};
assert.ok(bundles.validateLine(bundles.bySlug('essentials'), { pairs: ['noir'] }).error);
assert.ok(bundles.validateLine(bundles.bySlug('essentials'), { pairs: ['noir', 'jaune'] }).error, 'boxer required');
assert.ok(!bundles.validateLine(bundles.bySlug('essentials'), essentialsLine.variant).error);
const essentials = buildTrustedOrder(store, { customer, items: [essentialsLine] });
assert.ok(!essentials.error, essentials.error);
assert.strictEqual(essentials.order.items[0].price, 99.99, 'server ignores client essentials price');
assert.match(essentials.order.items[0].size, /Red/i);

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
