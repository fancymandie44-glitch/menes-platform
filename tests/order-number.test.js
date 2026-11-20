'use strict';

const assert = require('assert');
const { LAST_MANUAL_ORDER, nextOrderNumber, assignOrderNumber, displayOrderNumber } = require('../lib/order-number');

assert.strictEqual(LAST_MANUAL_ORDER, 1202);

const empty = { orders: [] };
assert.strictEqual(nextOrderNumber(empty), 1203);
assert.strictEqual(empty.orderSeq, 1203);
assert.strictEqual(nextOrderNumber(empty), 1204);

const store = { orderSeq: 1202, orders: [] };
const order = { id: 'MCLIENTFAKE', number: 1 };
assignOrderNumber(store, order);
assert.strictEqual(order.number, 1203);
assert.strictEqual(order.id, 'M1203');
assert.strictEqual(displayOrderNumber(order), '1203');
assert.strictEqual(displayOrderNumber({ id: 'M9999' }), '9999');
assert.strictEqual(displayOrderNumber({ id: 'M1ABC' }), 'M1ABC');

const pay = require('fs').readFileSync(require('path').join(__dirname, '../api/pay.js'), 'utf8');
assert.ok(pay.includes('assignOrderNumber'), 'pay assigns sequential numbers server-side');
const checkout = require('fs').readFileSync(require('path').join(__dirname, '../api/create-checkout.js'), 'utf8');
assert.ok(checkout.includes('assignOrderNumber'), 'create-checkout assigns sequential numbers');

console.log('ok: next online order is #1203');
