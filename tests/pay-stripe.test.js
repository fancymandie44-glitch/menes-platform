'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pay = fs.readFileSync(path.join(__dirname, '../api/pay.js'), 'utf8');
assert.ok(pay.includes("case 'stripe':"), 'pay API handles stripe');
assert.ok(pay.includes('stripeCheckout(order, false)'), 'card checkout uses Stripe');
assert.ok(!pay.includes('squareCheckout'), 'card checkout must not call Square');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(html.includes('data-method="stripe"'), 'card button posts stripe');
assert.ok(html.includes('id="payMethod" value="stripe"'), 'hidden method defaults to stripe');
assert.ok(!html.includes('data-method="square"'), 'checkout UI must not select Square');

const shop = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shop.includes("form.get('method') || 'stripe'"), 'checkout submit defaults to stripe');
assert.ok(shop.includes("params.get('method') || 'stripe'"), 'return URL defaults to stripe');

const checkout = fs.readFileSync(path.join(__dirname, '../api/create-checkout.js'), 'utf8');
assert.ok(checkout.includes('stripeCheckout(order, false)'), 'legacy checkout endpoint uses Stripe first');
assert.ok(!checkout.includes('squareCheckout'), 'legacy checkout endpoint must not call Square');

console.log('ok: card checkout is Stripe');
