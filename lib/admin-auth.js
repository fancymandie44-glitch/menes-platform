/**
 * Shared admin auth — Netlify env ADMIN_PASSWORD, plus optional blob override after reset.
 */
const crypto = require('crypto');
const { getBlobStore } = require('./platform');
const { hashSecret, verifySecret, createResetToken, resetTokenMatches } = require('./password-reset');

const BLOB_KEY = 'admin-login';

function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || '').trim();
}

function adminAuthConfigured() {
  return Boolean(getAdminPassword());
}

function passwordsMatch(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(a, b) && String(provided) === String(expected);
}

function providedPassword(event) {
  const h = event?.headers || {};
  return h['x-admin-password'] || h['X-Admin-Password'] || '';
}

async function readAdminLogin() {
  try {
    const store = await getBlobStore();
    const data = await store.get(BLOB_KEY, { type: 'json' });
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

async function writeAdminLogin(data) {
  const store = await getBlobStore();
  await store.setJSON(BLOB_KEY, data);
}

async function checkAdminAuth(event) {
  const provided = providedPassword(event);
  const blob = await readAdminLogin();
  if (blob.passwordHash && blob.passwordSalt && verifySecret(provided, blob.passwordSalt, blob.passwordHash)) {
    return { ok: true, source: 'reset' };
  }
  const expected = getAdminPassword();
  if (expected && passwordsMatch(provided, expected)) {
    return { ok: true, source: 'env' };
  }
  if (!expected && !blob.passwordHash) {
    return { ok: false, status: 503, error: 'ADMIN_PASSWORD non configuré sur le serveur' };
  }
  return { ok: false, status: 401, error: 'Non autorisé' };
}

async function requestAdminReset() {
  const current = await readAdminLogin();
  const { token, hash, exp } = createResetToken();
  await writeAdminLogin({
    ...current,
    resetHash: hash,
    resetExp: exp,
  });
  return { token, exp };
}

async function completeAdminReset(token, password) {
  const current = await readAdminLogin();
  if (!resetTokenMatches(token, current.resetHash, current.resetExp)) {
    return { ok: false, status: 400, error: 'Lien expiré ou déjà utilisé. Demande-en un nouveau.' };
  }
  const { salt, hash } = hashSecret(password);
  await writeAdminLogin({
    passwordSalt: salt,
    passwordHash: hash,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

module.exports = {
  getAdminPassword,
  adminAuthConfigured,
  checkAdminAuth,
  passwordsMatch,
  requestAdminReset,
  completeAdminReset,
};
