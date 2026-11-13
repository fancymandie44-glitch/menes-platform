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
    'lib/commerce-intel.js',
    'lib/tracking-core.js',
    'api/intel.js',
    'api/track.js',
    'api/diagnostics.js',
    'console-control.js',
    'shop-track.js',
    'lib/order-pricing.js',
    'lib/cors.js',
    'lib/platform.js',
    'lib/passport.js',
    'lib/passport-email.js',
    'lib/notify.js',
    'data/store.json',
    'images/products/socks/black.jpg',
    'images/products/socks/green.jpg',
    'images/products/socks/kltr-orange.jpg',
    'images/products/boxers/grey.jpg',
    'images/products/boxers/grey-worn.jpg',
    'images/products/boxers/red.jpg',
    'images/products/boxers/red-worn.jpg',
    'images/lookbook/drop-table.jpg',
    'images/community/hat-outdoor.jpg',
    'images/community/street-point.jpg',
    'images/community/dj-chain.jpg',
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
  assert(html.includes('id="consentBar"'), 'homepage must include the consent bar');
  assert(html.includes('shop-track.js'), 'homepage must load storefront tracking');
  assert(html.includes('id="shopBundles"'), 'homepage must include the bundles section');
  assert(html.includes('id="shopBundlesFast"'), 'homepage must include holiday fast-buy buttons');
  assert(html.includes('id="shopBundlesTimer"'), 'homepage must include the bundle drop timer');
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
  const bundleJs = fs.readFileSync(path.join(DIST, 'data/bundles.js'), 'utf8');
  const shopBundlesJs = fs.readFileSync(path.join(DIST, 'shop-bundles.js'), 'utf8');
  assert(bundleJs.includes("DROP_AT = '2026-11-20T00:00:00-05:00'"), 'drop is Nov 20 midnight Eastern');
  assert(shopBundlesJs.includes('startDropTimer'), 'bundle UI must tick the drop clock');
  assert(shopBundlesJs.includes('canHold'), 'packs can sit in the cart before the drop');
  assert(shopJs.includes('cartHasLockedBundle'), 'checkout must stay locked until Nov 20');
  assert(shopBundlesJs.includes('pairAvailable'), 'sold-out pairs must show as unavailable');
  assert(shopBundlesJs.includes('data-hat'), 'holiday pack lets shoppers pick a hat');
  assert(bundleJs.includes("id: 'camo'"), 'camo hat is the priority holiday pick');
  assert(bundleJs.includes('limit: 3') && bundleJs.includes('limit: 5'), 'essentials 3 / holiday 5');
  assert(!/Only \d+ packs/i.test(bundleJs), 'customers must not see Only N packs');
  assert(!/packs seulement/i.test(bundleJs), 'customers must not see N packs seulement');
  assert(shopJs.includes('Holiday season is here'), 'after the drop the timer copy is gone');
  assert(shopJs.includes('COMMUNITY_PHOTOS'), 'community gallery must include We Wear MENES photos');
  assert(shopJs.includes('/images/community/hat-outdoor.jpg'), 'community hat photo must ship with the shop');
  assert(shopJs.includes('function galleryDedupeKey'), 'instagram data-uri posts must not collapse into one tile');
  assert(shopJs.includes("withoutBundles.unshift('shopBundles')"), 'holiday bundles must pin to the top of the page');
  assert(shopJs.includes('Pay Nov 20 at midnight'), 'holiday announcement must keep payment on Nov 20');
  assert(!/FREE shipping Canada/i.test(shopJs.match(/HOLIDAY_ANNOUNCE = \{[\s\S]*?\};/)?.[0] || ''), 'top bar must not say free shipping Canada');
  assert(shopJs.includes('HOLIDAY_FREE_SHIPPING'), 'holiday free shipping flag');
  assert(shopJs.includes('passport_pieces'), 'passport must show purchased pieces');
  assert(shopJs.includes('Open my passport') || html.includes('Open my passport'), 'entry overlay asks for passport email');
  assert(shopJs.includes('PASSPORT_GATE_SKIP_KEY'), 'passport gate skip is session-only');
  assert(shopJs.includes("submitVipEmail") && shopJs.includes("'entry'"), 'entry overlay claims a passport');
  assert(shopJs.includes('consumePassportMagicLink'), 'email CTA must open the passport');
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
