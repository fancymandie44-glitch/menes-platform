'use strict';

const {
  upsertPassportFromOrder,
  upsertPassportFromPaidOrders,
  findPassport,
  clientView,
  tokenMatches,
  publicCode,
  isPaidOrder,
} = require('../lib/passport');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function paidOrder(overrides = {}) {
  return {
    id: overrides.id || 'ORD1',
    status: 'paid',
    total: 129,
    paidAt: '2026-09-08T16:00:00.000Z',
    customer: {
      name: 'Alex Client',
      email: 'alex@example.com',
      phone: '5145550101',
      ...(overrides.customer || {}),
    },
    ...overrides,
  };
}

function run() {
  const store = { orders: [paidOrder()], passports: [] };
  const first = upsertPassportFromOrder(store, store.orders[0]);
  assert(first && first.created, 'first paid order creates passport');
  assert(first.passport.email === 'alex@example.com', 'email stored lowercase');
  assert(first.passport.token && first.passport.token.length >= 24, 'token issued');
  assert(publicCode(first.passport.id).startsWith('MENES-'), 'public code MENES-');
  store.orders[0].items = [
    { id: 'bundle-essentials', name: 'MENES ESSENTIALS', qty: 1, image: '/images/bundles/essentials.jpg', bundle: true },
    { id: 'summer-socks', name: 'MENES Summer Socks', qty: 2, image: '/images/products/socks/black.jpg' },
  ];
  const withItems = upsertPassportFromOrder(store, store.orders[0]);
  assert(withItems.passport.pieces.length === 2, 'passport stores purchased products');
  assert(withItems.passport.pieces.some((p) => p.bundle && p.id === 'bundle-essentials'), 'bundles land in the passport');
  assert(clientView(withItems.passport, { full: true }).pieces.length === 2, 'client sees purchased pieces');
  assert(first.passport.vip === false, 'single order under VIP threshold is not VIP');

  const unpaid = paidOrder({ id: 'PEND', status: 'pending' });
  store.orders.push(unpaid);
  assert(upsertPassportFromOrder(store, unpaid) === null, 'unpaid order does not create passport');
  assert(store.passports.length === 1, 'still one passport');

  store.orders.push(paidOrder({ id: 'ORD2', total: 40, customer: { name: 'Alex Client', email: 'Alex@Example.com' } }));
  const second = upsertPassportFromOrder(store, store.orders[store.orders.length - 1]);
  assert(second && !second.created, 'same email reuses passport');
  assert(second.passport.token === first.passport.token, 'token stays stable');
  assert(second.passport.orderCount === 2, 'counts both paid orders');
  assert(second.passport.vip === true, 'two orders become VIP');
  assert(store.passports.length === 1, 'no duplicate passports');

  const other = upsertPassportFromPaidOrders(
    { orders: [paidOrder({ id: 'Z', customer: { email: 'nobody@x.com', name: 'N' } })], passports: [] },
    'nobody@x.com',
  );
  assert(other && other.created, 'lazy create from paid history');

  const missing = upsertPassportFromPaidOrders({ orders: [], passports: [] }, 'ghost@x.com');
  assert(missing === null, 'no paid history = no passport');

  const found = findPassport(store, 'ALEX@example.com');
  assert(found && found.email === 'alex@example.com', 'lookup is case-insensitive');
  assert(tokenMatches(found, first.passport.token), 'matching token accepted');
  assert(!tokenMatches(found, 'nope'), 'bad token rejected');

  const pub = clientView(found, { full: false });
  assert(pub.email.includes('***'), 'public view masks email');
  assert(!pub.token, 'public view hides token');
  const full = clientView(found, { full: true });
  assert(full.email === 'alex@example.com', 'full view has email');
  assert(full.token === found.token, 'full view has token');

  assert(isPaidOrder({ status: 'shipped' }), 'shipped counts as paid');
  assert(!isPaidOrder({ status: 'awaiting_payment' }), 'awaiting is not paid');

  console.log('ok: passport auto-create from paid email');
}

run();
