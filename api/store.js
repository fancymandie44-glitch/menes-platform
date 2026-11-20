const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent, getBlobStore, storeKey } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { readProgram, mergeAmbassadorDiscounts } = require('../lib/ambassador-data');
const { publicStore } = require('../lib/public-catalog');

function storeMeta(data, extra = {}) {
  const products = Array.isArray(data?.products) ? data.products : [];
  return {
    ok: true,
    siteName: data?.site?.name || '',
    heroTitle: data?.site?.heroTitle || '',
    heroImage: Boolean(data?.site?.heroImage),
    logo: Boolean(data?.site?.logo),
    productCount: products.length,
    activeProductCount: products.filter((p) => p && p.active !== false).length,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.active !== false,
      price: p.price,
      hasImage: Boolean(p.image || (Array.isArray(p.images) && p.images.length)),
      imageCount: Array.isArray(p.images) ? p.images.length : (p.image ? 1 : 0),
    })),
    orderCount: Array.isArray(data?.orders) ? data.orders.length : 0,
    discountCount: Array.isArray(data?.discounts) ? data.discounts.length : 0,
    ...extra,
  };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];

  try {
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const auth = checkAdminAuth(event);
    const isAdmin = auth.ok;

    if (event.httpMethod === 'GET') {
      const data = await readSiteStore(siteId);
      if (isAdmin && params.meta === '1') {
        let backupMeta = null;
        try {
          const blobs = await getBlobStore();
          const backup = await blobs.get(`${storeKey(siteId)}:backup`, { type: 'json' })
            || (siteId === 'menes' ? await blobs.get('store:backup', { type: 'json' }) : null);
          if (backup) backupMeta = storeMeta(backup);
        } catch {}
        return { statusCode: 200, headers, body: JSON.stringify(storeMeta(data, { backup: backupMeta })) };
      }
      if (isAdmin && params.restore === 'backup') {
        const blobs = await getBlobStore();
        const backup = await blobs.get(`${storeKey(siteId)}:backup`, { type: 'json' })
          || (siteId === 'menes' ? await blobs.get('store:backup', { type: 'json' }) : null);
        if (!backup || !Array.isArray(backup.products) || !backup.products.length) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Aucune sauvegarde catalogue trouvée' }) };
        }
        await writeSiteStore(siteId, backup);
        return { statusCode: 200, headers, body: JSON.stringify(storeMeta(backup, { restored: true })) };
      }
      let merged = data;
      try {
        const program = await readProgram();
        merged = mergeAmbassadorDiscounts(data, program);
        // Never persist on GET — a failed blob read used to overwrite the real catalog.
      } catch (e) {
        console.error('mergeAmbassadorDiscounts', e.message);
      }
      if (isAdmin && (params.admin === '1' || params.full === '1')) {
        return { statusCode: 200, headers, body: JSON.stringify({ ...merged, _siteId: siteId }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ...publicStore({ ...merged, _siteId: siteId }) }) };
    }

    if (event.httpMethod === 'POST') {
      if (!auth.ok) {
        return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
      }
      const payload = JSON.parse(event.body || '{}');
      const targetSite = await resolveSiteId(host, payload._siteId || headerSiteId);
      delete payload._siteId;
      const current = await readSiteStore(targetSite);
      const incomingProducts = Array.isArray(payload.products) ? payload.products : [];
      const currentProducts = Array.isArray(current.products) ? current.products : [];
      if (currentProducts.length > 0 && incomingProducts.length === 0) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'Refus : sauvegarde vide (0 produit) alors que le catalogue live en contient. Recharge la page et réessaie.',
            liveProducts: currentProducts.length,
          }),
        };
      }
      if (!Array.isArray(payload.discounts) || payload.discounts.length === 0) {
        payload.discounts = Array.isArray(current.discounts) ? current.discounts.slice() : [];
      }
      if (targetSite === 'menes') {
        try {
          const program = await readProgram();
          Object.assign(payload, mergeAmbassadorDiscounts(payload, program));
        } catch (e) {
          console.error('mergeAmbassadorDiscounts POST', e.message);
        }
      }
      await writeSiteStore(targetSite, payload);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, siteId: targetSite }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur serveur catalogue' }) };
  }
};
