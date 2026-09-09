'use strict';

const { stripeCheckout, paypalCheckout, squareCheckout } = require('../lib/payments');
const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { buildTrustedOrder } = require('../lib/order-pricing');
const { readProgram, mergeAmbassadorDiscounts } = require('../lib/ambassador-data');
const { notifyMerchant } = require('../lib/notify');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const body = JSON.parse(event.body || '{}');

    const store = await readSiteStore(siteId);
    let pricedStore = store;
    try {
      pricedStore = mergeAmbassadorDiscounts(store, await readProgram());
    } catch (e) {
      console.error('create-checkout mergeAmbassadorDiscounts', e.message);
    }

    const priced = buildTrustedOrder(pricedStore, body.order || body);
    if (priced.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: priced.error }) };
    }
    const order = priced.order;

    let result = await squareCheckout(order);
    if (result.error) result = await stripeCheckout(order, false);
    if (result.error) result = await paypalCheckout(order);
    if (result.error || !result.checkoutUrl) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: 'Paiement temporairement indisponible. Réessayez ou contactez-nous.' }),
      };
    }

    if (!store.orders) store.orders = [];
    const existing = store.orders.findIndex((o) => o.id === order.id);
    const entry = {
      ...order,
      payment: 'square',
      method: 'square',
      status: 'pending',
      date: order.date || new Date().toISOString(),
    };
    if (existing >= 0) store.orders[existing] = { ...store.orders[existing], ...entry };
    else store.orders.push(entry);
    await writeSiteStore(siteId, store);
    await notifyMerchant(order, 'Square', 'En attente de paiement', store);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ checkoutUrl: result.checkoutUrl, orderId: order.id, total: order.total }),
    };
  } catch (err) {
    console.error('create-checkout', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur serveur paiement' }) };
  }
};
