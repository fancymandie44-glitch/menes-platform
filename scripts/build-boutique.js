#!/usr/bin/env node
/**
 * Assemble the public boutique into dist/ for Netlify.
 * Git deploys publish "dist" — this folder is gitignored, so a build
 * command must recreate it or the live site 404s.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const STATIC_FILES = [
  'index.html',
  'shop.css',
  'shop.js',
  'config.js',
  'paiement.html',
  'paiement.js',
  'livraison.html',
  'retours.html',
  'confidentialite.html',
  '_redirects',
  'robots.txt',
  'package.json',
  'console.html',
  'console.js',
  'console.css',
];

const REQUIRED_FILES = [
  'index.html',
  'shop.js',
  'shop.css',
  'config.js',
  'paiement.html',
  'api/store.js',
  'api/media.js',
  'api/pay.js',
  'api/confirm-order.js',
  'api/passport.js',
  'api/health.js',
  'api/auth.js',
  'api/create-checkout.js',
  'lib/platform.js',
  'lib/cors.js',
  'lib/order-pricing.js',
  'lib/admin-auth.js',
  'lib/api-keys.js',
  'lib/merchant-api.js',
  'lib/public-catalog.js',
  'api/keys.js',
  'api/v1.js',
];

const STATIC_DIRS = ['data', 'api', 'lib'];

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, path.join(DIST, rel), { recursive: true });
  return true;
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const copied = [];
  for (const file of STATIC_FILES) {
    if (copyFile(file)) copied.push(file);
  }
  for (const dir of STATIC_DIRS) {
    if (copyDir(dir)) copied.push(dir + '/');
  }

  for (const rel of REQUIRED_FILES) {
    const full = path.join(DIST, rel);
    if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
      throw new Error(`build-boutique: missing or empty dist/${rel} — refusing to publish a broken shop`);
    }
  }

  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  if (!html.includes('<title>MENES') || html.toLowerCase().includes('page not found')) {
    throw new Error('build-boutique: dist/index.html is not the boutique homepage');
  }
  if (!html.includes('passportNavBtn')) {
    throw new Error('build-boutique: homepage is missing the passport nav — stale template');
  }

  const shopJs = fs.readFileSync(path.join(DIST, 'shop.js'), 'utf8');
  if (!shopJs.includes('LOW_STOCK_LIMIT') || !shopJs.includes('PASSPORT_EMAIL_KEY')) {
    throw new Error('build-boutique: shop.js is missing required features');
  }

  console.log('Boutique dist ready:', DIST);
  console.log('Copied:', copied.join(', '));
}

main();
