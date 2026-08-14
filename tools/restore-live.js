/**
 * Restore boutique catalogue (+ optional ambassador program) from backups/LATEST-*.json
 * Usage:
 *   node tools/restore-live.js
 *   node tools/restore-live.js --all
 */
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backups');
const SITE_ID = '2098727e-c606-4c3e-a8fe-15c6b1469067';
const STORE_NAME = 'menes-data';
const restoreAll = process.argv.includes('--all');

function netlifyToken() {
  const cfgPath = path.join(process.env.APPDATA || '', 'netlify', 'Config', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const token = cfg.users?.[cfg.userId]?.auth?.token || process.env.NETLIFY_AUTH_TOKEN;
  if (!token) throw new Error('Connecte-toi avec: netlify login');
  return token;
}

(async () => {
  const blobs = getStore({ name: STORE_NAME, siteID: SITE_ID, token: netlifyToken() });
  if (restoreAll) {
    const dump = JSON.parse(fs.readFileSync(path.join(OUT, 'LATEST-tout.json'), 'utf8'));
    const keys = dump.keys || {};
    if (keys['store:menes'] && !(keys['store:menes'].products || []).length) {
      throw new Error('Refus: le backup catalogue n a aucun produit');
    }
    for (const [key, data] of Object.entries(keys)) {
      if (data == null) continue;
      await blobs.setJSON(key, data);
      console.log('restore', key);
    }
    console.log('RESTAURATION COMPLETE OK');
    return;
  }

  const store = JSON.parse(fs.readFileSync(path.join(OUT, 'LATEST-catalogue.json'), 'utf8'));
  const n = Array.isArray(store.products) ? store.products.length : 0;
  if (!n) throw new Error('Refus: backup catalogue vide');
  await blobs.setJSON('store:menes', store);
  await blobs.setJSON('store', store);
  await blobs.setJSON('store:menes:backup', store);
  console.log('CATALOGUE RESTAURE', n, 'produits,', (store.discounts || []).length, 'codes promo');
})().catch((e) => {
  console.error('ECHEC RESTAURATION:', e.message);
  process.exit(1);
});
