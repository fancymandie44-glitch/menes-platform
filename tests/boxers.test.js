'use strict';

const fs = require('fs');
const path = require('path');
const { BOXERS, SIZES, UNITS_PER_SIZE, PRICE, upsertInto } = require('../data/boxers');

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

assert(BOXERS.length === 2, 'two boxer products');
assert(BOXERS[0].id === 'menes-grey-boxer' && BOXERS[1].id === 'menes-red-boxer', 'ids');
for (const p of BOXERS) {
  assert(p.active === true, `${p.id} must be published`);
  assert(p.price === PRICE && PRICE > 0, `${p.id} price`);
  assert(p.variants.length === SIZES.length, `${p.id} sizes`);
  assert(p.variants.every((v) => v.stock === UNITS_PER_SIZE), `${p.id} 5 per size`);
  assert(p.stock === SIZES.length * UNITS_PER_SIZE, `${p.id} total stock`);
  assert(p.images.length === 2 && p.image === p.images[0].url, `${p.id} photos`);
}

const merged = upsertInto({ products: [{ id: 'summer-socks', name: 'Socks' }] });
assert(merged.products.length === 3, 'upsert keeps existing products');
assert(merged.products[0].id === 'summer-socks', 'existing first');

console.log('ok: boxers');
