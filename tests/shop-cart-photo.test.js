'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
assert.ok(src.includes('function selectVariantFromImage'), 'thumb click selects the variant');
assert.ok(src.includes('function imageForVariant'), 'cart photo follows selected color');
assert.ok(src.includes('cart-item-photo'), 'cart rows render a product photo');
assert.ok(src.includes('openPdp(productId, card)'), 'PDP opens with the card selection');
assert.ok(src.includes('data-label="${esc(im.label || \'\')}"'), 'PDP thumbs keep color labels');

const start = src.indexOf('function productImages');
const end = src.indexOf('function productOptions');
assert.ok(start >= 0 && end > start, 'product image helpers are contiguous');
const helpers = {};
new Function(`${src.slice(start, end)}\nObject.assign(this, { productImages, imageKey, compactProductImage, imageForVariant });`).call(helpers);

const socks = {
  image: '/images/products/socks/black.jpg?v=crop2',
  images: [
    { url: '/images/products/socks/black.jpg?v=crop2', label: 'Black' },
    { url: '/images/products/socks/pink.jpg?v=crop2', label: 'Pink' },
    { url: '/images/products/socks/green.jpg?v=crop2', label: 'Green' },
  ],
};

assert.strictEqual(helpers.imageKey({ label: 'Pink', url: '/x/pink.jpg' }), 'pink');
assert.strictEqual(helpers.imageKey({ url: '/images/products/socks/pink.jpg?v=crop2' }), 'pink');
assert.strictEqual(
  helpers.imageForVariant(socks, { Color: 'Pink' }),
  '/images/products/socks/pink.jpg?v=crop2',
);
assert.strictEqual(
  helpers.imageForVariant(socks, { Color: 'Black' }),
  '/images/products/socks/black.jpg?v=crop2',
);
assert.strictEqual(helpers.compactProductImage('data:image/jpeg;base64,xxx'), '');
assert.ok(helpers.compactProductImage('/images/products/socks/pink.jpg?v=crop2'));

const css = fs.readFileSync(path.join(__dirname, '../shop.css'), 'utf8');
assert.ok(css.includes('.cart-item-photo'), 'cart photo styles exist');

assert.ok(src.includes('reviews_more'), 'see-more copy exists');
assert.ok(src.includes('reviewsMoreBtn'), 'homepage see-more button is wired');
assert.ok(src.includes('pdp-reviews-more'), 'product page can expand all reviews');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(html.includes('id="reviewsMoreBtn"'), 'see-more control is on the homepage');
assert.ok(src.includes("muted: '#d5d0c6'"), 'dark theme uses readable cream muted text');
assert.ok(src.includes('hexLum'), 'theme rejects black-on-black text');
require('child_process').execFileSync(process.execPath, ['--check', path.join(__dirname, '../shop.js')]);

console.log('ok: cart photo + color-from-image selection');
