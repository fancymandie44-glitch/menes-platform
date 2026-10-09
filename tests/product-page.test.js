'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  slugifyProduct,
  productSlug,
  productPath,
  slugFromPathname,
  isColorOptionName,
  parseSwatches,
  swatchHex,
  imagesForColor,
  findProductBySlug,
} = require('../lib/product-page');

assert.strictEqual(slugifyProduct('Casquette Noir'), 'casquette-noir');
assert.strictEqual(productSlug({ id: 'hat-1', name: 'Hat' }), 'hat-1');
assert.strictEqual(productSlug({ slug: 'casquette', id: 'hat-1' }), 'casquette');
assert.strictEqual(productPath({ slug: 'casquette' }), '/produit/casquette');
assert.strictEqual(slugFromPathname('/produit/casquette'), 'casquette');
assert.strictEqual(slugFromPathname('/product/hat/'), 'hat');
assert.ok(isColorOptionName('Couleur'));
assert.ok(isColorOptionName('Color'));
assert.ok(!isColorOptionName('Taille'));

const sw = parseSwatches('Noir:#111, Beige:#d6c4a8');
assert.strictEqual(sw.Noir, '#111111');
assert.strictEqual(swatchHex('Noir', sw), '#111111');
assert.ok(swatchHex('Olive Green'), 'name dictionary supplies a hex');

const product = {
  id: 'hat',
  images: [
    { url: '/a.jpg', label: 'Noir' },
    { url: '/b.jpg', label: 'Noir' },
    { url: '/c.jpg', label: 'Beige' },
  ],
};
assert.strictEqual(imagesForColor(product, 'Noir').length, 2);
assert.strictEqual(imagesForColor(product, 'Beige')[0].url, '/c.jpg');
  const tagged = { images: [{ url: '/x.jpg', label: 'Black front' }, { url: '/y.jpg', label: 'Brown' }] };
  assert.strictEqual(imagesForColor(tagged, 'Black')[0].url, '/x.jpg');
assert.strictEqual(imagesForColor(product, 'Rouge').length, 3, 'unknown color falls back to all photos');

const found = findProductBySlug([{ id: 'hat-black', slug: 'casquette' }], 'casquette');
assert.strictEqual(found.id, 'hat-black');

const shop = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(shop.includes('openPdpFromLocation'), 'shop opens PDP from /produit URL');
assert.ok(shop.includes('applyPdpColorGallery'), 'changing color refreshes gallery');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(html.includes('id="pdpPanel"'), 'product page markup exists');
assert.ok(html.includes('lib/product-page.js'), 'helpers load on the shop');
const redirects = fs.readFileSync(path.join(__dirname, '../_redirects'), 'utf8');
assert.ok(redirects.includes('/produit/*'), 'Netlify serves /produit/* as the shop SPA');

const pub = require('../lib/public-catalog').publicProduct({
  id: 'hat', name: 'Hat', price: 40, active: true, slug: 'casquette', swatches: { Noir: '#111' }, highlights: ['x'],
});
assert.strictEqual(pub.slug, 'casquette');
assert.deepStrictEqual(pub.highlights, ['x']);

console.log('ok: product page helpers');
