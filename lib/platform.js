const DEFAULT_PLATFORM = {
  version: 1,
  defaultSiteId: 'menes',
  sites: [{
    id: 'menes',
    name: 'MENES',
    slug: 'menes',
    brand: 'Luxe streetwear · Grillz · Accessoires',
    domains: ['boutiquemenes.netlify.app'],
    netlifyUrl: 'https://boutiquemenes.netlify.app',
    status: 'active',
    plan: 'pro',
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
};

const DEFAULT_STORE = {
  site: {
    name: 'MENES',
    tagline: 'Luxe streetwear · Qualité premium',
    heroTitle: 'PORTEZ L\'EXCELLENCE.',
    heroSubtitle: 'Vêtements et accessoires conçus pour ceux qui ne suivent pas la mode — ils la créent.',
    currency: 'CAD',
    sections: { announcement: true, trustBar: true, why: true, gallery: true, bundle: true, emailCapture: true, faq: true, guarantee: true },
  },
  products: [],
  orders: [],
  customers: [],
  discounts: [],
  collections: [
    { id: 'vetements', name: 'Vêtements', active: true },
    { id: 'grillz', name: 'Grillz', active: true },
    { id: 'accessoires', name: 'Accessoires', active: true },
  ],
};

function storeKey(siteId) {
  return `store:${siteId}`;
}

const BLOB_STORE = 'menes-data';
const DEFAULT_SITE_ID = '2098727e-c606-4c3e-a8fe-15c6b1469067';

let _lambdaEvent = null;

function setLambdaEvent(event) {
  _lambdaEvent = event || null;
}

function prepareBlobsContext() {
  if (_lambdaEvent?.blobs) {
    const { connectLambda } = require('@netlify/blobs');
    connectLambda(_lambdaEvent);
    return true;
  }
  return Boolean(
    globalThis.netlifyBlobsContext
    || process.env.NETLIFY_BLOBS_CONTEXT
  );
}

async function getBlobStore() {
  const { getStore } = require('@netlify/blobs');

  if (prepareBlobsContext()) {
    return getStore(BLOB_STORE);
  }

  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || DEFAULT_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name: BLOB_STORE, siteID, token });
  }

  return getStore(BLOB_STORE);
}

async function readPlatform() {
  try {
    const store = await getBlobStore();
    const data = await store.get('platform', { type: 'json' });
    if (data?.sites?.length) return data;
  } catch {}
  return DEFAULT_PLATFORM;
}

async function writePlatform(data) {
  const store = await getBlobStore();
  await store.setJSON('platform', data);
}

async function readSiteStore(siteId) {
  try {
    const store = await getBlobStore();
    const keyed = await store.get(storeKey(siteId), { type: 'json' });
    if (keyed) return keyed;
    if (siteId === 'menes') {
      const legacy = await store.get('store', { type: 'json' });
      if (legacy) {
        await store.setJSON(storeKey('menes'), legacy);
        return legacy;
      }
    }
  } catch {}

  try {
    const base = process.env.URL || process.env.DEPLOY_URL || '';
    const res = await fetch(`${base}/data/store.json`);
    if (res.ok && siteId === 'menes') return await res.json();
  } catch {}

  return JSON.parse(JSON.stringify(DEFAULT_STORE));
}

async function writeSiteStore(siteId, data) {
  const store = await getBlobStore();
  await store.setJSON(storeKey(siteId), data);
  if (siteId === 'menes') await store.setJSON('store', data);
}

function normalizeHost(host) {
  return String(host || '').split(':')[0].toLowerCase().replace(/^www\./, '');
}

async function resolveSiteId(host, querySiteId) {
  if (querySiteId) return querySiteId;
  const platform = await readPlatform();
  const h = normalizeHost(host);
  const match = platform.sites.find((s) => s.status !== 'archived' && (s.domains || []).some((d) => normalizeHost(d) === h));
  return match?.id || platform.defaultSiteId || 'menes';
}

function slugify(str) {
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}

function newSiteTemplate(name, slug) {
  const store = JSON.parse(JSON.stringify(DEFAULT_STORE));
  store.site.name = name;
  store.site.heroTitle = name.toUpperCase();
  store.site.tagline = `${name} · Boutique officielle`;
  return store;
}

module.exports = {
  DEFAULT_PLATFORM,
  DEFAULT_STORE,
  setLambdaEvent,
  readPlatform,
  writePlatform,
  readSiteStore,
  writeSiteStore,
  resolveSiteId,
  normalizeHost,
  slugify,
  newSiteTemplate,
};
