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
    'shop.css',
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
    'api/confirm-order.js',
    'lib/public-catalog.js',
    'lib/order-pricing.js',
    'lib/cors.js',
    'lib/platform.js',
    'lib/passport.js',
    'lib/copilot-config.js',
    'lib/seo.js',
    'api/copilot.js',
    'api/seo-page.js',
    'api/sitemap.js',
    'api/site-health.js',
    'console-copilot.js',
    'data/store.json',
    'images/products/socks/black.jpg',
    'images/products/socks/green.jpg',
    'images/products/socks/kltr-orange.jpg',
    'images/lookbook/drop-table.jpg',
    'images/lookbook/crew-steps.jpg',
  ];

  for (const rel of required) {
    const full = path.join(DIST, rel);
    assert(fs.existsSync(full), `missing dist/${rel}`);
    assert(fs.statSync(full).size > 0, `empty dist/${rel}`);
  }

  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert(html.includes('<title>MENES'), 'dist/index.html is not the boutique homepage');
  assert(html.includes('https://www.mymenes.com/'), 'homepage canonical must be www.mymenes.com');
  assert(!html.includes('boutiquemenes.netlify.app'), 'dist homepage must not canonicalize to Netlify');
  assert(!html.toLowerCase().includes('page not found'), 'dist/index.html looks like a 404 page');

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
