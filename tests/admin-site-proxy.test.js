'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const redirects = fs.readFileSync(path.join(__dirname, '..', 'admin-site', '_redirects'), 'utf8');
const toml = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'netlify.toml'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'config.js'), 'utf8');
const { handler } = require('../admin-site/netlify/functions/store-proxy');

assert.match(
  config,
  /API_BASE:\s*'\/store-api'/,
  'admin must prefix API calls so they do not hit the reserved /api functions path'
);
assert.match(
  redirects,
  /\/store-api\/\*\s+\/\.netlify\/functions\/store-proxy\s+200!/,
  'admin _redirects must send /store-api to the boutique proxy function'
);
assert.doesNotMatch(redirects, /^\s*\/api\//m, '/api is reserved; do not proxy it on menesadmin');
assert.match(toml, /from = "\/store-api\/\*"/);
assert.match(toml, /to = "\/\.netlify\/functions\/store-proxy"/);
assert.match(toml, /functions = "netlify\/functions"/);

const sw = fs.readFileSync(path.join(__dirname, '..', 'ambassador-site', 'sw.js'), 'utf8');
assert.match(sw, /menes-amb-v8/, 'ambassador service worker cache must be bumped so clients drop the old shell');

(async () => {
  const me = await handler({
    httpMethod: 'GET',
    path: '/store-api/api/auth',
    queryStringParameters: { action: 'me' },
    headers: {},
  });
  assert.equal(me.statusCode, 200, 'proxy GET /api/auth?action=me');
  const json = JSON.parse(me.body);
  assert.equal(json.ok, true);
  assert.equal(typeof json.authenticated, 'boolean');

  const denied = await handler({
    httpMethod: 'POST',
    path: '/store-api/api/auth',
    queryStringParameters: { action: 'login' },
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'definitely-wrong-password' }),
  });
  assert.equal(denied.statusCode, 401, 'wrong password must be JSON 401, not HTML 404');
  const deniedJson = JSON.parse(denied.body);
  assert.equal(deniedJson.ok, false);

  const blocked = await handler({
    httpMethod: 'GET',
    path: '/store-api/secret',
    headers: {},
  });
  assert.equal(blocked.statusCode, 404);

  console.log('admin-site-proxy.test.js ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
