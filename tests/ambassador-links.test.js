'use strict';

const assert = require('assert');
const { publicShopBaseUrl, shopReferralLink } = require('../lib/ambassador-links');
const { defaultProgram, normalizeProgram } = require('../lib/ambassador-data');
const fs = require('fs');
const path = require('path');

assert.strictEqual(publicShopBaseUrl({}), 'https://www.mymenes.com');
assert.strictEqual(publicShopBaseUrl({ shopBaseUrl: 'https://boutiquemenes.netlify.app' }), 'https://www.mymenes.com');
assert.strictEqual(publicShopBaseUrl({ shopBaseUrl: 'http://mymenes.com' }), 'https://www.mymenes.com');

const link = shopReferralLink({ shopBaseUrl: 'https://boutiquemenes.netlify.app' }, { slug: 'Jon Élite!', promoCode: 'jon10' });
assert.ok(link.startsWith('https://www.mymenes.com/r/jon-elite?'), `link ${link}`);
assert.ok(link.includes('ref=jon-elite'), 'includes ref');
assert.ok(link.includes('promo=JON10'), 'includes promo');

const program = normalizeProgram({ settings: { shopBaseUrl: 'https://boutiquemenes.netlify.app' } });
assert.strictEqual(program.settings.shopBaseUrl, 'https://www.mymenes.com');
assert.strictEqual(defaultProgram().settings.shopBaseUrl, 'https://www.mymenes.com');

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes("params.get('promo')"), 'shop reads promo query');
assert.ok(!shopJs.includes("if (attr.promoCode && !localStorage.getItem(PROMO_KEY))"), 'ambassador promo must overwrite leftover codes');

const api = fs.readFileSync(path.join(__dirname, '../api/ambassador.js'), 'utf8');
assert.ok(api.includes('shopReferralLink'), 'dashboard tools use canonical shop link');

const redirects = fs.readFileSync(path.join(__dirname, '../_redirects'), 'utf8');
assert.ok(redirects.includes('/r/*'), '_redirects serves /r/slug as the shop');

console.log('ok: ambassador shop links point at mymenes.com/r/slug with promo');
