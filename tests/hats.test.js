'use strict';

const fs = require('fs');
const path = require('path');
const { CAMO_HAT, PRICE, upsertInto } = require('../data/hats');
const bundles = require('../data/bundles.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const img = path.join(__dirname, '../images/products/hats/camo.jpg');
assert(fs.existsSync(img), 'missing camo hat photo');
assert(fs.statSync(img).size > 1000, 'tiny camo photo');

assert(CAMO_HAT.id === 'menes-camo-trucker-hat', 'id');
assert(CAMO_HAT.name === 'MENES Camo Trucker Hat', 'name');
assert(CAMO_HAT.price === PRICE && PRICE === 99.99, 'same price as Kultur hat');
assert(CAMO_HAT.price === bundles.UNIT_PRICES.capKultur, 'bundle math uses this hat price');
assert(CAMO_HAT.price === bundles.UNIT_PRICES.capCamo, 'capCamo alias');
assert(CAMO_HAT.image.includes('/images/products/hats/camo.jpg'), 'pack shot');

const merged = upsertInto({
  products: [{ id: 'menes-kltr-trucker-hat', name: 'MENES KLTR Trucker Hat', price: 99.99 }],
});
assert(merged.products.some((p) => p.id === 'menes-kltr-trucker-hat'), 'keeps kultur hat');
assert(merged.products.filter((p) => p.id === CAMO_HAT.id).length === 1, 'one camo hat');

console.log('ok: hats');
