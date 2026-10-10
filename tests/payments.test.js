'use strict';

const assert = require('assert');
const { buildTrustedOrder } = require('../lib/order-pricing');
const { buildProviderLines, stripeCheckout, squareCheckout } = require('../lib/payments');

async function run() {
  const store = {
    products: [{ id: 'hoodie', name: 'Hoodie MENES', price: 100, active: true, stock: 9 }],
    discounts: [{ code: 'JONATHAN10', active: true, type: 'percent', value: 10 }],
    site: {},
  };
  const raw = {
    customer: {
      name: 'Ada Lovelace',
      email: 'ada@menes.test',
      phone: '5145550101',
      address: '12 rue Saint-Denis',
      city: 'Montreal',
      province: 'QC',
      postal: 'H2X1Y1',
      country: 'CA',
    },
    items: [{ id: 'hoodie', qty: 1 }],
    discountCode: 'JONATHAN10',
  };
  const priced = buildTrustedOrder(store, raw);
  assert.ok(!priced.error, priced.error);
  assert.strictEqual(priced.order.discount, 10);
  assert.ok(priced.order.total < 100 + priced.order.tax.amount, 'promo must lower the MENES total');

  const lines = buildProviderLines(priced.order);
  assert.strictEqual(lines.promo, 'JONATHAN10');
  assert.strictEqual(lines.lines[0].unitCents, 9000, 'Stripe/Square unit must include the promo');
  const charged = lines.lines.reduce((s, l) => s + l.unitCents * l.qty, 0) + lines.taxCents;
  assert.strictEqual(charged, Math.round(priced.order.total * 100), 'provider charge must match trusted total');

  const viaPromoField = buildTrustedOrder(store, { ...raw, discountCode: '', promoCode: 'JONATHAN10' });
  assert.strictEqual(viaPromoField.order.discount, 10, 'promoCode alias must apply');

  process.env.STRIPE_SECRET_KEY = 'sk_test_menes';
  const stripeCalls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    stripeCalls.push({ url, body: String(opts.body || '') });
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/test' }) };
  };
  const stripe = await stripeCheckout(priced.order);
  assert.ok(stripe.checkoutUrl.includes('stripe.com'));
  const body = stripeCalls[0].body;
  assert.ok(body.includes('customer_email=ada%40menes.test'), 'email is prefilled');
  assert.ok(!body.includes('shipping_address_collection'), 'do not re-ask shipping on Stripe');
  assert.ok(body.includes('payment_intent_data%5Bshipping%5D%5Baddress%5D%5Bline1%5D'), 'shipping already captured is sent to Stripe');
  assert.ok(body.includes('unit_amount%5D=9000'), 'discounted amount is charged');
  assert.ok(body.includes('JONATHAN10'), 'promo is visible on the Stripe line');

  process.env.SQUARE_ACCESS_TOKEN = 'sq_test';
  process.env.SQUARE_LOCATION_ID = 'LTEST';
  const squareBodies = [];
  global.fetch = async (url, opts) => {
    squareBodies.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ payment_link: { url: 'https://square.link/u/test' } }) };
  };
  const square = await squareCheckout(priced.order);
  global.fetch = origFetch;
  assert.ok(square.checkoutUrl.includes('square.link'));
  const payload = squareBodies[0];
  assert.strictEqual(payload.checkout_options.ask_for_shipping_address, false, 'Square must not re-collect shipping');
  assert.strictEqual(payload.order.line_items[0].base_price_money.amount, 9000);
  assert.ok(String(payload.order.line_items[0].name).includes('JONATHAN10'));

  console.log('ok: promo and customer details survive Stripe (and Square fallback)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
