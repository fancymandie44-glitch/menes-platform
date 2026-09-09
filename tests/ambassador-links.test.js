'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ambassadorShopLink, shopBaseUrl, slugify } = require('../lib/ambassador-data');

assert.strictEqual(shopBaseUrl({}), 'https://www.mymenes.com');
assert.strictEqual(
  ambassadorShopLink({ shopBaseUrl: 'https://www.mymenes.com/' }, 'Jonathan Élite!'),
  'https://www.mymenes.com/r/jonathan-elite'
);
assert.strictEqual(ambassadorShopLink({}, 'alex'), 'https://www.mymenes.com/r/alex');
assert.strictEqual(ambassadorShopLink({}, ''), 'https://www.mymenes.com');
assert.strictEqual(slugify('Alex_99'), 'alex-99');

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes("parts[0] === 'r' && parts[1]"), 'shop must read /r/{slug}');
assert.ok(shopJs.includes('parts.length === 1'), 'shop must read /{slug} personal links');

const redirects = fs.readFileSync(path.join(__dirname, '../_redirects'), 'utf8');
assert.ok(redirects.includes('/r/*'), '_redirects missing /r/*');
assert.ok(/\/\*\s+\/index\.html\s+200/.test(redirects), '_redirects missing SPA fallback');

const toml = fs.readFileSync(path.join(__dirname, '../netlify.toml'), 'utf8');
assert.ok(toml.includes('from = "/*"'), 'netlify.toml missing /* SPA rewrite');

const api = fs.readFileSync(path.join(__dirname, '../api/ambassador.js'), 'utf8');
assert.ok(/href="\/shop\.css/.test(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')), 'index.css must be root-absolute');
assert.ok(api.includes('ambassadorShopLink(settings, amb.slug)'), 'dashboard link must use /r/{slug}');

console.log('ok: ambassador personal links');
