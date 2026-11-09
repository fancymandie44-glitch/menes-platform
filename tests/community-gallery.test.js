'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const photos = [
  'hat-outdoor.jpg', 'street-point.jpg', 'field-duo.jpg', 'hoodie-look.jpg',
  'hallway-look.jpg', 'studio-session.jpg', 'dj-chain.jpg', 'kid-pitch.jpg',
  'painter.jpg', 'camera-selfie.jpg', 'bathtub-campaign.jpg',
  'hat-beige-studio.jpg', 'hat-black-studio.jpg', 'hat-orange-studio.jpg',
];

for (const file of photos) {
  const full = path.join(root, 'images/community', file);
  assert(fs.existsSync(full), `missing community photo ${file}`);
  assert(fs.statSync(full).size > 1000, `tiny community photo ${file}`);
}

const shop = fs.readFileSync(path.join(root, 'shop.js'), 'utf8');
assert(shop.includes('COMMUNITY_PHOTOS'), 'shop must restore community photos');
assert(shop.includes('function galleryDedupeKey'), 'posts need a unique gallery key');
assert(shop.includes('data:${img.length}'), 'data-uri posts must stay unique');

console.log('ok: community gallery photos');
