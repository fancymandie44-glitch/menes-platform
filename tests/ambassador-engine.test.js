/**
 * Lightweight unit checks for ambassador commission engine (no Netlify required).
 * Run: node tests/ambassador-engine.test.js
 */

const { processPaidOrder, reverseCommissionsForOrder, matureCommissions } = require('../lib/ambassador-engine');
const { defaultProgram } = require('../lib/ambassador-data');
const { hashPassword } = require('../lib/ambassador-auth');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeAmb(id, opts = {}) {
  const { salt, hash } = hashPassword('password123');
  return {
    id,
    email: opts.email || `${id}@test.com`,
    passwordSalt: salt,
    passwordHash: hash,
    displayName: id,
    slug: id,
    promoCode: opts.promoCode || `${id.toUpperCase()}10`,
    status: 'active',
    role: 'AMBASSADOR',
    rankId: 'ambassador',
    xp: 0,
    referredBy: opts.referredBy || null,
    stats: {
      personalSales: 0, personalOrders: 0, personalCommission: 0,
      teamBonus: 0, totalEarned: 0, monthlySales: {}, conversionClicks: 0,
    },
    badges: [],
  };
}

function run() {
  const program = defaultProgram();
  program.settings.pendingDays = 0;
  program.ambassadors.push(makeAmb('jon'));
  program.ambassadors.push(makeAmb('kev', { referredBy: 'jon' }));
  program.ambassadors.push(makeAmb('sarah', { referredBy: 'kev' }));

  const order = {
    id: 'MTEST1',
    subtotal: 1000,
    total: 1149.75,
    tax: { amount: 149.75 },
    discountCode: 'SARAH10',
    customer: { email: 'buyer@example.com', name: 'Buyer' },
    items: [{ name: 'Boxer', qty: 1 }],
  };

  const r1 = processPaidOrder(program, order);
  assert(r1.created.length === 3, `expected 3 commissions, got ${r1.created.length}`);
  assert(r1.created.some((c) => c.type === 'personal' && c.amount === 100), 'personal 10%');
  assert(r1.created.some((c) => c.type === 'referral_l1' && c.amount === 20), 'l1 2%');
  assert(r1.created.some((c) => c.type === 'referral_l2' && c.amount === 10), 'l2 1%');

  const r2 = processPaidOrder(program, order);
  assert(r2.skipped && r2.reason === 'already_processed', 'idempotent');

  // self referral
  const selfOrder = {
    id: 'MSELF',
    subtotal: 100,
    total: 100,
    discountCode: 'JON10',
    customer: { email: 'jon@test.com' },
    items: [],
  };
  const rs = processPaidOrder(program, selfOrder);
  assert(rs.skipped && rs.reason === 'self_referral', 'self referral blocked');
  assert(program.fraudFlags.length >= 1, 'fraud flag');

  matureCommissions(program, Date.now() + 1000);
  assert(program.commissions.filter((c) => c.orderId === 'MTEST1').every((c) => c.status === 'available'), 'matured');

  reverseCommissionsForOrder(program, 'MTEST1', 'refund');
  assert(program.commissions.filter((c) => c.orderId === 'MTEST1').every((c) => c.status === 'reversed'), 'reversed');

  console.log('OK — ambassador engine tests passed');
}

run();
