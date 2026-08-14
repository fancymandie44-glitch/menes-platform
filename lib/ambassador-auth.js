/**
 * Ambassador auth — scrypt passwords + HMAC session tokens.
 * Roles validated server-side only. Never trust client role claims.
 */

const crypto = require('crypto');
const { getAdminPassword } = require('./admin-auth');

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  AMBASSADOR: 'AMBASSADOR',
  AMBASSADOR_LEADER: 'AMBASSADOR_LEADER',
  AMBASSADOR_ELITE: 'AMBASSADOR_ELITE',
};

const AMBASSADOR_ROLES = new Set([
  ROLES.AMBASSADOR,
  ROLES.AMBASSADOR_LEADER,
  ROLES.AMBASSADOR_ELITE,
]);

const ADMIN_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);

function tokenSecret() {
  return process.env.AMBASSADOR_TOKEN_SECRET
    || process.env.ADMIN_PASSWORD
    || 'menes-ambassador-dev-secret';
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), useSalt, 64).toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const { hash } = hashPassword(password, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromB64url(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
}

function signToken(payload, ttlHours = 720) {
  const body = {
    ...payload,
    exp: Date.now() + ttlHours * 3600 * 1000,
    iat: Date.now(),
  };
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', tokenSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, error: 'Token invalide' };
  }
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', tokenSecret()).update(data).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, error: 'Signature invalide' };
    }
  } catch {
    return { ok: false, error: 'Signature invalide' };
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(data));
  } catch {
    return { ok: false, error: 'Payload invalide' };
  }
  if (!payload?.exp || Date.now() > payload.exp) {
    return { ok: false, error: 'Session expirée' };
  }
  return { ok: true, payload };
}

function getBearer(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return h['x-ambassador-token'] || h['X-Ambassador-Token'] || '';
}

function requireAmbassador(event, program, opts = {}) {
  const token = getBearer(event);
  const verified = verifyToken(token);
  if (!verified.ok) return { ok: false, status: 401, error: verified.error };

  const amb = (program.ambassadors || []).find((a) => a.id === verified.payload.aid);
  if (!amb) return { ok: false, status: 401, error: 'Compte introuvable' };
  if (amb.status === 'suspended') return { ok: false, status: 403, error: 'Compte suspendu' };
  if (amb.status === 'pending' && !opts.allowPending) {
    return { ok: false, status: 403, error: 'Compte en attente d\'approbation' };
  }
  if (amb.status === 'rejected') return { ok: false, status: 403, error: 'Compte refusé' };

  return { ok: true, ambassador: amb, payload: verified.payload };
}

function requireAdmin(event) {
  const expected = getAdminPassword();
  if (!expected) {
    return { ok: false, status: 503, error: 'ADMIN_PASSWORD non configuré' };
  }
  const auth = event.headers?.['x-admin-password'] || event.headers?.['X-Admin-Password'] || '';
  if (auth !== expected) {
    return { ok: false, status: 401, error: 'Non autorisé' };
  }
  return { ok: true, role: ROLES.SUPER_ADMIN };
}

function normalizeRole(role) {
  const r = String(role || ROLES.AMBASSADOR).toUpperCase();
  if (Object.values(ROLES).includes(r)) return r;
  return ROLES.AMBASSADOR;
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

function isAmbassadorRole(role) {
  return AMBASSADOR_ROLES.has(role);
}

function publicAmbassador(a, opts = {}) {
  if (!a) return null;
  const base = {
    id: a.id,
    displayName: a.displayName,
    slug: a.slug,
    role: a.role,
    rankId: a.rankId,
    xp: a.xp || 0,
    status: a.status,
    photoUrl: a.photoUrl || '',
    promoCode: a.promoCode,
    createdAt: a.createdAt,
    onboardingStep: a.onboardingStep || 0,
    onboardingComplete: Boolean(a.onboardingComplete),
  };
  if (opts.private) {
    return {
      ...base,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone || '',
      bio: a.bio || '',
      referredBy: a.referredBy || null,
      agreementAcceptedAt: a.agreementAcceptedAt || null,
      stats: a.stats || {},
      badges: a.badges || [],
      notificationPrefs: a.notificationPrefs || defaultNotificationPrefs(),
      streakDays: a.streakDays || 0,
      lastActiveAt: a.lastActiveAt,
    };
  }
  return base;
}

function defaultNotificationPrefs() {
  return {
    email: true,
    sales: true,
    commission: true,
    challenges: true,
    campaigns: true,
    community: true,
    announcements: true,
    push: true,
  };
}

module.exports = {
  ROLES,
  AMBASSADOR_ROLES,
  ADMIN_ROLES,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  getBearer,
  requireAmbassador,
  requireAdmin,
  normalizeRole,
  isAdminRole,
  isAmbassadorRole,
  publicAmbassador,
  defaultNotificationPrefs,
};
