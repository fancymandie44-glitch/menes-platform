/**
 * Shared admin auth — no default password fallback.
 */
function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || '').trim();
}

function adminAuthConfigured() {
  return Boolean(getAdminPassword());
}

function checkAdminAuth(event) {
  const expected = getAdminPassword();
  if (!expected) {
    return { ok: false, status: 503, error: 'ADMIN_PASSWORD non configuré sur le serveur' };
  }
  const auth = event.headers?.['x-admin-password'] || event.headers?.['X-Admin-Password'] || '';
  if (auth !== expected) {
    return { ok: false, status: 401, error: 'Non autorisé' };
  }
  return { ok: true };
}

module.exports = { getAdminPassword, adminAuthConfigured, checkAdminAuth };
