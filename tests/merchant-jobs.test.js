'use strict';

const assert = require('assert');
const {
  unpaidOrders,
  reviewOrders,
  markSent,
  UNPAID_AFTER_MS,
  REVIEW_AFTER_MS,
} = require('../lib/merchant-jobs');

const old = Date.now() - UNPAID_AFTER_MS - 1000;
const shipped = Date.now() - REVIEW_AFTER_MS - 1000;

const store = {
  orders: [
    { id: 'A', status: 'awaiting_payment', date: new Date(old).toISOString(), customer: { email: 'a@test.com' } },
    { id: 'B', status: 'awaiting_payment', date: new Date().toISOString(), customer: { email: 'b@test.com' } },
    { id: 'C', status: 'shipped', shippedAt: new Date(shipped).toISOString(), customer: { email: 'c@test.com' }, items: [{ id: 'hoodie' }] },
    { id: 'D', status: 'paid', customer: { email: 'd@test.com' } },
  ],
};

assert.deepStrictEqual(unpaidOrders(store).map((o) => o.id), ['A']);
assert.deepStrictEqual(reviewOrders(store).map((o) => o.id), ['C']);
markSent(store.orders[0], 'reminderSentAt');
assert.strictEqual(unpaidOrders(store).length, 0);
assert.ok(store.orders[0].events[0].type === 'reminder');

console.log('ok: merchant recovery jobs');
