'use strict';

const assert = require('assert');
const { quoteShipping, ORIGIN } = require('../lib/shipping');
const { quoteTax } = require('../lib/tax');
const {
  parseQuery, scoreCandidate, normalizePhoton, normalizeArcGIS, formatCaPostal, houseRelation,
} = require('../lib/address-search');
const { buildTrustedOrder } = require('../lib/order-pricing');
const fs = require('fs');
const path = require('path');

assert.strictEqual(ORIGIN.postal, 'H1E 1M0');
assert.strictEqual(formatCaPostal('H1E', '1V9'), 'H1E 1V9');
assert.strictEqual(formatCaPostal('H1E 4G6'), 'H1E 4G6');

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

const parsed = parseQuery('12086 avenue copernic montreal');
assert.strictEqual(parsed.house, '12086');
assert.ok(parsed.streetTokens.includes('copernic'));
assert.strictEqual(houseRelation('1208', '12086'), 'prefix');
assert.strictEqual(houseRelation('12086', '12086'), 'exact');

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
const osmWrongZip = normalizePhoton({
  properties: {
    type: 'house', housenumber: '12086', street: 'Avenue Copernic',
    city: 'Montréal', state: 'Québec', postcode: 'H1E 4G6', countrycode: 'CA',
  },
  geometry: { coordinates: [-73.59, 45.63] },
});
const arcgisRight = normalizeArcGIS({
  attributes: {
    AddNum: '12086',
    StPreType: 'Av',
    StName: 'Copernic',
    City: 'Montreal',
    RegionAbbr: 'QC',
    Postal: 'H1E',
    PostalExt: '1V9',
    Country: 'CAN',
    Addr_type: 'PointAddress',
    ShortLabel: '12086 Av Copernic',
  },
});
assert.strictEqual(arcgisRight.postal, 'H1E 1V9');
assert.strictEqual(arcgisRight.country, 'CA');
assert.strictEqual(arcgisRight.city, 'Montréal');
assert.strictEqual(arcgisRight.housenumber, '12086');
assert.match(arcgisRight.street, /Copernic/);
assert.match(arcgisRight.line, /12086/);

const streetCopy = { ...copernicStreet };
const sStreet = scoreCandidate(parsed, streetCopy, 'CA');
assert.ok(!streetCopy.housenumber, 'must not invent a civic number on a street-only hit');
const sWrong = scoreCandidate(parsed, { ...wrongHouse }, 'CA');
const sOsm = scoreCandidate(parsed, { ...osmWrongZip }, 'CA');
const sArcgis = scoreCandidate(parsed, { ...arcgisRight }, 'CA');
assert.ok(sStreet > sWrong, 'matching Copernic street must beat a random 1208');
assert.ok(sOsm > sStreet, '12086 Copernic ranks above the street');
assert.ok(sArcgis >= sOsm, 'ArcGIS H1E 1V9 ranks at or above OSM H1E 4G6');

const prefixParsed = parseQuery('1208 avenue copernic montreal');
const sPrefixRight = scoreCandidate(prefixParsed, { ...arcgisRight }, 'CA');
const sPrefixWrong = scoreCandidate(prefixParsed, { ...wrongHouse }, 'CA');
assert.ok(sPrefixRight > sPrefixWrong, '1208 on Copernic should complete toward 12086, not a downtown 1208');

const store = {
  products: [{ id: 'hoodie', name: 'Hoodie MENES', price: 85, active: true, stock: 9 }],
  discounts: [],
  site: { freeShippingThreshold: 150 },
};
const ca = buildTrustedOrder(store, {
  customer: {
    name: 'A', email: 'a@b.com', phone: '5141112222',
    address: '12086 Avenue Copernic', city: 'Montréal', province: 'QC', postal: 'H1E 1V9', country: 'CA',
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
assert.ok(fr.order.tax.amount > 0, 'France must collect TVA 20%');
assert.match(fr.order.tax.label, /TVA 20%/);
assert.strictEqual(
  fr.order.tax.amount,
  Math.round((fr.order.subtotal - fr.order.discount + fr.order.shipping) * 0.20 * 100) / 100,
);

const frVat = quoteTax({ country: 'FR', amount: 100 });
assert.strictEqual(frVat.amount, 20);
assert.strictEqual(quoteTax({ country: 'BE', amount: 100 }).amount, 21);
assert.strictEqual(quoteTax({ country: 'US', amount: 100 }).amount, 0);
assert.ok(quoteTax({ country: 'CA', province: 'QC', amount: 100 }).amount > 14);

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes('/api/address'));
assert.ok(shopJs.includes('/api/shipping'));
assert.ok(!shopJs.includes('photon.komoot.io/api'));
assert.ok(shopJs.includes("FR: { rate: 20"));
assert.ok(shopJs.includes('TVA 20%'));
const searchSrc = fs.readFileSync(path.join(__dirname, '../lib/address-search.js'), 'utf8');
assert.ok(searchSrc.includes('geocode.arcgis.com'));
assert.ok(searchSrc.includes('PostalExt'));

console.log('ok: address ranking and origin shipping');
