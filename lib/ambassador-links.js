'use strict';

const CANONICAL_SHOP = 'https://www.mymenes.com';

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function publicShopBaseUrl(settings) {
  const raw = String(settings?.shopBaseUrl || '').trim().replace(/\/$/, '');
  if (!raw) return CANONICAL_SHOP;
  if (/boutiquemenes\.netlify\.app/i.test(raw)) return CANONICAL_SHOP;
  if (/^https?:\/\/(www\.)?mymenes\.com$/i.test(raw)) return CANONICAL_SHOP;
  return raw;
}

function shopReferralLink(settings, { slug, promoCode } = {}) {
  const base = publicShopBaseUrl(settings);
  const s = slugify(slug);
  if (!s) return `${base}/`;
  const q = new URLSearchParams();
  q.set('ref', s);
  const code = String(promoCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
  if (code) q.set('promo', code);
  return `${base}/r/${encodeURIComponent(s)}?${q.toString()}`;
}

module.exports = { CANONICAL_SHOP, slugify, publicShopBaseUrl, shopReferralLink };
