'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  hashSecret,
  verifySecret,
  createResetToken,
  resetTokenMatches,
  normalizeEmail,
  isEmail,
  passwordStrongEnough,
} = require('../lib/password-reset');

const a = hashSecret('hello-secret');
assert.ok(verifySecret('hello-secret', a.salt, a.hash));
assert.ok(!verifySecret('nope', a.salt, a.hash));
assert.ok(!verifySecret('', a.salt, a.hash));

const { token, hash, exp } = createResetToken();
assert.ok(resetTokenMatches(token, hash, exp));
assert.ok(!resetTokenMatches('00' + token.slice(2), hash, exp));
assert.ok(!resetTokenMatches(token, hash, Date.now() - 1000));

assert.strictEqual(normalizeEmail('  A@B.COM '), 'a@b.com');
assert.ok(isEmail('a@b.com'));
assert.ok(!isEmail('not-an-email'));
assert.ok(passwordStrongEnough('abcdefgh'));
assert.ok(!passwordStrongEnough('short'));

process.env.ADMIN_PASSWORD = 'env-admin-secret';
const { checkAdminAuth, passwordsMatch } = require('../lib/admin-auth');
assert.ok(passwordsMatch('env-admin-secret', 'env-admin-secret'));

(async () => {
  const ok = await checkAdminAuth({ headers: { 'x-admin-password': 'env-admin-secret' } });
  assert.strictEqual(ok.ok, true, 'env admin password must still work');
  const bad = await checkAdminAuth({ headers: { 'x-admin-password': 'wrong' } });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.status, 401);

  const files = {
    store: fs.readFileSync(path.join(__dirname, '../api/store.js'), 'utf8'),
    platform: fs.readFileSync(path.join(__dirname, '../api/platform.js'), 'utf8'),
    reviews: fs.readFileSync(path.join(__dirname, '../api/reviews.js'), 'utf8'),
    campaigns: fs.readFileSync(path.join(__dirname, '../api/campaigns.js'), 'utf8'),
    auth: fs.readFileSync(path.join(__dirname, '../api/auth.js'), 'utf8'),
    amb: fs.readFileSync(path.join(__dirname, '../api/ambassador.js'), 'utf8'),
    ambAuth: fs.readFileSync(path.join(__dirname, '../lib/ambassador-auth.js'), 'utf8'),
    consoleHtml: fs.readFileSync(path.join(__dirname, '../console.html'), 'utf8'),
    adminHtml: fs.readFileSync(path.join(__dirname, '../admin-site/index.html'), 'utf8'),
    ambHtml: fs.readFileSync(path.join(__dirname, '../ambassador-site/index.html'), 'utf8'),
  };
  assert.ok(files.store.includes('await checkAdminAuth'), 'store API must await admin auth');
  assert.ok(files.platform.includes('await auth(event)'), 'platform API must await admin auth');
  assert.ok(files.reviews.includes('await checkAdminAuth'), 'reviews API must await admin auth');
  assert.ok(files.campaigns.includes('await checkAdminAuth'), 'campaigns API must await admin auth');
  assert.ok(files.auth.includes("action === 'forgot-admin'"), 'auth API must handle admin forgot');
  assert.ok(files.auth.includes("action === 'reset-admin'"), 'auth API must handle admin reset');
  assert.ok(files.amb.includes("action === 'forgot-password'"), 'ambassador API must handle forgot');
  assert.ok(files.amb.includes("action === 'reset-password'"), 'ambassador API must handle reset');
  assert.ok(files.ambAuth.includes('async function requireAdmin'), 'requireAdmin must be async');
  assert.ok(files.consoleHtml.includes('forgotForm'), 'console login must have forgot form');
  assert.ok(files.adminHtml.includes('forgotForm'), 'admin login must have forgot form');
  assert.ok(files.ambHtml.includes('forgotForm'), 'ambassador login must have forgot form');

  console.log('ok: password reset');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
