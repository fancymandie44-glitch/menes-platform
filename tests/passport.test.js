'use strict';

const {
  upsertPassportFromOrder,
  upsertPassportFromPaidOrders,
  ensurePassportFromEmail,
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
  assert(missing === null, 'paid-history helper still requires a paid order');

  const walkIn = { orders: [], passports: [], subscribers: [] };
  const claimed = ensurePassportFromEmail(walkIn, 'new@mymenes.com', { source: 'entry', locale: 'en' });
  assert(claimed && claimed.created, 'entry email creates a passport without an order');
  assert(claimed.passport.email === 'new@mymenes.com', 'walk-in email stored');
  assert(claimed.passport.orderCount === 0, 'walk-in passport has no orders yet');
  assert(walkIn.subscribers.length === 1, 'walk-in email joins the list');
  assert(walkIn.subscribers[0].consent === true, 'walk-in consents to email');
  assert(walkIn.subscribers[0].tags.includes('nouveautes'), 'walk-in is on the new-drop list');
  const claimedAgain = ensurePassportFromEmail(walkIn, 'NEW@mymenes.com', { source: 'entry' });
  assert(claimedAgain && !claimedAgain.created, 'same email reuses the walk-in passport');
  assert(walkIn.passports.length === 1, 'no duplicate walk-in passports');
  assert(walkIn.subscribers.length === 1, 'no duplicate subscribers');

  walkIn.orders.push(paidOrder({ customer: { email: 'new@mymenes.com', name: 'Sam' }, total: 34.99 }));
  const afterBuy = upsertPassportFromOrder(walkIn, walkIn.orders[0]);
  assert(afterBuy && !afterBuy.created, 'later purchase attaches to the existing passport');
  assert(afterBuy.passport.token === claimed.passport.token, 'walk-in token stays stable after purchase');
  assert(afterBuy.passport.orderCount === 1, 'purchase counts on walk-in passport');

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

  const { buildPassportWelcomeHtml, passportOpenUrl, buildCustomerReceiptHtml } = require('../lib/notify');
  const link = passportOpenUrl('a@b.com', 'secret-token');
  assert(link.includes('pass=1'), 'passport email link opens the shop');
  assert(link.includes('e=a%40b.com') || link.includes('e=a@b.com'), 'passport email link carries email');
  const welcome = buildPassportWelcomeHtml({ id: 'ff1122aabbcc', email: 'a@b.com', token: 'secret-token' }, 'en');
  assert(welcome.includes('Open my passport'), 'welcome email has passport CTA');
  assert(welcome.includes('secret-token'), 'welcome email has magic token');
  const receipt = buildCustomerReceiptHtml(
    { id: 'ORD9', customer: { email: 'a@b.com', name: 'A' }, items: [], total: 10 },
    'card',
    { code: 'MENES-AABBCC', token: 'secret-token' },
  );
  assert(receipt.includes('Ouvrir mon passeport'), 'order receipt links the passport');

  const { segmentEmails } = require('../api/campaigns');
  const audience = segmentEmails({
    subscribers: [],
    passports: [{ email: 'pass@mymenes.com' }],
    orders: [],
  }, 'subscribers');
  assert(audience.includes('pass@mymenes.com'), 'drop campaigns include passport emails');

  console.log('ok: passport auto-create from paid email and walk-in claim');
}

run();
