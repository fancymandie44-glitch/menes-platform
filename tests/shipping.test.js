'use strict';

const assert = require('assert');
const { quoteShipping, ORIGIN } = require('../lib/shipping');
const { parseQuery, scoreCandidate, normalizePhoton } = require('../lib/address-search');
const { buildTrustedOrder } = require('../lib/order-pricing');
const fs = require('fs');
const path = require('path');

assert.strictEqual(ORIGIN.postal, 'H1E 1M0');

const local = quoteShipping({
  country: 'CA', province: 'QC', city: 'Montréal', postal: 'H1E 1V9',
  subtotal: 85, items: [{ name: 'Hoodie', qty: 1 }],
});
assert.ok(local.amount >= 8 && local.amount < 20, 'Montreal under 150$ pays local shipping');
assert.strictEqual(local.zone, 'local');

const free = quoteShipping({
  country: 'CA', province: 'QC', city: 'Montréal', postal: 'H1E 1V9',
  subtotal: 160, items: [{ name: 'Hoodie', qty: 2 }],
});
assert.strictEqual(free.amount, 0, 'Canada 150$+ is free');
assert.ok(free.free);

const france = quoteShipping({
  country: 'FR', city: 'Paris', postal: '75004',
  subtotal: 200, items: [{ name: 'Hoodie', qty: 1 }],
});
assert.ok(france.amount > 20, 'France always shows a shipping fee');
assert.ok(!france.free);

const world = quoteShipping({ country: 'OTHER', subtotal: 80, items: [{ name: 'Tee', qty: 1 }] });
assert.ok(world.amount > france.amount - 5);

const parsed = parseQuery('1208 avenue copernic montreal');
assert.strictEqual(parsed.house, '1208');
assert.ok(parsed.streetTokens.includes('copernic'));

const copernicStreet = normalizePhoton({
  properties: {
    type: 'street', name: 'Avenue Copernic', city: 'Montréal', state: 'Québec',
    postcode: 'H1E 4G6', countrycode: 'CA',
  },
  geometry: { coordinates: [-73.59, 45.63] },
});
const wrongHouse = normalizePhoton({
  properties: {
    type: 'house', housenumber: '1208', street: 'Avenue des Canadiens-de-Montréal',
    city: 'Montréal', state: 'Québec', postcode: 'H3B 0G6', countrycode: 'CA',
  },
  geometry: { coordinates: [-73.56, 45.49] },
});
const rightHouse = {
  ...copernicStreet,
  housenumber: '1208',
  line: '1208 Avenue Copernic',
  kind: 'house',
};
const sStreet = scoreCandidate(parsed, { ...copernicStreet });
const sWrong = scoreCandidate(parsed, { ...wrongHouse });
const sRight = scoreCandidate(parsed, { ...rightHouse });
assert.ok(sStreet > sWrong, 'matching Copernic street must beat a random 1208');
assert.ok(sRight >= sStreet, '1208 + Copernic ranks first');

const store = {
  products: [{ id: 'hoodie', name: 'Hoodie MENES', price: 85, active: true, stock: 9 }],
  discounts: [],
  site: { freeShippingThreshold: 150 },
};
const ca = buildTrustedOrder(store, {
  customer: {
    name: 'A', email: 'a@b.com', phone: '5141112222',
    address: '1208 Avenue Copernic', city: 'Montréal', province: 'QC', postal: 'H1E 1V9', country: 'CA',
  },
  items: [{ id: 'hoodie', qty: 1 }],
});
assert.ok(!ca.error, ca.error);
assert.ok(ca.order.shipping > 0);
assert.ok(ca.order.total > ca.order.subtotal);

const fr = buildTrustedOrder(store, {
  customer: {
    name: 'A', email: 'a@b.com', phone: '0611223344',
    address: '10 Rue de Rivoli', city: 'Paris', province: '', postal: '75004', country: 'FR',
  },
  items: [{ id: 'hoodie', qty: 1 }],
});
assert.ok(fr.order.shipping > 0, 'France shipping must appear on the trusted order');
assert.strictEqual(fr.order.tax.amount, 0);

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes('/api/address'));
assert.ok(shopJs.includes('/api/shipping'));
assert.ok(!shopJs.includes('photon.komoot.io/api'));

console.log('ok: address ranking and origin shipping');
