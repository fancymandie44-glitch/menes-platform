'use strict';

const assert = require('assert');
const keys = require('../lib/api-keys');
const { authorizeAdmin } = require('../lib/admin-auth');
const {
  createProduct,
  patchProduct,
  setInventory,
  patchOrder,
  productSummary,
  findProduct,
} = require('../lib/merchant-api');
const keysApi = require('../api/keys');
const v1Api = require('../api/v1');
const platform = require('../lib/platform');

keys.useMemoryStore();

const savedPassword = process.env.ADMIN_PASSWORD;
process.env.ADMIN_PASSWORD = 'owner-secret';

(async () => {
  const created = await keys.createKey({ name: 'IA boutique', scopes: keys.AI_PRESET });
  assert.ok(created.secret.startsWith('menes_live_'));
  assert.ok(created.key.prefix.startsWith('menes_live_'));
  assert.ok(!created.key.hash, 'never expose hash');
  assert.ok(created.key.scopes.includes('products:write'));

  const listed = await keys.listKeys();
  assert.strictEqual(listed.length, 1);
  assert.ok(!listed[0].hash);

  const verified = await keys.verifyApiKey(created.secret);
  assert.ok(verified);
  assert.strictEqual(verified.id, created.key.id);

  assert.strictEqual(await keys.verifyApiKey('menes_live_deadbeefdeadbeefdeadbeef'), null);
  assert.strictEqual(await keys.verifyApiKey('owner-secret'), null);

  const viaKey = await authorizeAdmin({
    headers: { authorization: `Bearer ${created.secret}` },
  }, { scopes: ['products:read'] });
  assert.strictEqual(viaKey.ok, true);
  assert.strictEqual(viaKey.via, 'api_key');

  const missingScope = await authorizeAdmin({
    headers: { 'x-menes-api-key': created.secret },
  }, { scopes: ['store:write'] });
  assert.strictEqual(missingScope.ok, false);
  assert.strictEqual(missingScope.status, 403);

  const viaPassword = await authorizeAdmin({
    headers: { 'x-admin-password': 'owner-secret' },
  }, { scopes: ['store:write'] });
  assert.strictEqual(viaPassword.ok, true);
  assert.strictEqual(viaPassword.via, 'password');

  const store = {
    site: { name: 'MENES', currency: 'CAD' },
    products: [{ id: 'hoodie', name: 'Hoodie', price: 90, stock: 4, active: true, variants: [] }],
    orders: [{
      id: 'M100',
      status: 'paid',
      total: 90,
      customer: { name: 'A', email: 'a@test.com' },
      items: [{ id: 'hoodie', qty: 1 }],
      stockDecremented: true,
    }],
    customers: [{ id: 'cus_a', email: 'a@test.com', name: 'A' }],
  };
  const createdProduct = createProduct(store, { name: 'Casquette', price: 45, stock: 12 });
  assert.ok(createdProduct.id);
  assert.strictEqual(findProduct(store, createdProduct.id).stock, 12);
  patchProduct(findProduct(store, 'hoodie'), { price: 99, active: true });
  assert.strictEqual(store.products.find((p) => p.id === 'hoodie').price, 99);
  const inv = setInventory(store, { productId: 'hoodie', stock: 8 });
  assert.strictEqual(inv.stock, 8);
  patchOrder(store, store.orders[0], { status: 'shipped', trackingNumber: '1Z999', carrier: 'Canada Post' });
  assert.strictEqual(store.orders[0].status, 'shipped');
  assert.ok(store.orders[0].trackingNumber);
  assert.strictEqual(productSummary(store.products[0]).name, 'Casquette');

  const listRes = await keysApi.handler({
    httpMethod: 'GET',
    headers: { 'x-admin-password': 'owner-secret' },
  });
  assert.strictEqual(listRes.statusCode, 200);
  assert.ok(JSON.parse(listRes.body).keys.length >= 1);

  const deniedKeys = await keysApi.handler({
    httpMethod: 'GET',
    headers: { authorization: `Bearer ${created.secret}` },
  });
  assert.strictEqual(deniedKeys.statusCode, 401, 'API keys cannot mint more keys');

  const createRes = await keysApi.handler({
    httpMethod: 'POST',
    headers: { 'x-admin-password': 'owner-secret' },
    body: JSON.stringify({ action: 'create', name: 'Read only', scopes: ['products:read'] }),
  });
  assert.strictEqual(createRes.statusCode, 201);
  const createdBody = JSON.parse(createRes.body);
  assert.ok(createdBody.secret.startsWith('menes_live_'));

  let liveStore = {
    site: { name: 'MENES', currency: 'CAD' },
    products: [{ id: 'hoodie', name: 'Hoodie', price: 90, stock: 4, active: true, variants: [] }],
    orders: [{ id: 'M100', status: 'paid', total: 90, customer: { name: 'A', email: 'a@test.com' }, items: [] }],
    customers: [],
  };
  const origRead = platform.readSiteStore;
  const origWrite = platform.writeSiteStore;
  const origResolve = platform.resolveSiteId;
  const origSet = platform.setLambdaEvent;
  platform.setLambdaEvent = () => {};
  platform.resolveSiteId = async () => 'menes';
  platform.readSiteStore = async () => liveStore;
  platform.writeSiteStore = async (_id, data) => { liveStore = data; };

  const docs = await v1Api.handler({
    httpMethod: 'GET',
    path: '/api/v1',
    headers: { authorization: `Bearer ${created.secret}` },
  });
  assert.strictEqual(docs.statusCode, 200);
  assert.ok(JSON.parse(docs.body).resources.length > 3);

  const products = await v1Api.handler({
    httpMethod: 'GET',
    path: '/api/v1/products',
    headers: { 'x-menes-api-key': created.secret },
  });
  assert.strictEqual(products.statusCode, 200);
  assert.strictEqual(JSON.parse(products.body).products[0].id, 'hoodie');

  const patched = await v1Api.handler({
    httpMethod: 'PATCH',
    path: '/api/v1/products/hoodie',
    headers: { authorization: `Bearer ${created.secret}` },
    body: JSON.stringify({ price: 110, stock: 6 }),
  });
  assert.strictEqual(patched.statusCode, 200);
  assert.strictEqual(JSON.parse(patched.body).product.price, 110);
  assert.strictEqual(liveStore.products[0].stock, 6);

  const readOnly = await v1Api.handler({
    httpMethod: 'POST',
    path: '/api/v1/products',
    headers: { authorization: `Bearer ${createdBody.secret}` },
    body: JSON.stringify({ name: 'Nope' }),
  });
  assert.strictEqual(readOnly.statusCode, 403);

  const revoked = await keys.revokeKey(created.key.id);
  assert.ok(revoked.revokedAt);
  const afterRevoke = await authorizeAdmin({
    headers: { authorization: `Bearer ${created.secret}` },
  });
  assert.strictEqual(afterRevoke.ok, false);

  platform.readSiteStore = origRead;
  platform.writeSiteStore = origWrite;
  platform.resolveSiteId = origResolve;
  platform.setLambdaEvent = origSet;

  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  console.log('ok: api keys + merchant REST');
})().catch((err) => {
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  console.error(err);
  process.exit(1);
});
