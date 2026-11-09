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
  'shop-bundles.js',
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
  'shop-bundles.js',
  'shop.css',
  'config.js',
  'data/bundles.js',
  'lib/bundles.js',
  'paiement.html',
  'api/store.js',
  'api/media.js',
  'api/pay.js',
  'api/confirm-order.js',
  'api/passport.js',
  'api/health.js',
  'api/create-checkout.js',
  'api/address.js',
  'lib/platform.js',
  'lib/address.js',
  'lib/payments.js',
  'lib/cors.js',
  'lib/order-pricing.js',
  'lib/admin-auth.js',
  'lib/public-catalog.js',
  'images/products/socks/black.jpg',
  'images/products/socks/kltr-orange.jpg',
  'images/products/boxers/grey.jpg',
  'images/products/boxers/red.jpg',
  'images/bundles/pairs/noir.jpg',
  'images/bundles/pairs/kultur.jpg',
  'images/bundles/essentials.jpg',
];

const STATIC_DIRS = ['data', 'api', 'lib', 'images'];

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
  if (!html.includes('id="shopBundles"')) {
    throw new Error('build-boutique: homepage is missing the bundles section');
  }

  emitBundleSeoPages();
  writeSitemap();

  console.log('Boutique dist ready:', DIST);
  console.log('Copied:', copied.join(', '));
}

function emitBundleSeoPages() {
  const bundles = require(path.join(ROOT, 'data/bundles.js'));
  const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  for (const bundle of bundles.BUNDLES) {
    if (bundle.published === false) continue;
    const url = `${bundles.SITE_ORIGIN}/bundle/${bundle.slug}`;
    const title = bundles.loc(bundle.seoTitle, 'en') || bundles.loc(bundle.name, 'en');
    const desc = bundles.loc(bundle.seoDescription, 'en') || bundles.loc(bundle.description, 'en');
    const img = bundle.image ? `${bundles.SITE_ORIGIN}${bundle.image}` : '';
    const included = (bundles.loc(bundle.included, 'en') || []).join('. ');
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: bundles.loc(bundle.name, 'en'),
      description: `${desc} ${included}`.trim(),
      brand: { '@type': 'Brand', name: 'MENES' },
      url,
      image: img || undefined,
      offers: bundles.isPriced(bundle) ? {
        '@type': 'Offer',
        url,
        priceCurrency: bundle.currency || 'CAD',
        price: Number(bundle.price),
        availability: 'https://schema.org/InStock',
      } : undefined,
    };
    let page = template
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escAttr(desc)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escAttr(title)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escAttr(desc)}">`)
      .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escAttr(url)}">`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escAttr(url)}">`);
    if (img && !page.includes('property="og:image"')) {
      page = page.replace('</title>', `</title>\n  <meta property="og:image" content="${escAttr(img)}">`);
    }
    page = page.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n</head>`);
    const outDir = path.join(DIST, 'bundle', bundle.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), page);
  }
}

function writeSitemap() {
  const bundles = require(path.join(ROOT, 'data/bundles.js'));
  const origin = bundles.SITE_ORIGIN;
  const urls = [
    `${origin}/`,
    `${origin}/livraison.html`,
    `${origin}/retours.html`,
    `${origin}/confidentialite.html`,
  ];
  for (const bundle of bundles.BUNDLES) {
    if (bundle.published === false) continue;
    urls.push(`${origin}/bundle/${bundle.slug}`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);
}

function escHtml(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escAttr(s) {
  return String(s || '').replace(/[&"]/g, (c) => ({ '&': '&amp;', '"': '&quot;' }[c]));
}

main();
