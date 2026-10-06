'use strict';

const crypto = require('crypto');

const RESET_TTL_MS = 30 * 60 * 1000;

function hashSecret(value, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), useSalt, 64).toString('hex');
  return { salt: useSalt, hash };
}

function verifySecret(value, salt, expectedHash) {
  if (!value || !salt || !expectedHash) return false;
  const { hash } = hashSecret(value, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash, exp: Date.now() + RESET_TTL_MS };
}

function resetTokenMatches(token, hash, exp) {
  if (!token || !hash || !exp || Date.now() > Number(exp)) return false;
  const got = crypto.createHash('sha256').update(String(token)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(String(hash), 'hex'));
  } catch {
    return false;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function passwordStrongEnough(password) {
  return String(password || '').length >= 8;
}

module.exports = {
  RESET_TTL_MS,
  hashSecret,
  verifySecret,
  createResetToken,
  resetTokenMatches,
  normalizeEmail,
  isEmail,
  passwordStrongEnough,
};
