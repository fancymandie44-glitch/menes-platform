'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const seo = require('../lib/seo');

assert.strictEqual(seo.SITE_ORIGIN, 'https://www.mymenes.com');
assert.strictEqual(seo.productSlug({ id: 'summer-socks', name: 'Summer socks' }), 'summer-socks');
assert.strictEqual(seo.productPath({ id: 'Hat Noir' }), '/produit/hat-noir');
assert.strictEqual(
  seo.productCanonicalUrl({ id: 'summer-socks' }),
  'https://www.mymenes.com/produit/summer-socks',
);
assert.strictEqual(seo.productSlugFromPath('/produit/summer-socks/'), 'summer-socks');
assert.strictEqual(seo.productSlugFromPath('/'), '');

const products = [
  { id: 'summer-socks', name: 'Summer Socks', active: true, price: 29, image: '/images/products/socks/black.jpg', description: 'Premium crew socks.' },
  { id: 'hat', name: 'Hat', active: false, price: 40 },
];
assert.strictEqual(seo.findProductBySlug(products, 'summer-socks').id, 'summer-socks');

const reviews = [
  {
    productId: 'summer-socks',
    status: 'approved',
    authorName: 'Wassila',
    rating: 5,
    body: 'Dopeee',
    createdAt: '2026-10-20',
  },
  {
    productId: 'summer-socks',
    status: 'pending',
    authorName: 'Skip',
    rating: 5,
    body: 'nope',
  },
  {
    productId: 'hat',
    status: 'approved',
    authorName: 'Dave',
    rating: 5,
    body: 'fits',
  },
];

const json = seo.productJsonLd(products[0], reviews, { name: 'MENES', currency: 'CAD' });
assert.strictEqual(json['@type'], 'Product');
assert.strictEqual(json.url, 'https://www.mymenes.com/produit/summer-socks');
assert.ok(json.image[0].startsWith('https://www.mymenes.com/images/'));
assert.strictEqual(json.offers.price, '29.00');
assert.strictEqual(json.aggregateRating.reviewCount, '1');
assert.strictEqual(json.review.length, 1);
assert.strictEqual(json.review[0].author.name, 'Wassila');

const html = `<!DOCTYPE html><html><head>
<title>OLD</title>
<meta name="description" content="old">
<meta property="og:url" content="https://boutiquemenes.netlify.app/">
<link rel="canonical" href="https://boutiquemenes.netlify.app/">
</head><body>shop</body></html>`;

const injected = seo.injectProductPage(html, products[0], reviews, { name: 'MENES' });
assert.ok(injected.includes('<title>Summer Socks | MENES</title>'));
assert.ok(injected.includes('https://www.mymenes.com/produit/summer-socks'));
assert.ok(!injected.includes('boutiquemenes.netlify.app'));
assert.ok(injected.includes('application/ld+json'));
assert.ok(injected.includes('AggregateRating'));
assert.ok(injected.includes('og:image'));

const home = seo.injectHomePage(html, { name: 'MENES' });
assert.ok(home.includes('https://www.mymenes.com/'));
assert.ok(home.includes('WebSite'));

const map = seo.sitemapXml(products);
assert.ok(map.includes('https://www.mymenes.com/</loc>'));
assert.ok(map.includes('https://www.mymenes.com/produit/summer-socks'));
assert.ok(!map.includes('/produit/hat'), 'inactive products stay out of the sitemap');

const shopJs = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shopJs.includes("SITE_ORIGIN = 'https://www.mymenes.com'"), 'shop uses the public domain');
assert.ok(shopJs.includes('/produit/'), 'shop uses clean product paths');
assert.ok(shopJs.includes('application/ld+json'), 'shop writes Product JSON-LD');
assert.ok(shopJs.includes('function applySeo'), 'applySeo still exists');
assert.ok(shopJs.includes('openProductFromLocation'), 'boot opens /produit/:slug');
assert.ok(shopJs.includes('function renderLookbook'), 'lookbook section is wired');
assert.ok(shopJs.includes('function openPdp(id, fromRoot, navOpts'), 'PDP history opts must not clash with product options');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(indexHtml.includes('https://www.mymenes.com/'));
assert.ok(indexHtml.includes('<base href="/">'), 'product URLs need root-relative assets');
assert.ok(indexHtml.includes('src="/shop.js'), 'shop.js is root-relative');
assert.ok(!indexHtml.includes('boutiquemenes.netlify.app'), 'homepage canonical is not the Netlify subdomain');
assert.ok(indexHtml.includes('id="lookbook"'), 'homepage has the drop lookbook');
assert.ok(indexHtml.includes('nav_story'), 'nav uses Story, not Looks');
assert.ok(!indexHtml.includes('nav_looks'), 'Looks is removed from the nav');
assert.ok(fs.existsSync(path.join(__dirname, '../images/lookbook/drop-table.jpg')), 'drop table photo is in the repo');
assert.ok(fs.existsSync(path.join(__dirname, '../images/lookbook/cyan-window.jpg')), 'sock lifestyle photos are in the repo');

const ship = fs.readFileSync(path.join(__dirname, '../livraison.html'), 'utf8');
assert.ok(ship.includes('contact@mymenes.com'), 'shipping page uses the public email');
assert.ok(ship.includes('menes_vs1'), 'shipping page uses the streetwear Instagram');
assert.ok(!ship.includes('menes_jewelry'), 'shipping page must not point to the jewelry IG');
assert.ok(!ship.includes('menes.store'), 'shipping page must not use the old email');
assert.ok(ship.includes('https://www.mymenes.com/livraison'), 'shipping page has a public canonical');

const robots = fs.readFileSync(path.join(__dirname, '../robots.txt'), 'utf8');
assert.ok(robots.includes('Sitemap: https://www.mymenes.com/sitemap.xml'));
assert.ok(robots.includes('Allow: /produit/'));

const redirects = fs.readFileSync(path.join(__dirname, '../_redirects'), 'utf8');
assert.ok(redirects.includes('/produit/*'));
assert.ok(redirects.includes('/sitemap.xml'));

const toml = fs.readFileSync(path.join(__dirname, '../netlify.toml'), 'utf8');
assert.ok(toml.includes('/produit/*'));
assert.ok(toml.includes('seo-page'));

const { productUrl } = require('../lib/health-monitor');
assert.strictEqual(
  productUrl('https://www.mymenes.com', { id: 'summer-socks' }),
  'https://www.mymenes.com/produit/summer-socks',
);
assert.ok(!fs.readFileSync(path.join(__dirname, '../lib/health-monitor.js'), 'utf8').includes('/?product='));

const catalog = require('../lib/public-catalog');
const pub = catalog.publicProduct({ id: 'summer-socks', name: 'Socks', price: 29, active: true });
assert.strictEqual(pub.slug, 'summer-socks');

console.log('ok: canonical, product URLs, and Google Product JSON-LD');
