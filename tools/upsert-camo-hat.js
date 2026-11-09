/**
 * Publish the camo trucker at the same price as the Kultur hat.
 * Usage: node tools/upsert-camo-hat.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');
const { CAMO_HAT, upsertInto } = require('../data/hats');

const SITE_ID = '2098727e-c606-4c3e-a8fe-15c6b1469067';
const STORE_NAME = 'menes-data';

function netlifyToken() {
  const candidates = [
    path.join(process.env.HOME || '', '.config/netlify/config.json'),
    path.join(process.env.APPDATA || '', 'netlify', 'Config', 'config.json'),
  ];
  for (const cfgPath of candidates) {
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const token = cfg.users?.[cfg.userId]?.auth?.token || process.env.NETLIFY_AUTH_TOKEN;
    if (token) return token;
  }
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  throw new Error('Connecte-toi avec: npx netlify login');
}

(async () => {
  const blobs = getStore({ name: STORE_NAME, siteID: SITE_ID, token: netlifyToken() });
  const current = (await blobs.get('store:menes', { type: 'json' }))
    || (await blobs.get('store', { type: 'json' }));
  if (!current || !Array.isArray(current.products) || !current.products.length) {
    throw new Error('Refus: catalogue live introuvable ou vide');
  }
  const before = current.products.length;
  const next = upsertInto(current);
  if (next.products.length < before) {
    throw new Error('Refus: upsert would drop products');
  }
  if (!next.products.some((p) => p.id === CAMO_HAT.id && p.active !== false && Number(p.price) === 99.99)) {
    throw new Error('Refus: camo hat missing or wrong price');
  }
  await blobs.setJSON('store:menes', next);
  await blobs.setJSON('store', next);
  await blobs.setJSON('store:menes:backup', next);
  console.log('CAMO HAT LIVE', CAMO_HAT.id, CAMO_HAT.price, 'catalogue', next.products.length);
})().catch((e) => {
  console.error('ECHEC UPSERT CAMO HAT:', e.message);
  process.exit(1);
});
