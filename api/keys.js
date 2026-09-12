'use strict';

const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { listKeys, createKey, revokeKey, ALL_SCOPES, AI_PRESET } = require('../lib/api-keys');

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const auth = checkAdminAuth(event);
  if (!auth.ok) {
    return json(auth.status, headers, { error: auth.error });
  }

  try {
    if (event.httpMethod === 'GET') {
      const keys = await listKeys();
      return json(200, headers, { ok: true, keys, scopes: ALL_SCOPES, preset: AI_PRESET });
    }

    if (event.httpMethod === 'POST') {
      let payload = {};
      try { payload = JSON.parse(event.body || '{}'); } catch {
        return json(400, headers, { error: 'JSON invalide' });
      }
      const action = String(payload.action || '').toLowerCase();
      if (action === 'create' || !action) {
        const created = await createKey({ name: payload.name, scopes: payload.scopes });
        return json(201, headers, {
          ok: true,
          key: created.key,
          secret: created.secret,
          warning: 'Copie la clé maintenant. Elle ne sera plus affichée.',
        });
      }
      if (action === 'revoke') {
        const key = await revokeKey(payload.id);
        return json(200, headers, { ok: true, key });
      }
      return json(400, headers, { error: 'Action invalide (create|revoke)' });
    }

    return json(405, headers, { error: 'Method not allowed' });
  } catch (err) {
    return json(err.status || 500, headers, { error: err.message || 'Erreur clés API' });
  }
};
