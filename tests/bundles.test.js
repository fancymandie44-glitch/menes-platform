'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bundles = require('../data/bundles.js');
const { buildTrustedOrder, findDiscount, decrementStockForOrder } = require('../lib/order-pricing');
const { publicStore } = require('../lib/public-catalog');

const LIVE = bundles.dropAtMs();
const LOCKED = LIVE - 1000;
assert.strictEqual(new Date(bundles.DROP_AT).toISOString(), '2026-11-20T05:00:00.000Z');
assert.ok(!bundles.isDropLive(LOCKED), 'packs stay locked before Nov 20 midnight Eastern');
assert.ok(bundles.isDropLive(LIVE), 'packs unlock at Nov 20 00:00 Eastern');
assert.ok(!bundles.canPurchase(bundles.bySlug('essentials'), LOCKED));
assert.ok(bundles.canPurchase(bundles.bySlug('essentials'), LIVE));
assert.ok(bundles.countdownParts(LOCKED).days >= 0);
assert.ok(bundles.countdownParts(LIVE).live);

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
assert.strictEqual(unit.capCamo, 99.99);
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
assert.ok(bundles.validateLine(holiday, { pairs: ['noir', 'jaune', 'rose'] }).error, 'holiday needs a hat');
assert.ok(!bundles.validateLine(holiday, { pairs: ['noir', 'jaune', 'rose'], hatColor: 'camo' }).error);
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
const lockedOrder = buildTrustedOrder(store, {
  customer,
  items: [{ id: 'bundle-kultur-steps', qty: 1, price: 1, variant: { pairs: ['noir', 'rose'] } }],
}, LOCKED);
assert.ok(lockedOrder.error, 'server must refuse bundle checkout before the drop');
assert.match(lockedOrder.error, /minuit|midnight/i);

const kultur = buildTrustedOrder(store, {
  customer,
  items: [{ id: 'bundle-kultur-steps', qty: 1, price: 1, variant: { pairs: ['noir', 'rose'] } }],
}, LIVE);
assert.ok(!kultur.error, kultur.error);
assert.strictEqual(kultur.order.items[0].price, 34.99, 'server ignores client kultur price');
assert.match(kultur.order.items[0].size, /Kultur/i);

const ok = buildTrustedOrder(store, {
  customer,
  items: [{
    id: 'bundle-holiday-exclusive',
    qty: 1,
    price: 1,
    variant: { pairs: ['noir', 'jaune', 'rose'], hatColor: 'camo' },
  }],
}, LIVE);
assert.ok(!ok.error, ok.error);
assert.strictEqual(ok.order.items[0].price, 329.99, 'server ignores client holiday price');
assert.match(ok.order.items[0].size, /Noir/);

const essentialsLine = {
  id: 'bundle-essentials',
  qty: 1,
  price: 1,
  variant: { pairs: ['noir', 'jaune'], boxerColor: 'red', boxerSize: 'M', hatColor: 'orange' },
};
assert.ok(bundles.validateLine(bundles.bySlug('essentials'), { pairs: ['noir'] }).error);
assert.ok(bundles.validateLine(bundles.bySlug('essentials'), { pairs: ['noir', 'jaune'] }).error, 'boxer required');
assert.ok(!bundles.validateLine(bundles.bySlug('essentials'), essentialsLine.variant).error);
const essentials = buildTrustedOrder(store, { customer, items: [essentialsLine] }, LIVE);
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

assert.strictEqual(bundles.bySlug('essentials').limit, 3);
assert.strictEqual(bundles.bySlug('holiday-exclusive').limit, 5);
assert.strictEqual(bundles.bySlug('kultur-steps').limit, null);

const stockStore = {
  products: [
    {
      id: 'summer-socks',
      name: 'Summer',
      stock: 10,
      variants: [
        { options: { Color: 'Black' }, stock: 0 },
        { options: { Color: 'Yellow' }, stock: 4 },
        { options: { Color: 'Pink' }, stock: 2 },
      ],
    },
    { id: 'menes-kltr-socks', name: 'KLTR', stock: 9 },
    {
      id: 'menes-boxer',
      variants: [
        { options: { Color: 'Red', Size: 'M' }, stock: 2 },
        { options: { Color: 'Grey', Size: 'M' }, stock: 0 },
      ],
    },
    {
      id: 'menes-kltr-trucker-hat',
      name: 'Hat',
      stock: 7,
      variants: [
        { options: { Color: 'Orange' }, stock: 5 },
        { options: { Color: 'Black' }, stock: 1 },
        { options: { Color: 'Brown' }, stock: 1 },
      ],
    },
    { id: 'menes-m-keyz-crossbody-bag-', name: 'Bag', stock: 10 },
  ],
  orders: [
    { status: 'paid', items: [{ id: 'bundle-essentials', qty: 3 }] },
    { status: 'paid', items: [{ id: 'bundle-holiday-exclusive', qty: 5 }] },
  ],
};
assert.ok(!bundles.canPurchase(bundles.bySlug('essentials'), LIVE, stockStore), 'essentials capped at 3');
assert.ok(!bundles.canPurchase(bundles.bySlug('holiday-exclusive'), LIVE, stockStore), 'holiday capped at 5');
assert.ok(bundles.canPurchase(bundles.bySlug('kultur-steps'), LIVE, stockStore), 'kultur steps stay unlimited');
assert.ok(!bundles.pairAvailable(stockStore, 'noir'), 'sold-out pair is unavailable');
assert.ok(bundles.pairAvailable(stockStore, 'jaune'));
assert.ok(bundles.validateBundleStock(stockStore, bundles.bySlug('kultur-steps'), { pairs: ['noir', 'jaune'] }, 1).error);
assert.ok(!bundles.validateBundleStock(stockStore, bundles.bySlug('kultur-steps'), { pairs: ['jaune', 'rose'] }, 1).error);

const oneLeft = {
  ...stockStore,
  orders: [{ status: 'paid', items: [{ id: 'bundle-essentials', qty: 2 }] }],
};
assert.strictEqual(bundles.bundleRemaining(oneLeft, bundles.bySlug('essentials')), 1);
const fourth = buildTrustedOrder(oneLeft, {
  customer,
  items: [{ id: 'bundle-essentials', qty: 2, variant: essentialsLine.variant }],
}, LIVE);
assert.ok(fourth.error, 'cannot buy more essentials than remaining');

const pub = publicStore(stockStore);
assert.strictEqual(pub.bundles.soldOut['bundle-essentials'], true);
assert.strictEqual(pub.bundles.soldOut['bundle-holiday-exclusive'], true);
assert.strictEqual(pub.bundles.soldOut['bundle-kultur-steps'], false);
assert.ok(!('remaining' in pub.bundles), 'customers must not see remaining bundle counts');
assert.strictEqual(pub.bundles.pairs.noir, false);
assert.strictEqual(pub.bundles.pairs.jaune, true);
assert.strictEqual(pub.bundles.hats.camo, true);

const liveStock = {
  products: JSON.parse(JSON.stringify(stockStore.products)),
  orders: [],
};
const paidKultur = {
  items: [{
    id: 'bundle-kultur-steps',
    qty: 1,
    bundle: true,
    variant: { pairs: ['jaune', 'rose'], fixedPair: 'kultur' },
  }],
};
assert.strictEqual(decrementStockForOrder(liveStock, paidKultur), true);
assert.strictEqual(liveStock.products.find((p) => p.id === 'menes-kltr-socks').stock, 8);
assert.strictEqual(liveStock.products.find((p) => p.id === 'summer-socks').variants.find((v) => v.options.Color === 'Yellow').stock, 3);
assert.strictEqual(liveStock.products.find((p) => p.id === 'summer-socks').variants.find((v) => v.options.Color === 'Black').stock, 0);

assert.ok(bundles.validateLine(bundles.bySlug('holiday-exclusive'), { pairs: ['noir', 'jaune', 'rose'] }).error, 'holiday needs a hat');
assert.ok(!bundles.validateLine(bundles.bySlug('holiday-exclusive'), { pairs: ['noir', 'jaune', 'rose'], hatColor: 'camo' }).error);
assert.ok(bundles.validateLine(bundles.bySlug('essentials'), { pairs: ['noir', 'jaune'], boxerColor: 'red', boxerSize: 'M', hatColor: 'camo' }).error, 'camo is holiday-only');
assert.strictEqual(bundles.HAT_OPTIONS[0].id, 'camo', 'camo is the first hat');
const hatStore = { products: JSON.parse(JSON.stringify(stockStore.products)), orders: [], inventory: { hats: { camo: 5 } } };
assert.ok(!bundles.validateBundleStock(hatStore, bundles.bySlug('holiday-exclusive'), { pairs: ['jaune', 'rose', 'jaune'], hatColor: 'black' }, 1).error);
hatStore.products.find((p) => p.id === 'menes-kltr-trucker-hat').variants.find((v) => v.options.Color === 'Black').stock = 0;
assert.ok(bundles.validateBundleStock(hatStore, bundles.bySlug('holiday-exclusive'), { pairs: ['jaune', 'rose', 'jaune'], hatColor: 'black' }, 1).error, 'cannot sell a black hat twice');
const paidHoliday = {
  items: [{
    id: 'bundle-holiday-exclusive',
    qty: 1,
    bundle: true,
    variant: { pairs: ['jaune', 'rose', 'jaune'], hatColor: 'orange' },
  }],
};
assert.strictEqual(decrementStockForOrder(hatStore, paidHoliday), true);
assert.strictEqual(hatStore.products.find((p) => p.id === 'menes-kltr-trucker-hat').variants.find((v) => v.options.Color === 'Orange').stock, 4);
const paidCamo = {
  items: [{
    id: 'bundle-holiday-exclusive',
    qty: 1,
    bundle: true,
    variant: { pairs: ['jaune', 'rose', 'jaune'], hatColor: 'camo' },
  }],
};
assert.strictEqual(decrementStockForOrder(hatStore, paidCamo), true);
assert.strictEqual(hatStore.inventory.hats.camo, 4);

const shopBundlesJs = fs.readFileSync(path.join(__dirname, '../shop-bundles.js'), 'utf8');
assert.ok(!shopBundlesJs.includes('${left} left'), 'do not show remaining bundle counts');
assert.ok(!shopBundlesJs.includes('restant${left'), 'do not show remaining bundle counts in French');
assert.notStrictEqual(bundles.bySlug('holiday-exclusive').urgency.en, 'Only 5 packs');
assert.notStrictEqual(bundles.bySlug('essentials').urgency.en, 'Only 3 packs');
assert.ok(!/Only \d+ packs/i.test(fs.readFileSync(path.join(__dirname, '../data/bundles.js'), 'utf8')));

console.log('ok: bundles');
