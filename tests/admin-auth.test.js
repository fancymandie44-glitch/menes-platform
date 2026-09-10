'use strict';

const assert = require('assert');

const saved = process.env.ADMIN_PASSWORD;
process.env.ADMIN_PASSWORD = '  test-admin-secret  ';

const {
  passwordsMatch,
  checkAdminAuth,
  createLoginSession,
  COOKIE_NAME,
} = require('../lib/admin-auth');
const { corsHeaders } = require('../lib/cors');
const authApi = require('../api/auth');

assert.strictEqual(passwordsMatch('test-admin-secret', 'test-admin-secret'), true);
assert.strictEqual(passwordsMatch('  test-admin-secret  ', 'test-admin-secret'), true, 'login must trim spaces');
assert.strictEqual(passwordsMatch('wrong', 'test-admin-secret'), false);
assert.strictEqual(passwordsMatch('', 'test-admin-secret'), false);

const mixed = checkAdminAuth({
  headers: { 'X-AdMiN-PaSsWoRd': 'test-admin-secret' },
});
assert.strictEqual(mixed.ok, true, 'password header must be case-insensitive');

const arrayHeader = checkAdminAuth({
  multiValueHeaders: { 'x-admin-password': ['test-admin-secret'] },
});
assert.strictEqual(arrayHeader.ok, true, 'Netlify multiValueHeaders must work');

const noAuth = checkAdminAuth({ headers: {} });
assert.strictEqual(noAuth.ok, false);
assert.strictEqual(noAuth.status, 401);

const login = createLoginSession({ headers: { host: 'localhost:8900' } }, 'test-admin-secret');
assert.strictEqual(login.ok, true);
assert.ok(login.cookie.includes(`${COOKIE_NAME}=`));
assert.ok(login.cookie.includes('HttpOnly'));
assert.ok(!login.cookie.includes('Secure'), 'local http cookie must not require Secure');

const token = login.cookie.split(';')[0].slice(`${COOKIE_NAME}=`.length);
const viaCookie = checkAdminAuth({ headers: { cookie: `${COOKIE_NAME}=${token}` } });
assert.strictEqual(viaCookie.ok, true);
assert.strictEqual(viaCookie.via, 'cookie');

const badLogin = createLoginSession({ headers: {} }, 'nope');
assert.strictEqual(badLogin.ok, false);
assert.strictEqual(badLogin.status, 401);

async function invoke(event) {
  return authApi.handler(event);
}

(async () => {
  const meAnon = await invoke({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: { action: 'me' },
  });
  assert.strictEqual(meAnon.statusCode, 200);
  assert.strictEqual(JSON.parse(meAnon.body).authenticated, false);

  const wrong = await invoke({
    httpMethod: 'POST',
    headers: { origin: 'https://menesadmin.netlify.app' },
    queryStringParameters: { action: 'login' },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  assert.strictEqual(wrong.statusCode, 401);
  assert.ok(wrong.headers['Access-Control-Allow-Credentials'] === 'true');
  assert.strictEqual(wrong.headers['Access-Control-Allow-Origin'], 'https://menesadmin.netlify.app');

  const okLogin = await invoke({
    httpMethod: 'POST',
    headers: { host: 'localhost:8900', origin: 'https://menesadmin.netlify.app' },
    queryStringParameters: { action: 'login' },
    body: JSON.stringify({ password: 'test-admin-secret' }),
  });
  assert.strictEqual(okLogin.statusCode, 200);
  assert.strictEqual(JSON.parse(okLogin.body).ok, true);
  assert.ok(okLogin.headers['Set-Cookie']);

  const cookie = String(okLogin.headers['Set-Cookie']).split(';')[0];
  const me = await invoke({
    httpMethod: 'GET',
    headers: { cookie },
    queryStringParameters: { action: 'me' },
  });
  assert.strictEqual(JSON.parse(me.body).authenticated, true);

  const cors = corsHeaders({ headers: { origin: 'https://menesadmin.netlify.app' } });
  assert.strictEqual(cors['Access-Control-Allow-Credentials'], 'true');

  if (saved === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = saved;

  console.log('ok: admin session auth');
})().catch((err) => {
  if (saved === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = saved;
  console.error(err);
  process.exit(1);
});
