'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { formatCaPostal, formatPostal, mapArcGisCandidate, uniqueSuggestions } = require('../lib/address');
const { buildTrustedOrder } = require('../lib/order-pricing');
const { buildStripeSessionParams, discountCents, cents } = require('../lib/payments');

assert.strictEqual(formatCaPostal('h1e1v9'), 'H1E 1V9');
assert.strictEqual(formatCaPostal('H1E 1V9'), 'H1E 1V9');
assert.strictEqual(formatPostal('h1e1v9', 'CA'), 'H1E 1V9');
assert.strictEqual(formatPostal('75001', 'FR'), '75001');

const copernic = mapArcGisCandidate({
  address: '12086 Avenue Copernic, Montréal, Quebec, H1E 1V9',
  attributes: {
    AddNum: '12086',
    StName: 'Copernic',
    Address: '12086 Av Copernic',
    City: 'Montréal',
    RegionAbbr: 'QC',
    Postal: 'H1E',
    PostalExt: '1V9',
    CountryCode: 'CAN',
    StPreType: 'Av',
    StAddr: '12086 Av Copernic',
  },
});
assert.strictEqual(copernic.line, '12086 Avenue Copernic');
assert.strictEqual(copernic.city, 'Montréal');
assert.strictEqual(copernic.province, 'QC');
assert.strictEqual(copernic.postal, 'H1E 1V9');
assert.strictEqual(copernic.country, 'CA');

const priced = buildTrustedOrder({
  products: [{ id: 'hat', name: 'Hat', price: 100, active: true, stock: 9 }],
  discounts: [{ code: 'SAVE10', active: true, type: 'percent', value: 10 }],
  site: {},
}, {
  customer: {
    name: 'A', email: 'a@b.com', phone: '5141112222',
    address: '12086 Avenue Copernic', city: 'Montréal', province: 'QC', postal: 'h1e1v9', country: 'CA',
  },
  items: [{ id: 'hat', qty: 1 }],
  discountCode: 'SAVE10',
});
assert.ok(!priced.error, priced.error);
assert.strictEqual(priced.order.discount, 10);
assert.strictEqual(priced.order.discountCode, 'SAVE10');
assert.strictEqual(priced.order.customer.postal, 'H1E 1V9');
assert.ok(priced.order.tax.amount > 0);

const params = buildStripeSessionParams(priced.order, { couponId: 'coup_test' });
const body = params.toString();
assert.ok(body.includes('discounts%5B0%5D%5Bcoupon%5D=coup_test') || body.includes('discounts[0][coupon]=coup_test'));
assert.ok(body.includes('line_items'));
assert.strictEqual(discountCents(priced.order), 1000);
assert.strictEqual(cents(10), 1000);

const payJs = fs.readFileSync(path.join(__dirname, '../api/pay.js'), 'utf8');
assert.ok(payJs.includes("case 'card':"));
assert.ok(payJs.includes('stripeCheckout(order, false)'));
assert.ok(!/case 'card':\s*result = await squareCheckout/.test(payJs));

const checkoutJs = fs.readFileSync(path.join(__dirname, '../api/create-checkout.js'), 'utf8');
assert.ok(checkoutJs.indexOf('stripeCheckout') < checkoutJs.indexOf('squareCheckout'));
assert.ok(checkoutJs.includes('result.provider'));

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(html.includes('data-method="stripe"'));
assert.ok(html.includes('id="payMethod" value="stripe"'));
assert.ok(!html.includes('data-method="square"'));
assert.ok(html.includes('viewport-fit=cover'));

const css = fs.readFileSync(path.join(__dirname, '../shop.css'), 'utf8');
assert.ok(css.includes('font-size: 16px'));
assert.ok(css.includes('touch-action: pan-y'));

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes('/api/address'));
assert.ok(shopJs.includes("form.get('method') || 'stripe'"));
assert.ok(shopJs.includes('applyPromoCode(typedPromo'));
assert.ok(shopJs.includes('cart-item-thumb'));

assert.strictEqual(uniqueSuggestions([copernic, copernic]).length, 1);

(async () => {
  const origFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: opts?.body || '' });
    if (String(url).includes('/v1/coupons')) {
      return { ok: true, json: async () => ({ id: 'coup_live' }) };
    }
    if (String(url).includes('/v1/checkout/sessions')) {
      return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/test' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_ux';
  const { stripeCheckout } = require('../lib/payments');
  const paid = await stripeCheckout(priced.order, false);
  global.fetch = origFetch;
  assert.ok(paid.checkoutUrl.includes('checkout.stripe.com'));
  assert.ok(calls.some((c) => c.url.includes('/v1/coupons') && String(c.body).includes('amount_off=1000')));
  assert.ok(calls.some((c) => c.url.includes('/v1/checkout/sessions') && String(c.body).includes('coup_live')));
  console.log('ok: checkout ux, stripe promo, postal format');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
