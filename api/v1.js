'use strict';

const { corsHeaders } = require('../lib/cors');
const { authorizeAdmin } = require('../lib/admin-auth');
const { hasScopes } = require('../lib/api-keys');
const platform = require('../lib/platform');
const { allowRequest, tooManyRequests, clientIp } = require('../lib/rate-limit');
const {
  API_DOCS,
  findProduct,
  findOrder,
  productSummary,
  productDetail,
  orderSummary,
  createProduct,
  patchProduct,
  setInventory,
  patchOrder,
  listInventory,
  listCustomers,
  shopSummary,
} = require('../lib/merchant-api');

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function restPath(event) {
  const qp = event.queryStringParameters || {};
  if (qp.resource) {
    const id = String(qp.id || '').trim();
    return id ? `/${qp.resource}/${id}` : `/${qp.resource}`;
  }
  let path = String(event.path || event.rawPath || '');
  const rawUrl = String(event.rawUrl || '');
  if (rawUrl) {
    try { path = new URL(rawUrl).pathname || path; } catch { /* keep */ }
  }
  path = path.replace(/\/+$/, '') || '/';
  for (const marker of ['/api/v1', '/.netlify/functions/v1', '/v1']) {
    const idx = path.indexOf(marker);
    if (idx >= 0) {
      const rest = path.slice(idx + marker.length) || '/';
      return rest.startsWith('/') ? rest : `/${rest}`;
    }
  }
  return '/';
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    const err = new Error('JSON invalide');
    err.status = 400;
    throw err;
  }
}

function need(auth, scopes) {
  if (hasScopes(auth, scopes)) return null;
  return {
    ok: false,
    status: 403,
    error: `Clé API : permission insuffisante (${scopes.join(', ')})`,
  };
}

exports.handler = async (event) => {
  platform.setLambdaEvent(event);
  const headers = corsHeaders(event);
  if ((event.httpMethod || 'GET') === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const method = String(event.httpMethod || 'GET').toUpperCase();
  const auth = await authorizeAdmin(event);
  if (!auth.ok) return json(auth.status, headers, { error: auth.error });

  const limitKey = `v1:${auth.keyId || auth.via}:${clientIp(event)}`;
  if (!allowRequest(limitKey, { limit: 120, windowMs: 60_000 })) {
    return tooManyRequests(headers);
  }

  const path = restPath(event);
  const parts = path.split('/').filter(Boolean);
  const resource = parts[0] || '';
  const id = parts.slice(1).map((p) => decodeURIComponent(p)).join('/') || '';

  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers?.['x-site-id'] || event.headers?.['X-Site-Id'];

  try {
    if (!resource && method === 'GET') {
      return json(200, headers, { ...API_DOCS, via: auth.via, scopes: auth.scopes });
    }

    const siteId = await platform.resolveSiteId(host, params.site || headerSiteId);
    const store = await platform.readSiteStore(siteId);

    if (resource === 'shop' && method === 'GET') {
      if (!hasScopes(auth, ['store:read']) && !hasScopes(auth, ['products:read'])) {
        return json(403, headers, { error: 'Clé API : permission insuffisante (store:read ou products:read)' });
      }
      return json(200, headers, { ok: true, siteId, shop: shopSummary(store) });
    }

    if (resource === 'products') {
      if (method === 'GET' && !id) {
        const denied = need(auth, ['products:read']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        return json(200, headers, { ok: true, products: (store.products || []).map(productSummary) });
      }
      if (method === 'GET' && id) {
        const denied = need(auth, ['products:read']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const product = findProduct(store, id);
        if (!product) return json(404, headers, { error: 'Produit introuvable' });
        return json(200, headers, { ok: true, product: productDetail(product) });
      }
      if (method === 'POST') {
        const denied = need(auth, ['products:write']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const product = createProduct(store, parseBody(event));
        await platform.writeSiteStore(siteId, store);
        return json(201, headers, { ok: true, product: productDetail(product) });
      }
      if ((method === 'PATCH' || method === 'PUT') && id) {
        const denied = need(auth, ['products:write']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const product = findProduct(store, id);
        if (!product) return json(404, headers, { error: 'Produit introuvable' });
        patchProduct(product, parseBody(event));
        await platform.writeSiteStore(siteId, store);
        return json(200, headers, { ok: true, product: productDetail(product) });
      }
      if (method === 'DELETE' && id) {
        const denied = need(auth, ['products:write']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const product = findProduct(store, id);
        if (!product) return json(404, headers, { error: 'Produit introuvable' });
        product.active = false;
        await platform.writeSiteStore(siteId, store);
        return json(200, headers, { ok: true, product: productSummary(product) });
      }
    }

    if (resource === 'orders') {
      if (method === 'GET' && !id) {
        const denied = need(auth, ['orders:read']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const orders = (store.orders || []).slice().reverse().slice(0, 100).map(orderSummary);
        return json(200, headers, { ok: true, orders });
      }
      if (method === 'GET' && id) {
        const denied = need(auth, ['orders:read']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const order = findOrder(store, id);
        if (!order) return json(404, headers, { error: 'Commande introuvable' });
        return json(200, headers, { ok: true, order });
      }
      if ((method === 'PATCH' || method === 'PUT') && id) {
        const denied = need(auth, ['orders:write']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const order = findOrder(store, id);
        if (!order) return json(404, headers, { error: 'Commande introuvable' });
        patchOrder(store, order, parseBody(event));
        await platform.writeSiteStore(siteId, store);
        return json(200, headers, { ok: true, order: orderSummary(order) });
      }
    }

    if (resource === 'inventory') {
      if (method === 'GET') {
        const denied = need(auth, ['products:read']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        return json(200, headers, { ok: true, inventory: listInventory(store) });
      }
      if (method === 'PATCH' || method === 'POST') {
        const denied = need(auth, ['inventory:write']);
        if (denied) return json(denied.status, headers, { error: denied.error });
        const result = setInventory(store, parseBody(event));
        await platform.writeSiteStore(siteId, store);
        return json(200, headers, { ok: true, ...result });
      }
    }

    if (resource === 'customers' && method === 'GET') {
      const denied = need(auth, ['customers:read']);
      if (denied) return json(denied.status, headers, { error: denied.error });
      return json(200, headers, { ok: true, customers: listCustomers(store) });
    }

    return json(404, headers, { error: 'Ressource inconnue. GET /api/v1 pour la liste.' });
  } catch (err) {
    return json(err.status || 500, headers, { error: err.message || 'Erreur API' });
  }
};
