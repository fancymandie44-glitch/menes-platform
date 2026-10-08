'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('./platform');
const { cleanResetToken, RESET_TTL_MS } = require('./password-reset');

const KEY_PREFIX = 'amb-pw-reset:';

function tokenBlobKey(token) {
  const clean = cleanResetToken(token);
  if (clean.length < 32) return '';
  const hash = crypto.createHash('sha256').update(clean).digest('hex');
  return KEY_PREFIX + hash;
}

async function saveAmbassadorReset({ ambassadorId, token, exp }) {
  const key = tokenBlobKey(token);
  if (!key || !ambassadorId) return;
  const store = await getBlobStore();
  await store.setJSON(key, {
    ambassadorId,
    exp: Number(exp) || (Date.now() + RESET_TTL_MS),
  });
}

async function readAmbassadorReset(token) {
  const key = tokenBlobKey(token);
  if (!key) return null;
  try {
    const store = await getBlobStore();
    const rec = await store.get(key, { type: 'json' });
    if (!rec?.ambassadorId || Date.now() > Number(rec.exp)) return null;
    return rec;
  } catch {
    return null;
  }
}

async function deleteAmbassadorReset(token) {
  const key = tokenBlobKey(token);
  if (!key) return;
  try {
    const store = await getBlobStore();
    await store.delete(key);
  } catch {
    /* ignore */
  }
}

module.exports = {
  saveAmbassadorReset,
  readAmbassadorReset,
  deleteAmbassadorReset,
  tokenBlobKey,
};
