'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const redirects = fs.readFileSync(path.join(__dirname, '..', 'admin-site', '_redirects'), 'utf8');
const toml = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'netlify.toml'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'config.js'), 'utf8');

assert.match(
  redirects,
  /\/api\/\*\s+https:\/\/boutiquemenes\.netlify\.app\/api\/:splat\s+200!/,
  'admin _redirects must force-proxy /api to the boutique Netlify site'
);
assert.doesNotMatch(redirects, /www\.mymenes\.com/, 'custom-domain proxy is not an internal Netlify rewrite');
assert.match(toml, /to = "https:\/\/boutiquemenes\.netlify\.app\/api\/:splat"/);
assert.match(toml, /force = true/);
assert.match(config, /API_BASE:\s*''/, 'admin must call same-origin /api so the session cookie stays on menesadmin');

const sw = fs.readFileSync(path.join(__dirname, '..', 'ambassador-site', 'sw.js'), 'utf8');
assert.match(sw, /menes-amb-v8/, 'ambassador service worker cache must be bumped so clients drop the old shell');

console.log('admin-site-proxy.test.js ok');
