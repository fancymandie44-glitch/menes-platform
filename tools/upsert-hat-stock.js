/**
 * Set live KLTR hat stock: Orange 5, Black 1, Brown 1.
 * Camo stays a virtual holiday-only count (default 5).
 * Usage: node tools/upsert-hat-stock.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

const SITE_ID = '2098727e-c606-4c3e-a8fe-15c6b1469067';
const STORE_NAME = 'menes-data';
const HAT_ID = 'menes-kltr-trucker-hat';
const TARGET = [
  { color: 'Orange', stock: 5 },
  { color: 'Black', stock: 1 },
  { color: 'Brown', stock: 1 },
];

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

function colorOf(vo) {
  return String(vo?.Color || vo?.Couleur || vo?.color || vo?.couleur || '').toLowerCase();
}

function colorKey(product) {
  const opt = (product.options || []).find((o) => /color|couleur/i.test(String(o.name || '')));
  return opt?.name || ((product.variants || [])[0]?.options?.Couleur != null ? 'Couleur' : 'Color');
}

(async () => {
  const blobs = getStore({ name: STORE_NAME, siteID: SITE_ID, token: netlifyToken() });
  const current = (await blobs.get('store:menes', { type: 'json' }))
    || (await blobs.get('store', { type: 'json' }));
  if (!current || !Array.isArray(current.products) || !current.products.length) {
    throw new Error('Refus: catalogue live introuvable ou vide');
  }
  const hat = current.products.find((p) => p && p.id === HAT_ID);
  if (!hat) throw new Error(`Refus: ${HAT_ID} introuvable`);

  const key = colorKey(hat);
  const byColor = new Map((hat.variants || []).map((v) => [colorOf(v.options || {}), v]));
  hat.variants = TARGET.map((row) => {
    const prev = byColor.get(row.color.toLowerCase()) || {};
    const options = { ...(prev.options || {}), [key]: row.color };
    return {
      ...prev,
      key: prev.key || row.color.toLowerCase(),
      label: prev.label || row.color,
      options,
      stock: row.stock,
    };
  });
  hat.stock = TARGET.reduce((n, row) => n + row.stock, 0);
  hat.active = hat.active === false ? hat.active : true;

  if (!current.inventory) current.inventory = {};
  if (!current.inventory.hats) current.inventory.hats = {};
  if (!Number.isFinite(Number(current.inventory.hats.camo))) {
    current.inventory.hats.camo = 5;
  }

  await blobs.setJSON('store:menes', current);
  await blobs.setJSON('store', current);
  console.log('HAT STOCK LIVE', {
    id: hat.id,
    stock: hat.stock,
    variants: hat.variants.map((v) => ({ color: colorOf(v.options), stock: v.stock })),
    camo: current.inventory.hats.camo,
  });
})().catch((e) => {
  console.error('ECHEC UPSERT HATS:', e.message);
  process.exit(1);
});
