/**
 * Shared admin auth — no default password fallback.
 * Accepts X-Admin-Password or a signed httpOnly session cookie (menesadmin).
 */
'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'menes_admin';
const SESSION_MAX_AGE_SEC = 60 * 60 * 12;

function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || '').trim();
}

function adminAuthConfigured() {
  return Boolean(getAdminPassword());
}

function headerValue(event, name) {
  const target = String(name || '').toLowerCase();
  if (!target) return '';
  const pick = (obj) => {
    if (!obj) return '';
    for (const [key, value] of Object.entries(obj)) {
      if (String(key).toLowerCase() !== target) continue;
      if (Array.isArray(value)) return String(value[0] || '');
      return String(value || '');
    }
    return '';
  };
  return pick(event?.headers) || pick(event?.multiValueHeaders);
}

function passwordsMatch(provided, expected) {
  const p = String(provided || '').trim();
  const e = String(expected || '').trim();
  const a = crypto.createHash('sha256').update(p).digest();
  const b = crypto.createHash('sha256').update(e).digest();
  return crypto.timingSafeEqual(a, b) && p === e && e.length > 0;
}

function sessionSecret() {
  const password = getAdminPassword();
  if (!password) return Buffer.alloc(32);
  return crypto.createHash('sha256').update(`menes-admin-session:v1:${password}`).digest();
}

function signSession(expiresAt) {
  const body = Buffer.from(JSON.stringify({ v: 1, exp: expiresAt })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = crypto.createHash('sha256').update(sig).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b) || sig !== expected) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1 || !Number(payload.exp)) return null;
  if (Number(payload.exp) < Date.now()) return null;
  return payload;
}

function parseCookies(event) {
  const header = headerValue(event, 'cookie');
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function sessionCookieValue(event) {
  return parseCookies(event)[COOKIE_NAME] || '';
}

function cookieFlags(event, { clear = false } = {}) {
  const maxAge = clear ? 0 : SESSION_MAX_AGE_SEC;
  const parts = [
    `${COOKIE_NAME}=${clear ? '' : signSession(Date.now() + SESSION_MAX_AGE_SEC * 1000)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  const host = headerValue(event, 'x-forwarded-host') || headerValue(event, 'host');
  const proto = headerValue(event, 'x-forwarded-proto') || '';
  if (proto === 'https' || /\.netlify\.app$/i.test(host) || /(^|\.)mymenes\.com$/i.test(host)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function sessionCookieHeader(event) {
  return cookieFlags(event, { clear: false });
}

function clearSessionCookieHeader(event) {
  return cookieFlags(event, { clear: true });
}

function passwordFromEvent(event) {
  const header = headerValue(event, 'x-admin-password').trim();
  if (header && !looksLikeKeyString(header)) return header;
  const authorization = headerValue(event, 'authorization').trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const token = bearer[1].trim();
    if (!looksLikeKeyString(token)) return token;
  }
  return '';
}

function looksLikeKeyString(value) {
  return String(value || '').startsWith('menes_live_') || String(value || '').startsWith('menes_test_');
}

function apiKeyFromEvent(event) {
  const dedicated = headerValue(event, 'x-menes-api-key').trim();
  if (dedicated) return dedicated;
  const authorization = headerValue(event, 'authorization').trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer && looksLikeKeyString(bearer[1].trim())) return bearer[1].trim();
  const passwordHeader = headerValue(event, 'x-admin-password').trim();
  if (looksLikeKeyString(passwordHeader)) return passwordHeader;
  return '';
}

function checkAdminAuth(event) {
  const expected = getAdminPassword();
  if (!expected) {
    return { ok: false, status: 503, error: 'ADMIN_PASSWORD non configuré sur le serveur' };
  }
  const provided = passwordFromEvent(event);
  if (provided && passwordsMatch(provided, expected)) {
    return { ok: true, via: 'password' };
  }
  if (verifySessionToken(sessionCookieValue(event))) {
    return { ok: true, via: 'cookie' };
  }
  return { ok: false, status: 401, error: 'Non autorisé' };
}

async function authorizeAdmin(event, { scopes = [] } = {}) {
  const sync = checkAdminAuth(event);
  if (sync.ok) return { ...sync, scopes: require('./api-keys').ALL_SCOPES.slice() };
  const presented = apiKeyFromEvent(event);
  if (!presented) return sync;
  const { verifyApiKey, hasScopes } = require('./api-keys');
  const key = await verifyApiKey(presented);
  if (!key) return { ok: false, status: 401, error: 'Clé API invalide ou révoquée' };
  const auth = { ok: true, via: 'api_key', keyId: key.id, name: key.name, scopes: key.scopes };
  if (scopes.length && !hasScopes(auth, scopes)) {
    return {
      ok: false,
      status: 403,
      error: `Clé API : permission insuffisante (${scopes.join(', ')})`,
      via: 'api_key',
      scopes: key.scopes,
    };
  }
  return auth;
}

function createLoginSession(event, password) {
  const expected = getAdminPassword();
  if (!expected) {
    return { ok: false, status: 503, error: 'ADMIN_PASSWORD non configuré sur le serveur' };
  }
  if (!passwordsMatch(password, expected)) {
    return { ok: false, status: 401, error: 'Mot de passe incorrect' };
  }
  return {
    ok: true,
    cookie: sessionCookieHeader(event),
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  getAdminPassword,
  adminAuthConfigured,
  checkAdminAuth,
  authorizeAdmin,
  apiKeyFromEvent,
  passwordsMatch,
  headerValue,
  passwordFromEvent,
  verifySessionToken,
  signSession,
  sessionCookieValue,
  sessionCookieHeader,
  clearSessionCookieHeader,
  createLoginSession,
};
