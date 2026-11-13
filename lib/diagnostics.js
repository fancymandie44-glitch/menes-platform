'use strict';

const { adminAuthConfigured } = require('./admin-auth');
const { secretFlags } = require('./tracking-core');

function flag(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function buildReport({ healthOk, blobsOk, storeOrders, trackingSummary, pingMs } = {}) {
  const secrets = secretFlags();
  const checks = [
    { id: 'admin_auth', label: 'ADMIN_PASSWORD', ok: adminAuthConfigured(), action: adminAuthConfigured() ? '' : 'Définis ADMIN_PASSWORD sur Netlify.' },
    { id: 'health', label: '/api/health', ok: healthOk === true, action: healthOk ? '' : 'La boutique API ne répond pas.' },
    { id: 'blobs', label: 'Netlify Blobs menes-data', ok: blobsOk === true, action: blobsOk ? '' : 'Blobs inaccessibles — vérifie le site ID / token.' },
    { id: 'stripe', label: 'Stripe', ok: flag('STRIPE_SECRET_KEY'), action: flag('STRIPE_SECRET_KEY') ? '' : 'Ajoute STRIPE_SECRET_KEY pour le checkout carte.' },
    { id: 'paypal', label: 'PayPal', ok: flag('PAYPAL_CLIENT_ID') && flag('PAYPAL_CLIENT_SECRET'), optional: true, action: '' },
    { id: 'email', label: 'Email (Resend/SMTP)', ok: flag('RESEND_API_KEY') || flag('SMTP_HOST'), optional: true, action: '' },
    { id: 'meta_capi', label: 'Meta CAPI token', ok: secrets.metaCapi, optional: true, action: secrets.metaCapi ? '' : 'Ajoute META_CAPI_TOKEN (jamais dans le frontend).' },
    { id: 'tiktok_events', label: 'TikTok Events token', ok: secrets.tiktokEvents, optional: true, action: secrets.tiktokEvents ? '' : 'Ajoute TIKTOK_EVENTS_TOKEN.' },
    { id: 'ga4_mp', label: 'GA4 Measurement Protocol', ok: secrets.ga4Mp, optional: true, action: secrets.ga4Mp ? '' : 'Ajoute GA4_API_SECRET.' },
  ];
  const required = checks.filter((c) => !c.optional);
  const failed = required.filter((c) => !c.ok);
  const warn = checks.filter((c) => c.optional && !c.ok);
  let score = 100;
  score -= failed.length * 22;
  score -= warn.length * 4;
  if (pingMs > 2000) score -= 8;
  score = Math.max(0, Math.min(100, score));
  let grade = 'healthy';
  if (failed.length) grade = 'failed';
  else if (warn.length || score < 85) grade = 'attention';
  return {
    at: new Date().toISOString(),
    score,
    grade,
    pingMs: pingMs || null,
    orders: Number(storeOrders) || 0,
    tracking: trackingSummary || null,
    shopify: {
      connected: false,
      reason: 'MENES n’utilise pas Shopify. Source de vérité: Netlify Blobs + Stripe/PayPal/Square.',
    },
    checks,
    failed: failed.map((c) => c.id),
  };
}

module.exports = { buildReport, flag };
