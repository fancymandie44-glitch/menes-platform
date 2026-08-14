/**
 * Export live Netlify blobs (catalogue + ambassadeurs) into backups/
 * Does not touch Git. Safe to run anytime.
 */
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backups');
const SITE_ID = '2098727e-c606-4c3e-a8fe-15c6b1469067';
const STORE_NAME = 'menes-data';

function netlifyToken() {
  const cfgPath = path.join(process.env.APPDATA || '', 'netlify', 'Config', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const token = cfg.users?.[cfg.userId]?.auth?.token || process.env.NETLIFY_AUTH_TOKEN;
  if (!token) throw new Error('Connecte-toi avec: netlify login');
  return token;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function metaOfStore(store) {
  const products = Array.isArray(store?.products) ? store.products : [];
  return {
    savedAt: new Date().toISOString(),
    siteName: store?.site?.name || '',
    logo: Boolean(store?.site?.logo),
    heroImage: Boolean(store?.site?.heroImage),
    productCount: products.length,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      active: p.active !== false,
      hasImage: Boolean(p.image || (Array.isArray(p.images) && p.images.length)),
    })),
    discountCodes: (store?.discounts || []).map((d) => d.code),
    orderCount: Array.isArray(store?.orders) ? store.orders.length : 0,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const blobs = getStore({ name: STORE_NAME, siteID: SITE_ID, token: netlifyToken() });
  const listed = await blobs.list();
  const keys = (listed.blobs || []).map((b) => b.key || b).sort();
  const t = stamp();
  const dump = { savedAt: new Date().toISOString(), keys: {} };

  for (const key of keys) {
    if (String(key).startsWith('store:menes:backup:')) continue;
    const data = await blobs.get(key, { type: 'json' });
    dump.keys[key] = data;
  }

  const store = dump.keys['store:menes'] || dump.keys.store || {};
  const fullPath = path.join(OUT, `store-full-${t}.json`);
  const allPath = path.join(OUT, `platform-live-${t}.json`);
  const latestStore = path.join(OUT, 'LATEST-catalogue.json');
  const latestAll = path.join(OUT, 'LATEST-tout.json');

  fs.writeFileSync(fullPath, JSON.stringify(store));
  fs.writeFileSync(latestStore, JSON.stringify(store));
  fs.writeFileSync(path.join(OUT, `store-meta-${t}.json`), JSON.stringify(metaOfStore(store), null, 2));
  fs.writeFileSync(allPath, JSON.stringify(dump));
  fs.writeFileSync(latestAll, JSON.stringify(dump));

  const amb = dump.keys['ambassador-program'] || {};
  console.log('SAUVEGARDE OK');
  console.log('  produits =', (store.products || []).length);
  console.log('  codes promo =', (store.discounts || []).length);
  console.log('  logo / fond =', Boolean(store.site?.logo), Boolean(store.site?.heroImage));
  console.log('  ambassadeurs =', (amb.ambassadors || []).length);
  console.log('  fichier catalogue =', fullPath);
  console.log('  fichier complet =', allPath);
})().catch((e) => {
  console.error('ECHEC SAUVEGARDE:', e.message);
  process.exit(1);
});
