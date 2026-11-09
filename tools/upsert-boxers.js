/**
 * Merge Grey / Red boxer SKUs into the live Netlify Blobs catalogue.
 * Usage: node tools/upsert-boxers.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');
const { BOXER, upsertInto } = require('../data/boxers');

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
  const keepId = (p) => p && !String(p.id || '').includes('boxer');
  const beforeKeep = current.products.filter(keepId).length;
  const next = upsertInto(current);
  if (next.products.filter(keepId).length < beforeKeep) {
    throw new Error('Refus: upsert would drop non-boxer products');
  }
  if (!next.products.some((p) => p.id === BOXER.id && p.active !== false)) {
    throw new Error('Refus: MENES Boxer missing after upsert');
  }
  await blobs.setJSON('store:menes', next);
  await blobs.setJSON('store', next);
  await blobs.setJSON('store:menes:backup', next);
  console.log('BOXERS LIVE', BOXER.id, 'catalogue', next.products.length, 'produits');
})().catch((e) => {
  console.error('ECHEC UPSERT BOXERS:', e.message);
  process.exit(1);
});
