'use strict';

const assert = require('assert');
const {
  computeShipping,
  upsertCustomerFromOrder,
  isLowStock,
  productStockTotal,
  applyFulfillment,
} = require('../lib/admin-ops');
const { buildTrustedOrder, decrementStockForOrder, restockStockForOrder } = require('../lib/order-pricing');

function storeFixture() {
  return {
    site: {
      freeShippingThreshold: 150,
      shippingRates: [
        { name: 'Standard', price: 12, minCart: 0, countries: 'CA', active: true },
      ],
    },
    products: [
      {
        id: 'hoodie',
        name: 'Hoodie',
        price: 90,
        active: true,
        stock: 4,
        variants: [],
      },
    ],
    customers: [],
    discounts: [],
  };
}

{
  const s = storeFixture();
  assert.strictEqual(computeShipping(s, { country: 'CA' }, 40), 12, 'below threshold uses rate');
  assert.strictEqual(computeShipping(s, { country: 'CA' }, 150), 0, 'threshold unlocks free shipping');
  assert.strictEqual(computeShipping({ site: {} }, { country: 'CA' }, 40), 0, 'no rates stay free');
}

{
  const s = storeFixture();
  const built = buildTrustedOrder(s, {
    customer: { name: 'A', email: 'a@test.com', phone: '514', address: '1 rue', city: 'Mtl', province: 'QC', postal: 'H2X1A1', country: 'CA' },
    items: [{ id: 'hoodie', qty: 1 }],
  });
  assert.ok(built.order, built.error);
  assert.strictEqual(built.order.shipping, 12);
  assert.ok(built.order.total > 90);
}

{
  const s = storeFixture();
  const order = {
    id: 'M1',
    customer: { name: 'Don', email: 'don@test.com', phone: '1', address: 'x' },
    items: [{ id: 'hoodie', qty: 2, size: '—' }],
  };
  assert.strictEqual(decrementStockForOrder(s, order), true);
  assert.strictEqual(s.products[0].stock, 2);
  assert.strictEqual(restockStockForOrder(s, order), true);
  assert.strictEqual(s.products[0].stock, 4);
  assert.strictEqual(restockStockForOrder(s, order), false, 'restock is idempotent');
}

{
  const s = storeFixture();
  const row = upsertCustomerFromOrder(s, {
    id: 'M2',
    date: '2026-09-10T00:00:00.000Z',
    customer: { name: 'Don', email: 'DON@test.com', phone: '514' },
  });
  assert.strictEqual(row.email, 'don@test.com');
  assert.strictEqual(s.customers.length, 1);
  upsertCustomerFromOrder(s, {
    id: 'M3',
    customer: { name: 'Don D', email: 'don@test.com', phone: '515' },
  });
  assert.strictEqual(s.customers.length, 1);
  assert.strictEqual(s.customers[0].name, 'Don D');
}

{
  assert.strictEqual(productStockTotal({ stock: 4, variants: [] }), 4);
  assert.ok(isLowStock({ active: true, stock: 3, variants: [] }));
  assert.ok(!isLowStock({ active: true, stock: 20, variants: [] }));
}

{
  const order = { status: 'paid' };
  applyFulfillment(order, { trackingNumber: 'AB123', carrier: 'Canada Post', status: 'shipped' });
  assert.strictEqual(order.trackingNumber, 'AB123');
  assert.strictEqual(order.status, 'shipped');
  assert.ok(order.events.length);
}

const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../shop.css'), 'utf8');
assert.match(css, /--control-border:\s*#8a7f6c/, 'cart controls need a visible border token');
assert.match(css, /\.cart-qty-btn[\s\S]*border:\s*1px solid var\(--control-border\)/, 'qty buttons must not use invisible hairline');
assert.doesNotMatch(css, /--hairline:\s*#2a2a2a/, 'hairline must not stay near-black on near-black');
assert.match(css, /\.cart-item-name[\s\S]*color:\s*var\(--white\)/, 'cart names must be cream on dark');

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.match(shopJs, /cart-item-thumb/, 'cart rows include product thumbs');
assert.match(shopJs, /function shopComputeShipping/, 'checkout shipping matches admin rates');

const consoleJs = fs.readFileSync(path.join(__dirname, '../console.js'), 'utf8');
assert.match(consoleJs, /function renderInventory/, 'admin has inventory tab');
assert.match(consoleJs, /refundOrder/, 'admin can refund + restock');
assert.match(consoleJs, /saveOrderFulfillment/, 'admin can save tracking');

const consoleHtml = fs.readFileSync(path.join(__dirname, '../console.html'), 'utf8');
assert.match(consoleHtml, /id="tab-inventory"/);
assert.match(consoleHtml, /id="orderSearch"/);
assert.match(consoleHtml, /id="shipThresholdInput"/);
assert.match(consoleHtml, /data-tab="inventory"/);

console.log('ok: admin ops, shipping, restock, cart contrast');
