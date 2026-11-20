'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { publicProduct, publicStockCount, isLowStock, LOW_STOCK_LIMIT } = require('../lib/public-catalog');

assert.strictEqual(LOW_STOCK_LIMIT, 10);
assert.strictEqual(isLowStock(9), true);
assert.strictEqual(isLowStock(10), false);
assert.strictEqual(isLowStock(1), true);
assert.strictEqual(isLowStock(0), false);

assert.strictEqual(publicStockCount(8, { trackedZero: true }), 8);
assert.strictEqual(publicStockCount(10, { trackedZero: true }), 10);
assert.strictEqual(publicStockCount(60, { trackedZero: true }), 10);
assert.strictEqual(publicStockCount(0, { trackedZero: true }), 0);
assert.strictEqual(publicStockCount(0, { trackedZero: false }), null);

const hat = publicProduct({
  id: 'hat',
  name: 'Hat',
  price: 89,
  active: true,
  stock: 9,
  variants: [
    { key: 'brown', label: 'Brown', options: { Couleur: 'Brown' }, stock: 3 },
    { key: 'black', label: 'Black', options: { Couleur: 'Black' }, stock: 3 },
    { key: 'orange', label: 'Orange', options: { Couleur: 'Orange' }, stock: 3 },
  ],
});
assert.strictEqual(hat.stock, 9);
assert.strictEqual(hat.variants[0].stock, 3);

const hoodie = publicProduct({
  id: 'hoodie',
  name: 'Hoodie',
  price: 129,
  active: true,
  stock: 60,
  variants: [
    { key: 's', options: { Taille: 'S' }, stock: 10 },
    { key: 'm', options: { Taille: 'M' }, stock: 10 },
  ],
});
assert.strictEqual(hoodie.stock, 10, '10+ warehouse stock is capped');
assert.strictEqual(hoodie.variants[0].stock, 10);

const socks = publicProduct({
  id: 'socks',
  name: 'Socks',
  price: 15,
  active: true,
  stock: 50,
});
assert.strictEqual(socks.stock, 10);

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes('const LOW_STOCK_LIMIT = 10'));
assert.ok(shopJs.includes('function isLowStock'));
assert.ok(shopJs.includes('function cardRemaining'));
assert.ok(shopJs.includes('product-stock-left'));
assert.ok(shopJs.includes("tFill('stock_left'"));

console.log('ok: public low-stock catalog');
