/**
 * Expanded ambassador engine + auth regression tests.
 * Run: node tests/ambassador-qa.test.js
 */

const { processPaidOrder, reverseCommissionsForOrder, matureCommissions, resolveAttribution, teamStats, leaderboard, sanitizeOrderForAmbassador } = require('../lib/ambassador-engine');
const { defaultProgram, slugify, uid } = require('../lib/ambassador-data');
const { hashPassword, verifyPassword, signToken, verifyToken, publicAmbassador } = require('../lib/ambassador-auth');
const { buildTrustedOrder } = require('../lib/order-pricing');

let passed = 0;
let failed = 0;
const errors = [];

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    errors.push(msg);
    console.error('FAIL:', msg);
  } else {
    passed += 1;
  }
}

function makeAmb(id, opts = {}) {
  const { salt, hash } = hashPassword(opts.password || 'password123');
  return {
    id,
    email: opts.email || `${id}@test.com`,
    passwordSalt: salt,
    passwordHash: hash,
    displayName: id,
    slug: opts.slug || id,
    promoCode: opts.promoCode || `${String(id).toUpperCase()}10`,
    status: opts.status || 'active',
    role: 'AMBASSADOR',
    rankId: 'ambassador',
    xp: 0,
    referredBy: opts.referredBy || null,
    discountPercent: 10,
    stats: {
      personalSales: 0, personalOrders: 0, personalCommission: 0,
      teamBonus: 0, totalEarned: 0, monthlySales: {}, conversionClicks: 0,
    },
    badges: [],
  };
}

function section(name) {
  console.log(`\n== ${name} ==`);
}

section('Auth');
{
  const { salt, hash } = hashPassword('Secret123!');
  assert(verifyPassword('Secret123!', salt, hash), 'password verifies');
  assert(!verifyPassword('wrong', salt, hash), 'wrong password rejected');
  const token = signToken({ aid: 'amb_1', role: 'AMBASSADOR' }, 1);
  const v = verifyToken(token);
  assert(v.ok && v.payload.aid === 'amb_1', 'token valid');
  assert(!verifyToken('bad.token').ok, 'bad token rejected');
  assert(!verifyToken('').ok, 'empty token rejected');
}

section('Slugify / uid');
{
  assert(slugify('Jonathan Élite!') === 'jonathan-elite', 'slugify accents');
  assert(uid('amb').startsWith('amb_'), 'uid prefix');
}

section('Personal commission — first ambassador (no referrer)');
{
  const program = defaultProgram();
  program.ambassadors.push(makeAmb('founder'));
  const order = {
    id: 'O1',
    subtotal: 200,
    total: 230,
    tax: { amount: 30 },
    discountCode: 'FOUNDER10',
    customer: { email: 'c@x.com' },
    items: [{ name: 'Tee', qty: 1 }],
  };
  const r = processPaidOrder(program, order);
  assert(!r.skipped, 'founder sale not skipped');
  assert(r.created.length === 1, `founder gets 1 commission, got ${r.created.length}`);
  assert(r.created[0].amount === 20, `10% of 200 = 20, got ${r.created[0].amount}`);
  assert(r.created[0].type === 'personal', 'personal type');
}

section('Invite chain L1 + L2');
{
  const program = defaultProgram();
  program.ambassadors.push(makeAmb('a'));
  program.ambassadors.push(makeAmb('b', { referredBy: 'a' }));
  program.ambassadors.push(makeAmb('c', { referredBy: 'b' }));
  const order = {
    id: 'O2',
    subtotal: 1000,
    discountCode: 'C10',
    customer: { email: 'buyer@x.com' },
    items: [],
  };
  const r = processPaidOrder(program, order);
  assert(r.created.length === 3, `3 commissions, got ${r.created.length}`);
  assert(r.created.find((x) => x.type === 'personal').ambassadorId === 'c', 'personal to c');
  assert(r.created.find((x) => x.type === 'referral_l1').ambassadorId === 'b', 'l1 to b');
  assert(r.created.find((x) => x.type === 'referral_l2').ambassadorId === 'a', 'l2 to a (first inviter)');
}

section('Idempotency');
{
  const program = defaultProgram();
  program.ambassadors.push(makeAmb('jon', { promoCode: 'JON10' }));
  const order = { id: 'IDEMP', subtotal: 50, discountCode: 'JON10', customer: { email: 'x@y.com' }, items: [] };
  processPaidOrder(program, order);
  const r2 = processPaidOrder(program, order);
  assert(r2.skipped && r2.reason === 'already_processed', 'duplicate blocked');
  assert(program.commissions.filter((c) => c.orderId === 'IDEMP').length === 1, 'only one commission row');
}

section('Self-referral fraud');
{
  const program = defaultProgram();
  program.ambassadors.push(makeAmb('self', { email: 'self@test.com', promoCode: 'SELF10' }));
  const r = processPaidOrder(program, {
    id: 'SF1', subtotal: 100, discountCode: 'SELF10',
    customer: { email: 'self@test.com' }, items: [],
  });
  assert(r.skipped && r.reason === 'self_referral', 'self referral blocked');
  assert(program.fraudFlags.length === 1, 'fraud flagged');
}

section('Inactive ambassador');
{
  const program = defaultProgram();
  program.ambassadors.push(makeAmb('sus', { status: 'suspended', promoCode: 'SUS10' }));
  const r = processPaidOrder(program, {
    id: 'IN1', subtotal: 100, discountCode: 'SUS10',
    customer: { email: 'ok@test.com' }, items: [],
  });
  // Suspended codes resolve as no attribution (do not leak account status)
  assert(r.skipped && (r.reason === 'ambassador_inactive' || r.reason === 'no_attribution'), 'suspended blocked');
}

section('Link attribution window');
{
  const program = defaultProgram();
  program.settings.attributionDays = 30;
  program.ambassadors.push(makeAmb('link', { promoCode: 'LINK99' }));
  const fresh = {
    id: 'L1', subtotal: 100,
    attribution: {
      ambassadorId: 'link', method: 'ambassador_link',
      clickedAt: new Date().toISOString(),
    },
    customer: { email: 'z@z.com' }, items: [],
  };
  const r1 = processPaidOrder(program, fresh);
  assert(!r1.skipped, 'fresh link attributed');

  const expired = {
    id: 'L2', subtotal: 100,
    attribution: {
      ambassadorId: 'link', method: 'ambassador_link',
      clickedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    },
    customer: { email: 'z2@z.com' }, items: [],
  };
  const r2 = processPaidOrder(program, expired);
  assert(r2.skipped && r2.reason === 'no_attribution', 'expired link ignored');
}

section('Refund reverse');
{
  const program = defaultProgram();
  program.settings.pendingDays = 0;
  program.ambassadors.push(makeAmb('ref', { promoCode: 'REF10' }));
  processPaidOrder(program, {
    id: 'RF1', subtotal: 100, discountCode: 'REF10',
    customer: { email: 'b@b.com' }, items: [],
  });
  matureCommissions(program, Date.now() + 5000);
  assert(program.commissions[0].status === 'available', 'matured to available');
  reverseCommissionsForOrder(program, 'RF1', 'refund');
  assert(program.commissions[0].status === 'reversed', 'reversed on refund');
}

section('Configurable rates');
{
  const program = defaultProgram();
  program.settings.personalCommission = 15;
  program.settings.referralLevel1 = 3;
  program.settings.referralLevel2 = 1.5;
  program.settings.levels = [{ id: 'ambassador', name: 'A', minSales: 0, commission: 15, order: 1 }];
  program.ambassadors.push(makeAmb('p'));
  program.ambassadors.push(makeAmb('q', { referredBy: 'p', promoCode: 'Q10' }));
  const r = processPaidOrder(program, {
    id: 'CFG1', subtotal: 1000, discountCode: 'Q10',
    customer: { email: 'c@c.com' }, items: [],
  });
  assert(r.created.find((c) => c.type === 'personal').amount === 150, '15% personal');
  assert(r.created.find((c) => c.type === 'referral_l1').amount === 30, '3% l1');
}

section('Team + leaderboard privacy shape');
{
  const program = defaultProgram();
  program.ambassadors.push(makeAmb('root'));
  program.ambassadors.push(makeAmb('child', { referredBy: 'root' }));
  program.ambassadors[1].stats.personalSales = 500;
  const stats = teamStats(program, 'root');
  assert(stats.direct === 1, '1 direct');
  const board = leaderboard(program, 5);
  assert(Array.isArray(board), 'leaderboard array');
}

section('Sanitize order — no customer PII');
{
  const safe = sanitizeOrderForAmbassador({
    id: 'X',
    customer: { name: 'Secret', email: 'secret@x.com', address: '123' },
    items: [{ name: 'Boxer', qty: 1, size: 'M' }],
    total: 85,
    subtotal: 75,
    commissionAmount: 7.5,
    commissionStatus: 'pending',
  }, null);
  assert(!safe.customer, 'no customer object exposed');
  assert(safe.items[0].name === 'Boxer', 'product name kept');
}

section('Order pricing keeps attribution');
{
  const store = {
    products: [{ id: 'p1', name: 'Tee', price: 50, active: true, sizes: ['M'] }],
    discounts: [{ code: 'AMB10', type: 'percent', value: 10, active: true, ambassadorId: 'amb_x' }],
    site: { freeShippingThreshold: 150 },
  };
  const priced = buildTrustedOrder(store, {
    customer: {
      name: 'Test', email: 't@t.com', phone: '514', address: '1 rue',
      city: 'MTL', province: 'QC', postal: 'H1A1A1', country: 'CA',
    },
    items: [{ id: 'p1', qty: 1, size: 'M' }],
    discountCode: 'AMB10',
    attribution: {
      ambassadorId: 'amb_x', slug: 'test', method: 'ambassador_link',
      clickedAt: new Date().toISOString(),
    },
  });
  assert(!priced.error, `pricing ok: ${priced.error || ''}`);
  assert(priced.order.ambassadorId === 'amb_x', 'ambassadorId on order');
  assert(priced.order.attribution?.ambassadorId === 'amb_x', 'attribution kept');
  assert(priced.order.discountCode === 'AMB10', 'discount applied');
}

section('publicAmbassador strips secrets');
{
  const a = makeAmb('priv');
  a.passwordHash = 'secret';
  const pub = publicAmbassador(a);
  assert(!pub.passwordHash && !pub.passwordSalt, 'no password in public');
  const priv = publicAmbassador(a, { private: true });
  assert(priv.email === a.email, 'private includes email');
  assert(!priv.passwordHash, 'still no hash');
}

console.log(`\n——————\n${passed} passed, ${failed} failed`);
if (failed) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK — QA suite passed');
