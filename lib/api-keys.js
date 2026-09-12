/**
 * Hashed merchant API keys (Shopify-style).
 * Plaintext is shown once at creation; only sha256 hashes are stored.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_PREFIX = 'menes_live_';
const BLOB_KEY = 'api_keys';
const ALL_SCOPES = [
  'products:read',
  'products:write',
  'orders:read',
  'orders:write',
  'inventory:write',
  'customers:read',
  'store:read',
  'store:write',
];
const AI_PRESET = [
  'products:read',
  'products:write',
  'orders:read',
  'orders:write',
  'inventory:write',
  'customers:read',
  'store:read',
];

let memoryOnly = false;
let memoryDoc = { keys: [] };

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

function hashesMatch(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc || { keys: [] }));
}

function publicKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes.slice() : [],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt || null,
    revokedAt: row.revokedAt || null,
  };
}

function sanitizeScopes(input) {
  const wanted = Array.isArray(input) ? input : [];
  const unique = [];
  for (const raw of wanted) {
    const scope = String(raw || '').trim();
    if (!ALL_SCOPES.includes(scope)) continue;
    if (!unique.includes(scope)) unique.push(scope);
  }
  return unique;
}

function keysFilePath() {
  return path.join(process.cwd(), 'data', 'api-keys.json');
}

function useMemoryStore() {
  memoryOnly = true;
  memoryDoc = { keys: [] };
}

function resetMemoryStore() {
  memoryDoc = { keys: [] };
}

async function readFromBlobs() {
  const { getBlobStore } = require('./platform');
  const store = await getBlobStore();
  const data = await store.get(BLOB_KEY, { type: 'json' });
  if (data && Array.isArray(data.keys)) return { keys: data.keys };
  return null;
}

async function writeToBlobs(doc) {
  const { getBlobStore } = require('./platform');
  const store = await getBlobStore();
  await store.setJSON(BLOB_KEY, doc);
}

function readFromFile() {
  const raw = fs.readFileSync(keysFilePath(), 'utf8');
  const data = JSON.parse(raw);
  if (data && Array.isArray(data.keys)) return { keys: data.keys };
  return null;
}

function writeToFile(doc) {
  const file = keysFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8');
}

async function readKeysDoc() {
  if (memoryOnly) return cloneDoc(memoryDoc);
  try {
    const fromBlobs = await readFromBlobs();
    if (fromBlobs) return fromBlobs;
  } catch { /* local / tests */ }
  try {
    const fromFile = readFromFile();
    if (fromFile) return fromFile;
  } catch { /* first run */ }
  return cloneDoc(memoryDoc);
}

async function writeKeysDoc(doc) {
  const next = { keys: Array.isArray(doc?.keys) ? doc.keys : [] };
  if (memoryOnly) {
    memoryDoc = cloneDoc(next);
    return;
  }
  let persisted = false;
  try {
    await writeToBlobs(next);
    persisted = true;
  } catch { /* fall through */ }
  try {
    writeToFile(next);
    persisted = true;
  } catch { /* ignore */ }
  memoryDoc = cloneDoc(next);
  if (!persisted && !memoryOnly) {
    memoryOnly = true;
  }
}

function looksLikeApiKey(value) {
  const raw = String(value || '').trim();
  return raw.startsWith(KEY_PREFIX) && raw.length > KEY_PREFIX.length + 16;
}

function createSecret() {
  return `${KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
}

async function listKeys() {
  const doc = await readKeysDoc();
  return doc.keys.map(publicKey);
}

async function createKey({ name, scopes } = {}) {
  const label = String(name || '').trim().slice(0, 80) || 'Clé API';
  const resolved = sanitizeScopes(scopes && scopes.length ? scopes : AI_PRESET);
  if (!resolved.length) {
    const err = new Error('Choisis au moins une permission');
    err.status = 400;
    throw err;
  }
  const secret = createSecret();
  const row = {
    id: `key_${crypto.randomBytes(8).toString('hex')}`,
    name: label,
    prefix: secret.slice(0, KEY_PREFIX.length + 8),
    hash: hashSecret(secret),
    scopes: resolved,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  const doc = await readKeysDoc();
  doc.keys.unshift(row);
  if (doc.keys.length > 40) doc.keys.length = 40;
  await writeKeysDoc(doc);
  return { key: publicKey(row), secret };
}

async function revokeKey(id) {
  const wanted = String(id || '').trim();
  const doc = await readKeysDoc();
  const row = doc.keys.find((k) => k.id === wanted);
  if (!row) {
    const err = new Error('Clé introuvable');
    err.status = 404;
    throw err;
  }
  if (!row.revokedAt) row.revokedAt = new Date().toISOString();
  await writeKeysDoc(doc);
  return publicKey(row);
}

async function verifyApiKey(secret) {
  if (!looksLikeApiKey(secret)) return null;
  const presented = hashSecret(secret);
  const doc = await readKeysDoc();
  const row = doc.keys.find((k) => !k.revokedAt && hashesMatch(k.hash, presented));
  if (!row) return null;
  row.lastUsedAt = new Date().toISOString();
  try { await writeKeysDoc(doc); } catch { /* non-blocking */ }
  return publicKey(row);
}

function hasScopes(auth, needed) {
  if (!auth?.ok) return false;
  if (auth.via === 'password' || auth.via === 'cookie') return true;
  const have = Array.isArray(auth.scopes) ? auth.scopes.slice() : [];
  if (have.includes('products:write') && !have.includes('products:read')) have.push('products:read');
  if (have.includes('orders:write') && !have.includes('orders:read')) have.push('orders:read');
  if (have.includes('store:write') && !have.includes('store:read')) have.push('store:read');
  return (needed || []).every((scope) => have.includes(scope));
}

module.exports = {
  KEY_PREFIX,
  ALL_SCOPES,
  AI_PRESET,
  hashSecret,
  looksLikeApiKey,
  useMemoryStore,
  resetMemoryStore,
  listKeys,
  createKey,
  revokeKey,
  verifyApiKey,
  hasScopes,
  publicKey,
  sanitizeScopes,
};
