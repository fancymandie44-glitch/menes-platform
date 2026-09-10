/**
 * Admin session API used by https://menesadmin.netlify.app
 * POST /api/auth?action=login  { password }
 * POST /api/auth?action=logout
 * GET  /api/auth?action=me
 */
'use strict';

const { corsHeaders } = require('../lib/cors');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const {
  checkAdminAuth,
  createLoginSession,
  clearSessionCookieHeader,
} = require('../lib/admin-auth');

function headersWithCookie(event, setCookie) {
  const headers = corsHeaders(event);
  if (setCookie) headers['Set-Cookie'] = setCookie;
  return headers;
}

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const params = event.queryStringParameters || {};
  const action = String(params.action || '').toLowerCase();

  try {
    if (event.httpMethod === 'GET' && (action === 'me' || !action)) {
      const auth = checkAdminAuth(event);
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          ok: true,
          authenticated: Boolean(auth.ok),
        }),
      };
    }

    if (event.httpMethod === 'POST' && action === 'login') {
      const ip = clientIp(event);
      if (!allowRequest(`admin-login:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
        return tooManyRequests(cors);
      }
      let body = {};
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Requête invalide' }) };
      }
      const result = createLoginSession(event, body.password);
      if (!result.ok) {
        return {
          statusCode: result.status,
          headers: cors,
          body: JSON.stringify({ error: result.error, ok: false }),
        };
      }
      return {
        statusCode: 200,
        headers: headersWithCookie(event, result.cookie),
        body: JSON.stringify({ ok: true }),
      };
    }

    if (event.httpMethod === 'POST' && action === 'logout') {
      return {
        statusCode: 200,
        headers: headersWithCookie(event, clearSessionCookieHeader(event)),
        body: JSON.stringify({ ok: true }),
      };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Action invalide' }) };
  } catch {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
