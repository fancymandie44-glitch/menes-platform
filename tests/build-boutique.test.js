/**
 * Ensures the Netlify publish folder is actually built.
 * Run: node tests/build-boutique.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-boutique.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert(result.status === 0, `build failed: ${result.stderr || result.stdout}`);

  const required = [
    'index.html',
    'shop.js',
    'shop-bundles.js',
    'shop.css',
    'data/bundles.js',
    'images/bundles/holiday-exclusive.jpg',
    'images/bundles/essentials.jpg',
    'bundle/essentials/index.html',
    'images/bundles/pairs/noir.jpg',
    'images/bundles/pairs/jaune.jpg',
    'images/bundles/pairs/kultur.jpg',
    'bundle/kultur-steps/index.html',
    'bundle/holiday-exclusive/index.html',
    'sitemap.xml',
    'config.js',
    'paiement.html',
    'paiement.js',
    'livraison.html',
    'retours.html',
    'confidentialite.html',
    '_redirects',
    'robots.txt',
    'api/store.js',
    'api/media.js',
    'api/health.js',
    'api/pay.js',
    'api/address.js',
    'api/confirm-order.js',
    'lib/address.js',
    'lib/payments.js',
    'lib/public-catalog.js',
    'lib/order-pricing.js',
    'lib/cors.js',
    'lib/platform.js',
    'lib/passport.js',
    'data/store.json',
    'images/products/socks/black.jpg',
    'images/products/socks/green.jpg',
    'images/products/socks/kltr-orange.jpg',
    'images/products/boxers/grey.jpg',
    'images/products/boxers/grey-worn.jpg',
    'images/products/boxers/red.jpg',
    'images/products/boxers/red-worn.jpg',
    'images/lookbook/drop-table.jpg',
  ];

  for (const file of ['shop-bundles.js', 'shop.js', 'data/bundles.js']) {
    const check = spawnSync(process.execPath, ['--check', path.join(DIST, file)], { encoding: 'utf8' });
    assert(check.status === 0, `${file} syntax error: ${check.stderr || check.stdout}`);
  }

  for (const rel of required) {
    const full = path.join(DIST, rel);
    assert(fs.existsSync(full), `missing dist/${rel}`);
    assert(fs.statSync(full).size > 0, `empty dist/${rel}`);
  }

  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert(html.includes('<title>MENES'), 'dist/index.html is not the boutique homepage');
  assert(!html.toLowerCase().includes('page not found'), 'dist/index.html looks like a 404 page');
  assert(html.includes('id="shopBundles"'), 'homepage must include the bundles section');
  assert(html.includes('id="shopBundlesFast"'), 'homepage must include holiday fast-buy buttons');
  assert(html.includes('Shop the holiday drop'), 'hero CTA must send shoppers to bundles');
  assert(html.includes('id="lookbook"'), 'homepage must include L\'histoire / lookbook');
  assert(html.includes('images/lookbook/drop-table.jpg'), 'lookbook must use the drop-table photo');
  assert(html.includes('id="lookbookStory"'), 'story copy mount must exist');
  assert(!html.includes('lookbook-strip'), 'street strip must not duplicate gallery photos');
  assert(html.includes('data-i18n="nav_story"'), 'nav must include Story / L\'histoire');
  const shopJs = fs.readFileSync(path.join(DIST, 'shop.js'), 'utf8');
  assert(/tribute|hommage/i.test(shopJs), 'story must include the tribute copy');
  assert(shopJs.includes('one of the most hated neighborhoods'), 'story must use one of the most, not the most');
  assert(shopJs.includes('LOOKBOOK_STREET'), 'community gallery must include street lookbook photos');
  assert(shopJs.includes("withoutBundles.unshift('shopBundles')"), 'holiday bundles must pin to the top of the page');
  assert(shopJs.includes('Holiday season is here'), 'holiday announcement must be in English');
  assert(shopJs.includes('HOLIDAY_FREE_SHIPPING'), 'holiday free shipping flag');
  assert(shopJs.includes('passport_pieces'), 'passport must show purchased pieces');
  const kultur = fs.readFileSync(path.join(DIST, 'bundle/kultur-steps/index.html'), 'utf8');
  assert(kultur.includes('/bundle/kultur-steps'), 'kultur page must have a clean URL');
  assert(kultur.includes('application/ld+json'), 'kultur page must include JSON-LD');
  assert(shopJs.includes('function productPackImages'), 'grid must prefer pack shots over lookbook dupes');

  const { ALLOWED_ORIGINS } = require(path.join(DIST, 'lib/cors.js'));
  assert(ALLOWED_ORIGINS.includes('https://mymenes.com'), 'CORS missing https://mymenes.com');
  assert(ALLOWED_ORIGINS.includes('https://www.mymenes.com'), 'CORS missing https://www.mymenes.com');

  const { mediaKeys } = require(path.join(DIST, 'api/media.js'));
  const keys = mediaKeys('menes', 'ef27c16f55add5fcccee');
  assert(keys.includes('media:menes:ef27c16f55add5fcccee'), 'media key should include site-prefixed blob key');
  assert(keys.includes('media:ef27c16f55add5fcccee'), 'media key should include id-only blob key');

  console.log('ok: boutique dist contains the shop homepage and API');
}

run();
