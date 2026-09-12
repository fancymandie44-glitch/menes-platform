'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const redirects = fs.readFileSync(path.join(__dirname, '..', 'admin-site', '_redirects'), 'utf8');
const toml = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'netlify.toml'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'config.js'), 'utf8');

assert.match(
  config,
  /API_BASE:\s*'\/store-api'/,
  'admin must prefix API calls so they do not hit the reserved /api functions path'
);
assert.match(
  redirects,
  /\/store-api\/\*\s+https:\/\/boutiquemenes\.netlify\.app\/:splat\s+200!/,
  'admin _redirects must force-proxy /store-api to the boutique Netlify site'
);
assert.doesNotMatch(redirects, /^\s*\/api\//m, '/api is reserved; do not proxy it on menesadmin');
assert.doesNotMatch(redirects, /www\.mymenes\.com/, 'custom-domain proxy is not an internal Netlify rewrite');
assert.match(toml, /from = "\/store-api\/\*"/);
assert.match(toml, /to = "https:\/\/boutiquemenes\.netlify\.app\/:splat"/);
assert.match(toml, /force = true/);

const sw = fs.readFileSync(path.join(__dirname, '..', 'ambassador-site', 'sw.js'), 'utf8');
assert.match(sw, /menes-amb-v8/, 'ambassador service worker cache must be bumped so clients drop the old shell');

const dest = 'https://boutiquemenes.netlify.app/api/auth?action=me';
fetch(dest)
  .then((res) => {
    assert.equal(res.ok, true, 'boutique auth API must be reachable');
    return res.json();
  })
  .then((json) => {
    assert.equal(json.ok, true);
    assert.equal(typeof json.authenticated, 'boolean');
    console.log('admin-site-proxy.test.js ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
