/**
 * Resource helpers for the merchant REST API (/api/v1).
 * Mutates a store document in memory; the caller persists it.
 */
'use strict';

const { productStockTotal, applyFulfillment, pushOrderEvent } = require('./admin-ops');
const { restockStockForOrder } = require('./order-pricing');
const { ALL_SCOPES } = require('./api-keys');

const ORDER_STATUSES = ['pending', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'refunded', 'cancelled'];

function slugId(name) {
  const slug = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || `p_${Date.now().toString(36)}`;
}

function uniqueProductId(store, name, requested) {
  const products = Array.isArray(store.products) ? store.products : [];
  let id = String(requested || slugId(name)).slice(0, 80);
  if (!id) id = slugId(name);
  if (!products.some((p) => p.id === id)) return id;
  let n = 2;
  while (products.some((p) => p.id === `${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

function findProduct(store, id) {
  return (store.products || []).find((p) => p && p.id === id) || null;
}

function findOrder(store, id) {
  return (store.orders || []).find((o) => o && o.id === id) || null;
}

function productSummary(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku || '',
    category: p.category || '',
    price: Number(p.price) || 0,
    comparePrice: Number(p.comparePrice) || 0,
    stock: productStockTotal(p),
    active: p.active !== false,
    featured: Boolean(p.featured),
    preorder: Boolean(p.preorder),
    imageCount: Array.isArray(p.images) ? p.images.length : (p.image ? 1 : 0),
    variantCount: Array.isArray(p.variants) ? p.variants.length : 0,
  };
}

function compactImages(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  return images.map((im) => {
    if (typeof im === 'string') {
      return { url: im.length > 180 && im.startsWith('data:') ? '[data-url]' : im, label: '' };
    }
    const url = String(im?.url || '');
    return {
      url: url.length > 180 && url.startsWith('data:') ? '[data-url]' : url,
      label: im?.label || '',
    };
  });
}

function productDetail(p) {
  if (!p) return null;
  return {
    ...productSummary(p),
    description: p.description || '',
    tags: p.tags || [],
    options: p.options || [],
    variants: Array.isArray(p.variants) ? p.variants : [],
    sizes: p.sizes || [],
    images: compactImages(p),
    image: typeof p.image === 'string' && p.image.startsWith('data:') && p.image.length > 180 ? '[data-url]' : (p.image || ''),
    preorderNote: p.preorderNote || '',
  };
}

function orderSummary(o) {
  if (!o) return null;
  return {
    id: o.id,
    status: o.status || 'pending',
    total: Number(o.total) || 0,
    date: o.date || o.createdAt || '',
    customer: {
      name: o.customer?.name || '',
      email: o.customer?.email || '',
      city: o.customer?.city || '',
      country: o.customer?.country || '',
    },
    itemCount: Array.isArray(o.items) ? o.items.length : 0,
    trackingNumber: o.trackingNumber || '',
    carrier: o.carrier || '',
  };
}

function patchProduct(product, body) {
  if (!product || !body || typeof body !== 'object') return product;
  const assign = (field, transform) => {
    if (!Object.prototype.hasOwnProperty.call(body, field)) return;
    product[field] = transform ? transform(body[field]) : body[field];
  };
  assign('name', (v) => String(v || '').trim().slice(0, 120));
  assign('sku', (v) => String(v || '').trim().slice(0, 60));
  assign('category', (v) => String(v || '').trim().slice(0, 60));
  assign('description', (v) => String(v || '').slice(0, 4000));
  assign('price', (v) => Math.max(0, Number(v) || 0));
  assign('comparePrice', (v) => Math.max(0, Number(v) || 0));
  assign('active', (v) => v !== false && v !== 'false');
  assign('featured', Boolean);
  assign('preorder', Boolean);
  assign('preorderNote', (v) => String(v || '').slice(0, 200));
  if (Object.prototype.hasOwnProperty.call(body, 'stock') && (!Array.isArray(product.variants) || !product.variants.length)) {
    product.stock = Math.max(0, parseInt(body.stock, 10) || 0);
  }
  if (Array.isArray(body.tags)) product.tags = body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  if (Array.isArray(body.images)) {
    product.images = body.images
      .map((im) => (typeof im === 'string' ? { url: im, label: '' } : { url: String(im.url || ''), label: String(im.label || '').trim() }))
      .filter((im) => im.url)
      .slice(0, 24);
    if (product.images[0]) product.image = product.images[0].url;
  }
  if (Array.isArray(body.variants)) {
    product.variants = body.variants.map((v) => ({
      key: String(v.key || v.label || '').slice(0, 80),
      label: String(v.label || v.key || '').slice(0, 80),
      options: v.options || {},
      stock: Math.max(0, parseInt(v.stock, 10) || 0),
    }));
    product.stock = productStockTotal(product);
  }
  return product;
}

function createProduct(store, body) {
  if (!store.products) store.products = [];
  const name = String(body?.name || '').trim();
  if (!name) {
    const err = new Error('name est requis');
    err.status = 400;
    throw err;
  }
  const product = {
    id: uniqueProductId(store, name, body.id),
    name,
    sku: String(body.sku || '').trim(),
    category: String(body.category || '').trim() || 'vetements',
    price: Math.max(0, Number(body.price) || 0),
    comparePrice: Math.max(0, Number(body.comparePrice) || 0),
    description: String(body.description || '').slice(0, 4000),
    stock: Math.max(0, parseInt(body.stock, 10) || 0),
    active: body.active !== false,
    featured: Boolean(body.featured),
    preorder: Boolean(body.preorder),
    images: [],
    variants: [],
    options: Array.isArray(body.options) ? body.options : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
  };
  patchProduct(product, body);
  store.products.unshift(product);
  return product;
}

function setInventory(store, body) {
  const productId = String(body?.productId || body?.id || '').trim();
  const product = findProduct(store, productId);
  if (!product) {
    const err = new Error('Produit introuvable');
    err.status = 404;
    throw err;
  }
  const stock = Math.max(0, parseInt(body.stock, 10) || 0);
  const variantKey = String(body.variantKey || body.variant || '').trim();
  if (variantKey && Array.isArray(product.variants) && product.variants.length) {
    const variant = product.variants.find((v) => v.key === variantKey || v.label === variantKey);
    if (!variant) {
      const err = new Error('Variante introuvable');
      err.status = 404;
      throw err;
    }
    variant.stock = stock;
    product.stock = productStockTotal(product);
    return { productId: product.id, variantKey: variant.key, stock: variant.stock, productStock: product.stock };
  }
  product.stock = stock;
  return { productId: product.id, stock: product.stock };
}

function patchOrder(store, order, body) {
  if (!order || !body) return order;
  if (body.status) {
    const status = String(body.status).trim().toLowerCase();
    if (!ORDER_STATUSES.includes(status)) {
      const err = new Error(`Statut invalide. Utilise: ${ORDER_STATUSES.join(', ')}`);
      err.status = 400;
      throw err;
    }
    const prev = order.status;
    order.status = status;
    if (status === 'shipped' && !order.shippedAt) order.shippedAt = new Date().toISOString();
    if (status === 'refunded') {
      order.refundedAt = order.refundedAt || new Date().toISOString();
      restockStockForOrder(store, order);
    }
    if (prev !== status) pushOrderEvent(order, 'status', `${prev || '—'} → ${status}`);
  }
  applyFulfillment(order, {
    trackingNumber: body.trackingNumber,
    carrier: body.carrier,
    trackingUrl: body.trackingUrl,
    status: order.status,
  });
  if (body.note) pushOrderEvent(order, 'note', String(body.note).slice(0, 400));
  return order;
}

function listInventory(store) {
  const rows = [];
  for (const p of store.products || []) {
    if (!p) continue;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length) {
      for (const v of variants) {
        rows.push({
          productId: p.id,
          name: p.name,
          variantKey: v.key,
          variant: v.label || v.key,
          sku: p.sku || '',
          stock: Math.max(0, Number(v.stock) || 0),
          active: p.active !== false,
        });
      }
    } else {
      rows.push({
        productId: p.id,
        name: p.name,
        variantKey: '',
        variant: '',
        sku: p.sku || '',
        stock: productStockTotal(p),
        active: p.active !== false,
      });
    }
  }
  return rows;
}

function listCustomers(store) {
  return (store.customers || []).map((c) => ({
    id: c.id,
    email: c.email || '',
    name: c.name || '',
    phone: c.phone || '',
    city: c.city || '',
    country: c.country || '',
    notes: c.notes || '',
    lastOrderId: c.lastOrderId || '',
    lastOrderAt: c.lastOrderAt || '',
  }));
}

function shopSummary(store) {
  const products = store.products || [];
  return {
    name: store.site?.name || '',
    currency: store.site?.currency || 'CAD',
    productCount: products.length,
    activeProductCount: products.filter((p) => p && p.active !== false).length,
    orderCount: Array.isArray(store.orders) ? store.orders.length : 0,
    customerCount: Array.isArray(store.customers) ? store.customers.length : 0,
  };
}

const API_DOCS = {
  ok: true,
  name: 'MENES Merchant API',
  base: 'https://www.mymenes.com/api/v1',
  auth: {
    header: 'Authorization: Bearer menes_live_…',
    alternate: 'X-Menes-Api-Key: menes_live_…',
  },
    scopes: ALL_SCOPES,
  resources: [
    { method: 'GET', path: '/api/v1', scopes: [], description: 'Cette documentation' },
    { method: 'GET', path: '/api/v1/products', scopes: ['products:read'] },
    { method: 'GET', path: '/api/v1/products/:id', scopes: ['products:read'] },
    { method: 'POST', path: '/api/v1/products', scopes: ['products:write'], body: { name: 'Hoodie', price: 129, stock: 10 } },
    { method: 'PATCH', path: '/api/v1/products/:id', scopes: ['products:write'], body: { price: 99, active: true } },
    { method: 'DELETE', path: '/api/v1/products/:id', scopes: ['products:write'], description: 'Désactive le produit (active=false)' },
    { method: 'GET', path: '/api/v1/orders', scopes: ['orders:read'] },
    { method: 'GET', path: '/api/v1/orders/:id', scopes: ['orders:read'] },
    { method: 'PATCH', path: '/api/v1/orders/:id', scopes: ['orders:write'], body: { status: 'shipped', trackingNumber: '1Z…', carrier: 'Canada Post' } },
    { method: 'GET', path: '/api/v1/inventory', scopes: ['products:read'] },
    { method: 'PATCH', path: '/api/v1/inventory', scopes: ['inventory:write'], body: { productId: 'hoodie-noir', variantKey: 'M', stock: 8 } },
    { method: 'GET', path: '/api/v1/customers', scopes: ['customers:read'] },
    { method: 'GET', path: '/api/v1/shop', scopes: ['store:read', 'products:read'] },
  ],
};

module.exports = {
  ORDER_STATUSES,
  slugId,
  uniqueProductId,
  findProduct,
  findOrder,
  productSummary,
  productDetail,
  orderSummary,
  patchProduct,
  createProduct,
  setInventory,
  patchOrder,
  listInventory,
  listCustomers,
  shopSummary,
  API_DOCS,
};
