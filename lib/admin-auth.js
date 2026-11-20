/**
 * Shared admin auth — no default password fallback.
 */
const crypto = require('crypto');

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

function checkAdminAuth(event) {
  const expected = getAdminPassword();
  if (!expected) {
    return { ok: false, status: 503, error: 'ADMIN_PASSWORD non configuré sur le serveur' };
  }
  const h = event.headers || {};
  const auth = h['x-admin-password'] || h['X-Admin-Password'] || '';
  if (!passwordsMatch(auth, expected)) {
    return { ok: false, status: 401, error: 'Non autorisé' };
  }
  return { ok: true };
}

module.exports = { getAdminPassword, adminAuthConfigured, checkAdminAuth, passwordsMatch };
