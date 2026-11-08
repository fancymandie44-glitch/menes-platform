'use strict';

const fs = require('fs');
const path = require('path');
const {
  BOXER, BOXERS, COLORS, SIZES, UNITS_PER_VARIANT, PRICE, RETIRED_IDS, upsertInto,
} = require('../data/boxers');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ROOT = path.resolve(__dirname, '..');
for (const file of [
  'images/products/boxers/grey.jpg',
  'images/products/boxers/grey-worn.jpg',
  'images/products/boxers/red.jpg',
  'images/products/boxers/red-worn.jpg',
]) {
  const full = path.join(ROOT, file);
  assert(fs.existsSync(full), `missing ${file}`);
  assert(fs.statSync(full).size > 1000, `tiny ${file}`);
}

assert(BOXERS.length === 1 && BOXERS[0].id === 'menes-boxer', 'single MENES Boxer product');
assert(BOXER.name === 'MENES Boxer', 'name');
assert(BOXER.options[0].name === 'Color' && BOXER.options[0].values.join(',') === 'Red,Grey', 'color first');
assert(BOXER.options[1].name === 'Size' && BOXER.options[1].values.join(',') === 'S,M,L,XL', 'sizes after color');
assert(BOXER.price === PRICE && PRICE > 0, 'price');
assert(BOXER.variants.length === COLORS.length * SIZES.length, '8 color/size variants');
assert(BOXER.variants.every((v) => v.stock === UNITS_PER_VARIANT), '5 of each size/color');
const greyUnits = BOXER.variants.filter((v) => v.options.Color === 'Grey').reduce((s, v) => s + v.stock, 0);
const redUnits = BOXER.variants.filter((v) => v.options.Color === 'Red').reduce((s, v) => s + v.stock, 0);
assert(greyUnits === 20, 'Grey is 5 x 4 sizes, not 5 total');
assert(redUnits === 20, 'Red is 5 x 4 sizes, not 5 total');
assert(BOXER.variants.some((v) => v.key === 'Color=Red|Size=S'), 'variant key order');
assert(BOXER.images[0].label === 'Red' && BOXER.images[1].label === 'Grey', 'pack shots labeled for color chips');

const merged = upsertInto({
  products: [
    { id: 'summer-socks', name: 'Socks' },
    { id: 'menes-grey-boxer', name: 'old grey' },
    { id: 'menes-red-boxer', name: 'old red' },
  ],
});
assert(merged.products.some((p) => p.id === 'summer-socks'), 'keeps other products');
assert(merged.products.filter((p) => p.id === 'menes-boxer').length === 1, 'one boxer');
assert(merged.products.every((p) => !RETIRED_IDS.includes(p.id)), 'retired split SKUs');

console.log('ok: boxers');
