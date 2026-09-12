'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const consoleJs = fs.readFileSync(path.join(__dirname, '..', 'console.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin-site', 'index.html'), 'utf8');
const shopJs = fs.readFileSync(path.join(__dirname, '..', 'shop.js'), 'utf8');

assert.match(adminHtml, /id="productImageFile"[^>]*multiple/, 'product file input must accept several photos at once');
assert.match(adminHtml, /Ajouter plusieurs photos/);
assert.match(adminHtml, /productImageStudioFile/, 'studio crop remains a separate one-at-a-time path');
assert.match(consoleJs, /PHOTO_KINDS = \['Face', 'Dos', 'Côté', 'Lifestyle', 'Mannequin'\]/);
assert.match(consoleJs, /addImageFiles/);
assert.match(consoleJs, /moveImgUp/);
assert.match(shopJs, /const match = imgs\.find/);
assert.match(shopJs, /showPdpImage/);
assert.match(shopJs, /pdp-thumb-label/);

function productImages(p) {
  if (Array.isArray(p.images) && p.images.length) {
    return p.images.map((im) => (typeof im === 'string' ? { url: im, label: '' } : im)).filter((im) => im && im.url);
  }
  if (p.image) return [{ url: p.image, label: '' }];
  return [];
}

function imageForVariant(images, value) {
  const val = String(value || '').toLowerCase();
  return images.find((im) => String(im.label || '').toLowerCase() === val) || null;
}

const hoodie = {
  image: 'face.jpg',
  images: [
    { url: 'face.jpg', label: 'Face' },
    { url: 'back.jpg', label: 'Dos' },
    { url: 'street.jpg', label: 'Lifestyle' },
    { url: 'olive.jpg', label: 'Olive Green' },
  ],
};
const imgs = productImages(hoodie);
assert.equal(imgs.length, 4);
assert.equal(imageForVariant(imgs, 'dos').url, 'back.jpg');
assert.equal(imageForVariant(imgs, 'Olive Green').url, 'olive.jpg');
assert.equal(imageForVariant(imgs, 'noir'), null);
assert.equal(productImages({ image: 'only.jpg' }).length, 1);

console.log('product-gallery.test.js ok');
