'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ambassadorShopLink,
  ambassadorPublicTools,
  findAmbassadorByLinkToken,
  shopBaseUrl,
  slugify,
} = require('../lib/ambassador-data');

assert.strictEqual(shopBaseUrl({}), 'https://www.mymenes.com');
assert.strictEqual(
  ambassadorShopLink({ shopBaseUrl: 'https://www.mymenes.com/' }, 'Jonathan Élite!'),
  'https://www.mymenes.com/r/jonathan-elite'
);
assert.strictEqual(ambassadorShopLink({}, 'alex'), 'https://www.mymenes.com/r/alex');
assert.strictEqual(ambassadorShopLink({}, ''), 'https://www.mymenes.com');
assert.strictEqual(slugify('Alex_99'), 'alex-99');

const program = {
  ambassadors: [
    { slug: 'don', promoCode: 'DON10', status: 'active', displayName: 'Don' },
    { slug: 'mia', promoCode: 'MIA12', status: 'pending', displayName: 'Mia' },
    { slug: 'old', promoCode: 'OLD10', status: 'suspended', displayName: 'Old' },
  ],
};
assert.strictEqual(findAmbassadorByLinkToken(program, 'don').slug, 'don');
assert.strictEqual(findAmbassadorByLinkToken(program, 'DON10').slug, 'don');
assert.strictEqual(findAmbassadorByLinkToken(program, 'mia').status, 'pending');
assert.strictEqual(findAmbassadorByLinkToken(program, 'OLD10'), null);
assert.strictEqual(findAmbassadorByLinkToken(program, 'nobody'), null);
assert.strictEqual(
  ambassadorPublicTools({}, { slug: 'don', promoCode: 'DON10' }).link,
  'https://www.mymenes.com/r/don'
);

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes("parts[0] === 'r' && parts[1]"), 'shop must read /r/{slug}');
assert.ok(shopJs.includes('parts.length === 1'), 'shop must read /{slug} personal links');
assert.ok(shopJs.includes('`/r/${parts[1]}`'), 'shop must keep /r/{slug} in the address bar');
assert.ok(!shopJs.includes("history.replaceState({}, '', `/${clean.search}"), 'shop must not strip personal links to /');
assert.ok(shopJs.includes('showAmbassadorLinkBanner'), 'shop must show ambassador code banner');

const redirects = fs.readFileSync(path.join(__dirname, '../_redirects'), 'utf8');
assert.ok(redirects.includes('/r/*'), '_redirects missing /r/*');
assert.ok(/\/\*\s+\/index\.html\s+200/.test(redirects), '_redirects missing SPA fallback');

const toml = fs.readFileSync(path.join(__dirname, '../netlify.toml'), 'utf8');
assert.ok(toml.includes('from = "/*"'), 'netlify.toml missing /* SPA rewrite');

const api = fs.readFileSync(path.join(__dirname, '../api/ambassador.js'), 'utf8');
assert.ok(/href="\/shop\.css/.test(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')), 'index.css must be root-absolute');
assert.ok(api.includes('ambassadorPublicTools(settings, amb)'), 'dashboard link must use /r/{slug}');
assert.ok(api.includes('tools: ambassadorPublicTools(program.settings, amb)'), 'pending accounts must still get a shop link');

const track = fs.readFileSync(path.join(__dirname, '../api/ambassador-track.js'), 'utf8');
assert.ok(track.includes('findAmbassadorByLinkToken'), 'track must accept slug or promo code');

const ambApp = fs.readFileSync(path.join(__dirname, '../ambassador-site/app.js'), 'utf8');
assert.ok(ambApp.includes('function shopLinkFor'), 'ambassador app must always build /r/{slug} links');

console.log('ok: ambassador personal links');
