'use strict';

const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { setLambdaEvent, readSiteStore, writeSiteStore, resolveSiteId } = require('../lib/platform');
const { emailConfigured, notifySimple, buildPaymentReminderHtml, buildReviewAskHtml } = require('../lib/notify');
const { unpaidOrders, reviewOrders, shopOrigin, markSent } = require('../lib/merchant-jobs');

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return json(405, headers, { error: 'Method not allowed' });
  }

  const auth = checkAdminAuth(event);
  if (!auth.ok) return json(auth.status, headers, { error: auth.error });

  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers?.['x-site-id'] || event.headers?.['X-Site-Id'];

  try {
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const store = await readSiteStore(siteId);
    const origin = shopOrigin(store);
    const unpaid = unpaidOrders(store);
    const reviews = reviewOrders(store);
    const sent = { reminders: 0, reviews: 0, skipped: 0, errors: [] };

    if (!emailConfigured()) {
      return json(200, headers, {
        ok: true,
        emailConfigured: false,
        pending: { reminders: unpaid.length, reviews: reviews.length },
        sent,
        hint: 'Configure RESEND / BREVO / SMTP pour envoyer les relances.',
      });
    }

    for (const order of unpaid) {
      const to = String(order.customer.email).trim().toLowerCase();
      const result = await notifySimple({
        to,
        subject: `MENES · Ta commande #${order.id} t’attend`,
        html: buildPaymentReminderHtml(order, origin),
        store,
      });
      if (result?.ok) {
        markSent(order, 'reminderSentAt');
        sent.reminders += 1;
      } else {
        sent.errors.push(result?.error || `reminder ${order.id}`);
      }
    }
    for (const order of reviews) {
      const to = String(order.customer.email).trim().toLowerCase();
      const result = await notifySimple({
        to,
        subject: `MENES · Ton avis sur la commande #${order.id}`,
        html: buildReviewAskHtml(order, origin),
        store,
      });
      if (result?.ok) {
        markSent(order, 'reviewAskSentAt');
        sent.reviews += 1;
      } else {
        sent.errors.push(result?.error || `review ${order.id}`);
      }
    }

    if (sent.reminders || sent.reviews) await writeSiteStore(siteId, store);
    return json(200, headers, { ok: true, emailConfigured: true, sent });
  } catch (err) {
    return json(500, headers, { error: err.message || 'Erreur relances' });
  }
};
